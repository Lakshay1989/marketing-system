import fs from "node:fs";
import path from "node:path";
import { desc, eq, gte, and } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@/db";
import { complete, extractJson, type Runner } from "../llm";

export interface CatalogProduct { slug: string; name: string; price: string; species: string[]; category: string; hero?: boolean }
export const loadCatalog = (): { products: CatalogProduct[]; boxes: { slug: string; name: string; price: string | null }[] } => JSON.parse(fs.readFileSync(path.resolve("data/kukur-catalog.json"), "utf8"));

const BANNED = [/\benerg(y|etic)\b/i, /\bheal(ing|s)?\b/i, /\bprotect(ion|s|ive)?\b/i, /well-?being/i, /\blucky\b|good luck/i, /\bcalm(ing|s)?\b/i, /chakra|aura|vibration/i, /\b(genuine|authentic|certified|real) (gem|stone|crystal|pearl)/i, /pet-safe|safe for/i, /₹/, /\brs\.?\s*\d/i, /\bprices?\b/i, /vet[- ]approved/i, /\bsafe\b/i, /\bhealth(y|ier)?\b/i, /hypoallergenic/i, /\bbest price\b/i, /\b\d+\s*%\s*off\b/i, /\bdiscount\b/i, /guarantee/i, /\bcure/i, /non-?toxic/i];
export const bannedClaim = (s: string) => BANNED.find((r) => r.test(s))?.source ?? null;
const GENERIC = [/^(check out|meet) (our|the) (new|latest)/i, /^new arrivals?/i, /^shop now/i, /^you won'?t believe/i];

const Concept = z.object({
  title: z.string().min(4).max(100), hook: z.string().min(4).max(80), format: z.enum(["reel", "story"]), platform: z.enum(["instagram", "facebook"]),
  trendTitle: z.string().optional(), productSlugs: z.array(z.string()).min(2).max(8), storyboard: z.array(z.string().min(3)).min(3).max(10),
  cta: z.string().min(3).max(80), caption: z.string().min(20).max(700),
  scores: z.object({ originality: z.number(), brandFit: z.number(), quality: z.number(), commercial: z.number() }),
});
export type ConceptDraft = z.infer<typeof Concept>;

export function strategyPrompt(trends: { title: string; adaptation: string; platform: string }[], products: CatalogProduct[], recent: string[], n: number) {
  return `You are the Creative Director for Kukur, an Indian pet store (dogs and cats). Brand: premium, warm, practical; colours forest green, cream, orange, gold; tagline "Every Tail Tells a Story."
Produce ${n} ORIGINAL content concepts for tomorrow (mix of Instagram Reels, Instagram Stories and Facebook Reels). Avoid repeating these recent concepts: ${JSON.stringify(recent)}.
Trend ideas available (adapt the idea, never copy): ${JSON.stringify(trends)}.
HERO RANGE: products whose slug starts with gem-collar- are our new hero range of gemstone-beaded collars. At least HALF of your concepts (and at least one reel and one story) must feature 3 or more different gem-collar-* products, shown by their style names. Describe them only as decorative gemstone-beaded collars with an adjustable strap, for small and medium dogs and cats: never claim energy, healing, protection, luck, calming, safety or authenticity of stones; the product is a pre-order.
Only use these real products (slug): ${products.map((p) => `${p.slug} (${p.name})`).join("; ")}.
WHAT PRODUCTION CAN ACTUALLY MAKE (propose only these): (a) REEL = a kinetic text hook (your hook), then 3-6 products shown one by one as bouncing cards with their real names (NEVER prices), then a close-up burst of a stock dog or cat photo with a word, then the Kukur logo end card; (b) STORY grid = a headline plus a grid of 3-6 products (no prices); NEVER propose polls, quizzes, questions or any Story that needs a sticker (stickers cannot be added automatically). It CANNOT film, show people, unbox, build, do before/after, step-by-step or voice-over. Do not describe scenes it cannot make.
Do NOT invent named pets, mascots, customers, testimonials, staff or events ("our resident...", "meet Biscuit"). Use only real products from the list.
Rules: no health/safety/vet claims, no discounts and NO prices of any kind in hooks, captions or storyboards (policy: reels and stories never show prices), no food or treats, no fake urgency. REACH RULES (Instagram rewards watch time, saves, shares and comments, not hashtags): the hook must stop the scroll in the first 2 seconds; at least a third of concepts must be USEFUL or EDUCATIONAL (a fit tip, a care tip, a gifting idea, a festive-safety tip) so people save and share them, not only product showcases; every caption must END WITH A QUESTION or a share prompt that invites a comment (for example: 'Which one is your pet's style?' or 'Tag a pet parent who needs this'); keep the account on one topic (pets, pet fashion, pet gifting); mention Delhi/Janakpuri only when natural. Hooks must be specific and punchy (max 8 words), not generic ("Check out our new..." is rejected). Each storyboard has 3-10 short scene descriptions.
Be a tough critic: weak, repetitive or generic ideas must score below 65. Score each concept honestly 0-100 on originality, brandFit, quality (production feasibility with motion graphics from product photos), commercial (reason to visit the store).
Reply with ONLY a JSON array of: {"title","hook","format":"reel|story","platform":"instagram|facebook","trendTitle","productSlugs":[],"storyboard":[],"cta","caption","scores":{"originality","brandFit","quality","commercial"}}`;
}

export interface Verdict { ok: boolean; reason?: string }
export function judge(c: ConceptDraft, slugs: Set<string>, existingHooks: string[]): Verdict {
  const bad = c.productSlugs.find((s) => !slugs.has(s)); if (bad) return { ok: false, reason: `unknown product ${bad}` };
  if (c.format === "reel" && c.productSlugs.length < 3) return { ok: false, reason: "a reel needs at least 3 products" };
  if (/\b(our|the) (resident|office|shop|store) (dog|cat|pet)\b|\b[Mm]eet (?!Kukur)[A-Z][a-z]+|\b[Cc]all me [A-Z][a-z]+/.test([c.hook, c.title, c.caption].join(" | "))) return { ok: false, reason: "invents a named pet or mascot" };
  const claim = bannedClaim([c.title, c.hook, c.caption, c.cta, ...c.storyboard].join(" | ")); if (claim) return { ok: false, reason: `banned claim pattern ${claim}` };
  if (GENERIC.some((r) => r.test(c.hook))) return { ok: false, reason: "generic hook" };
  if (existingHooks.some((h) => h.toLowerCase() === c.hook.toLowerCase())) return { ok: false, reason: "duplicate hook" };
  const s = c.scores; const min = Math.min(s.originality, s.brandFit, s.quality, s.commercial), avg = (s.originality + s.brandFit + s.quality + s.commercial) / 4;
  if (min < 65 || avg < 75) return { ok: false, reason: `scores too low (min ${min}, avg ${avg.toFixed(0)})` };
  return { ok: true };
}

export async function planConcepts(db: Db, deps: { runner?: Runner; n?: number; now?: Date } = {}) {
  const now = deps.now ?? new Date(); const cat = loadCatalog();
  const trends = await db.select().from(schema.trends).where(and(eq(schema.trends.status, "new"), gte(schema.trends.relevanceScore, 60))).orderBy(desc(schema.trends.relevanceScore)).limit(8);
  const recent = (await db.select().from(schema.concepts).orderBy(desc(schema.concepts.createdAt)).limit(30));
  const text = await complete(db, { purpose: "concept-planning", prompt: strategyPrompt(trends, cat.products, recent.map((r) => r.hook), deps.n ?? 6), timeoutMs: 600_000 }, deps.runner);
  const raw = extractJson<unknown[]>(text); const slugs = new Set(cat.products.map((p) => p.slug)); const hooks = recent.map((r) => r.hook);
  const out = { proposed: raw.length, approved: 0, rejected: [] as { hook: string; reason: string }[] };
  for (const item of Array.isArray(raw) ? raw : []) {
    const p = Concept.safeParse(item); if (!p.success) { out.rejected.push({ hook: String((item as any)?.hook ?? "?"), reason: "invalid shape" }); continue; }
    const c = p.data; const v = judge(c, slugs, hooks); const trend = trends.find((t) => t.title === c.trendTitle);
    await db.insert(schema.concepts).values({ trendId: trend?.id, title: c.title, hook: c.hook, storyboard: c.storyboard, format: c.format, platform: c.platform, scoreOriginality: c.scores.originality, scoreBrandFit: c.scores.brandFit, scoreQuality: c.scores.quality, scoreCommercial: c.scores.commercial, status: v.ok ? "approved_for_production" : "rejected", notes: v.reason ?? null, cta: c.cta, caption: c.caption, productSlugs: c.productSlugs, createdAt: now });
    if (v.ok) { out.approved++; hooks.push(c.hook); if (trend) await db.update(schema.trends).set({ status: "selected" }).where(eq(schema.trends.id, trend.id)); } else out.rejected.push({ hook: c.hook, reason: v.reason! });
  }
  return out;
}
