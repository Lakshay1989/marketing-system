import { z } from "zod";
import { schema, type Db } from "@/db";
import { complete, extractJson, type Runner } from "../llm";

const Trend = z.object({
  platform: z.enum(["instagram", "facebook", "both"]), title: z.string().min(5).max(140), sourceUrl: z.string().url().startsWith("https://"),
  evidence: z.string().min(20).max(600), relevance: z.number().min(0).max(100), adaptation: z.string().min(20).max(500),
});
export type TrendFinding = z.infer<typeof Trend>;

export const researchPrompt = (today: string) => `You are the Social Trend Research agent for Kukur, an Indian online pet store (dogs and cats: toys, beds, feeding, grooming, walk gear, gift boxes). Today is ${today}.
Use web search and open the pages you cite. Find 6 to 8 REAL, CURRENT (last ~45 days, or clearly upcoming seasonal) trends and creative patterns worth adapting, across: Reels/short-video formats and hooks, caption and hashtag patterns, Instagram Story sticker ideas (polls, quizzes, questions), and culturally relevant Indian seasonal moments (e.g. Diwali, winter, New Year) for pet brands. Look at pet brands in India and internationally, and adjacent consumer brands.
STRICT RULES: every item needs a sourceUrl of a page you actually opened (https). Never invent a trend, a number, a view count or a competitor result. If you cannot verify a claim, leave the item out. Describe the underlying creative idea only; propose an ORIGINAL Kukur execution, never a copy of someone's video, audio or assets. No health or safety claims about pets.
Reply with ONLY a JSON array, no prose. Each item: {"platform":"instagram|facebook|both","title":"","sourceUrl":"","evidence":"what the source shows, 1-2 sentences","relevance":0-100,"adaptation":"how Kukur could do an original version"}`;

export type UrlCheck = (url: string) => Promise<number>;
/** A source "exists" if it answers (2xx/3xx) or is a login/bot wall (401/403/429). A 404/410 or no answer means invented or dead: dropped. */
export const checkUrl: UrlCheck = async (url) => {
  try { const r = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0 (compatible; KukurMarketingAI/0.1)" } }); return r.status; } catch { return 0; }
};
const reachable = (s: number) => (s >= 200 && s < 400) || [401, 403, 429].includes(s);

export async function researchTrends(db: Db, deps: { runner?: Runner; urlCheck?: UrlCheck; now?: Date; runId?: string } = {}) {
  const now = deps.now ?? new Date();
  const text = await complete(db, { purpose: "trend-research", prompt: researchPrompt(now.toISOString().slice(0, 10)), web: true, timeoutMs: 900_000 }, deps.runner);
  const raw = extractJson<unknown[]>(text); const kept: TrendFinding[] = []; const dropped: { title: string; reason: string }[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const p = Trend.safeParse(item); if (!p.success) { dropped.push({ title: String((item as any)?.title ?? "?"), reason: "invalid shape" }); continue; }
    const status = await (deps.urlCheck ?? checkUrl)(p.data.sourceUrl);
    if (!reachable(status)) { dropped.push({ title: p.data.title, reason: `source did not verify (HTTP ${status})` }); continue; }
    kept.push(p.data);
  }
  let inserted = 0;
  for (const t of kept) {
    const r = await db.insert(schema.trends).values({ platform: t.platform, title: t.title, sourceUrl: t.sourceUrl, evidence: t.evidence, relevanceScore: Math.round(t.relevance), adaptation: t.adaptation, discoveredAt: now, runId: deps.runId }).onConflictDoNothing().returning({ id: schema.trends.id });
    inserted += r.length;
  }
  return { found: raw.length, verified: kept.length, inserted, dropped };
}
