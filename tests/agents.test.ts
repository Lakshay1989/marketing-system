import { describe, expect, it } from "vitest";
import { schema } from "@/db";
import { testDb } from "./helpers";
import { researchTrends } from "@/lib/agents/trends";
import { bannedClaim, judge, loadCatalog, planConcepts, type ConceptDraft } from "@/lib/agents/strategy";
import { complete, extractJson, BudgetError, type Runner } from "@/lib/llm";
import { setSetting } from "@/lib/settings";

const reply = (obj: unknown): Runner => async () => ({ result: "Here you go:\n```json\n" + JSON.stringify(obj) + "\n```", via: "cli", total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 20 } });
const trend = (o: object = {}) => ({ platform: "instagram", title: "Cozy winter bed reveal", sourceUrl: "https://example.com/a", evidence: "A pet brand shows a reveal of a bed with slow zoom and soft light.", relevance: 82, adaptation: "Kukur original: dusk-lit reveal of the cosy bed with a title card.", ...o });

describe("llm layer", () => {
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
  const concept = (o: Partial<ConceptDraft> = {}): ConceptDraft => ({ title: "Dusk bed reveal", hook: "Sleep looks like this", format: "reel", platform: "instagram", productSlugs: [slug], storyboard: ["slow dusk gradient", "bed rises into frame", "logo end card"], cta: "Shop at kukur.shop", caption: "Soft places to land for dogs and cats. Find yours at kukur.shop", scores: { originality: 80, brandFit: 85, quality: 78, commercial: 75 }, ...o });
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
