import { describe, expect, it, vi } from "vitest";
import { schema } from "@/db";
import { testDb } from "./helpers";
import { researchTrends } from "@/lib/agents/trends";
import { bannedClaim, judge, loadCatalog, planConcepts, type ConceptDraft } from "@/lib/agents/strategy";
import { complete, defaultRunner, extractJson, BudgetError, type Runner } from "@/lib/llm";
import { setSetting } from "@/lib/settings";
import { parseGoogleNewsResults, searxngSearch } from "@/lib/web-search";

const reply = (obj: unknown): Runner => async () => ({ result: "Here you go:\n```json\n" + JSON.stringify(obj) + "\n```", via: "cli", total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 20 } });
const trend = (o: object = {}) => ({ platform: "instagram", title: "Cozy winter bed reveal", sourceUrl: "https://example.com/a", evidence: "A pet brand shows a reveal of a bed with slow zoom and soft light.", relevance: 82, adaptation: "Kukur original: dusk-lit reveal of the cosy bed with a title card.", ...o });

describe("llm layer", () => {
  it("extracts secure Google News RSS results and decodes snippets", () => {
    const xml = '<rss><channel><item><title>Pet &amp; brand campaign</title><link>https://news.google.com/rss/articles/abc?oc=5</link><description>&lt;a&gt;A recent campaign.&lt;/a&gt;</description><source url="https://example.com">Example News</source></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>';
    expect(parseGoogleNewsResults(xml)).toEqual([{ title: "Pet & brand campaign", url: "https://news.google.com/rss/articles/abc?oc=5", snippet: "Example News — A recent campaign.", publisherUrl: "https://example.com/" }]);
  });
  it("extracts JSON from fenced or chatty replies", () => { expect(extractJson('blah ```json\n[{"a":1}]\n``` bye')).toEqual([{ a: 1 }]); expect(extractJson('x {"k":"v}"} y')).toEqual({ k: "v}" }); expect(() => extractJson("nothing")).toThrow(); });
  it("logs calls and enforces the daily call cap and monthly budget", async () => {
    const db = await testDb(); await setSetting(db, "max_llm_calls_per_day", 2);
    await complete(db, { purpose: "t", prompt: "p" }, reply([])); await complete(db, { purpose: "t", prompt: "p" }, reply([]));
    await expect(complete(db, { purpose: "t", prompt: "p" }, reply([]))).rejects.toBeInstanceOf(BudgetError);
    const db2 = await testDb(); await setSetting(db2, "monthly_ai_budget_usd", 0.015);
    await complete(db2, { purpose: "t", prompt: "p" }, reply([])); await complete(db2, { purpose: "t", prompt: "p" }, reply([]));
    await expect(complete(db2, { purpose: "t", prompt: "p" }, reply([]))).rejects.toThrow(/budget/i);
  });
  it("records failed calls", async () => { const db = await testDb(); await expect(complete(db, { purpose: "t", prompt: "p" }, async () => { throw new Error("cli down"); })).rejects.toThrow("cli down"); expect((await db.select().from(schema.llmCalls))[0].ok).toBe(false); });
  it("uses the configured local Ollama chat endpoint and refuses unsupported web research", async () => {
    const oldProvider = process.env.AI_PROVIDER; const oldBaseUrl = process.env.OLLAMA_BASE_URL;
    process.env.AI_PROVIDER = "ollama"; process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ message: { content: "[]" }, prompt_eval_count: 12, eval_count: 3 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", request);
    try {
      const result = await defaultRunner({ prompt: "Return JSON", model: "test-local-model", web: false, timeoutMs: 1000, responseFormat: "json" });
      expect(result).toMatchObject({ result: "[]", via: "ollama", total_cost_usd: 0, usage: { input_tokens: 12, output_tokens: 3 } });
      expect(request).toHaveBeenCalledWith("http://127.0.0.1:11434/api/chat", expect.objectContaining({ method: "POST" }));
      expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toMatchObject({ stream: true, think: false, format: "json" });
      await expect(defaultRunner({ prompt: "Search the web", model: "test-local-model", web: true, timeoutMs: 1000 })).rejects.toThrow(/web-search tool/);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      if (oldProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = oldProvider;
      if (oldBaseUrl === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = oldBaseUrl;
    }
  });
  it("queries a private SearXNG JSON endpoint and discards non-HTTPS results", async () => {
    const oldBase = process.env.SEARXNG_BASE_URL;
    process.env.SEARXNG_BASE_URL = "http://127.0.0.1:8080";
    const request = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toMatch(/^http:\/\/127\.0\.0\.1:8080\/search\?/);
      return new Response(JSON.stringify({ results: [
        { title: "Pet trend", url: "https://example.com/article", content: "A recent brand campaign." },
        { title: "Unsafe link", url: "http://example.com/article", content: "Should be discarded." },
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", request);
    try {
      await expect(searxngSearch("pet brand trend", 5)).resolves.toEqual([{ title: "Pet trend", url: "https://example.com/article", snippet: "A recent brand campaign." }]);
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      if (oldBase === undefined) delete process.env.SEARXNG_BASE_URL; else process.env.SEARXNG_BASE_URL = oldBase;
    }
  });
});

describe("trend research agent", () => {
  it("keeps only trends whose source URL really responds, and never duplicates", async () => {
    const db = await testDb();
    const items = [trend(), trend({ title: "Invented trend with dead link", sourceUrl: "https://example.com/dead" }), trend({ title: "Blocked but real page", sourceUrl: "https://instagram.com/x" }), { title: "bad shape" }];
    const urlCheck = async (u: string) => (u.endsWith("/dead") ? 404 : u.includes("instagram") ? 403 : 200);
    const r = await researchTrends(db, { runner: reply(items), urlCheck });
    expect(r).toMatchObject({ found: 4, verified: 2, inserted: 2 }); expect(r.dropped.map((d) => d.reason).join()).toMatch(/404/);
    const again = await researchTrends(db, { runner: reply(items), urlCheck }); expect(again.inserted).toBe(0);
    expect((await db.select().from(schema.trends)).every((t) => t.sourceUrl.startsWith("https://"))).toBe(true);
  });
});

describe("creative director", () => {
  const cat = loadCatalog(); const slug = cat.products[0].slug;
  const concept = (o: Partial<ConceptDraft> = {}): ConceptDraft => ({ title: "Dusk bed reveal", hook: "Sleep looks like this", format: "reel", platform: "instagram", productSlugs: cat.products.slice(0, 3).map((p) => p.slug), storyboard: ["slow dusk gradient", "bed rises into frame", "logo end card"], cta: "Shop at kukur.shop", caption: "Soft places to land for dogs and cats. Find yours at kukur.shop", scores: { originality: 80, brandFit: 85, quality: 78, commercial: 75 }, ...o });
  it("rejects invented mascots and reels with fewer than 3 products", () => {
    const sl = new Set(cat.products.map((p) => p.slug)); const three = cat.products.slice(0, 3).map((p) => p.slug);
    expect(judge(concept({ productSlugs: three, caption: "Meet Nugget, our resident chew-toy expert, with tips for every dog." }), sl, []).reason).toMatch(/named pet/);
    expect(judge(concept({ productSlugs: [slug, cat.products[1].slug] }), sl, []).reason).toMatch(/at least 3/);
    expect(judge(concept({ productSlugs: three }), sl, []).ok).toBe(true);
  });
  it("flags banned claims", () => { expect(bannedClaim("Vet approved comfort")).toBeTruthy(); expect(bannedClaim("20% off today")).toBeTruthy(); expect(bannedClaim("A soft bed for the cat")).toBeNull(); });
  it("rejects weak, generic, duplicate, unknown-product and claim-making concepts", () => {
    const s = new Set(cat.products.map((p) => p.slug));
    expect(judge(concept(), s, []).ok).toBe(true);
    expect(judge(concept({ hook: "Check out our new beds" }), s, []).reason).toMatch(/generic/);
    expect(judge(concept(), s, ["sleep looks like this"]).reason).toMatch(/duplicate/);
    expect(judge(concept({ productSlugs: ["made-up-thing"] }), s, []).reason).toMatch(/unknown product/);
    expect(judge(concept({ caption: "The safest bed, vet approved for every pet." }), s, []).reason).toMatch(/banned/);
    expect(judge(concept({ scores: { originality: 50, brandFit: 90, quality: 90, commercial: 90 } }), s, []).reason).toMatch(/scores/);
  });
  it("stores approved and rejected concepts with reasons", async () => {
    const db = await testDb();
    const r = await planConcepts(db, { runner: reply([concept(), concept({ hook: "Shop now and save", scores: { originality: 40, brandFit: 40, quality: 40, commercial: 40 } })]) });
    expect(r).toMatchObject({ proposed: 2, approved: 1 }); const rows = await db.select().from(schema.concepts);
    expect(rows.map((x) => x.status).sort()).toEqual(["approved_for_production", "rejected"]); expect(rows.find((x) => x.status === "rejected")!.notes).toBeTruthy();
  });
});

describe("research diversity", () => {
  it("limits how many trends can come from one website", async () => {
    const db = await testDb(); const mk = (i: number) => trend({ title: `Trend number ${i} from one blog`, sourceUrl: `https://blog.example.com/p${i}` });
    const r = await researchTrends(db, { runner: reply([mk(1), mk(2), mk(3), mk(4)]), urlCheck: async () => 200 });
    expect(r.verified).toBe(2); expect(r.dropped.map((d) => d.reason).join()).toMatch(/more than 2/);
  });
});
