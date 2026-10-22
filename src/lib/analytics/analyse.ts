import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";

export interface Insight { text: string; basis: string }
const MIN_SAMPLE = 5;

/**
 * Plain-language findings computed only from stored metrics. With few posts it says so instead of declaring winners.
 * Compares formats and hooks by views (or reach when views are missing).
 */
export async function analyse(db: Db): Promise<{ insights: Insight[]; posts: number; withMetrics: number }> {
  const rows = (await db.execute(sql`
    select p.id, p.platform, ci.format, c.hook, c.title, p.created_at,
      (select metrics from metrics_snapshots m where m.publication_id = p.id order by captured_at desc limit 1) as metrics
    from publications p join content_items ci on ci.id = p.content_item_id left join concepts c on c.id = ci.concept_id
    where p.status = 'verified'`)) as unknown as { rows: { id: string; platform: string; format: string; hook: string | null; metrics: Record<string, number | null> | null }[] };
  const posts = rows.rows.length; const withM = rows.rows.filter((r) => r.metrics);
  const score = (m: Record<string, number | null>) => m.views ?? m.reach ?? m.post_video_views ?? m.post_impressions_unique ?? m.blue_reels_play_count ?? null;
  const scored = withM.map((r) => ({ ...r, s: score(r.metrics!) })).filter((r): r is typeof r & { s: number } => r.s !== null);
  const insights: Insight[] = [];
  if (posts === 0) return { insights: [{ text: "Nothing has been published yet, so there is nothing to analyse.", basis: "0 posts" }], posts, withMetrics: 0 };
  if (scored.length < MIN_SAMPLE) insights.push({ text: `Only ${scored.length} of ${posts} published post(s) have view or reach data. Treat all comparisons as anecdotes until at least ${MIN_SAMPLE} posts have data.`, basis: `${scored.length}/${posts}` });
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  for (const key of ["platform", "format"] as const) {
    const groups = new Map<string, number[]>(); for (const r of scored) groups.set(r[key], [...(groups.get(r[key]) ?? []), r.s]);
    const ranked = [...groups.entries()].map(([k, v]) => ({ k, n: v.length, avg: avg(v) })).sort((a, b) => b.avg - a.avg);
    if (ranked.length > 1) insights.push({ text: `By ${key}: ${ranked.map((g) => `${g.k} averages ${Math.round(g.avg).toLocaleString("en-IN")} (${g.n} post${g.n > 1 ? "s" : ""})`).join("; ")}.`, basis: `${scored.length} posts` });
  }
  const best = [...scored].sort((a, b) => b.s - a.s)[0], worst = [...scored].sort((a, b) => a.s - b.s)[0];
  if (scored.length >= 2 && best && worst && best.id !== worst.id) insights.push({ text: `Best so far: "${best.hook ?? best.format}" (${best.platform}, ${best.s.toLocaleString("en-IN")}). Weakest: "${worst.hook ?? worst.format}" (${worst.platform}, ${worst.s.toLocaleString("en-IN")}).`, basis: "single posts: not a trend" });
  const eng = scored.map((r) => ({ r, e: (r.metrics!.saved ?? 0) + (r.metrics!.shares ?? 0) })).filter((x) => x.r.metrics!.saved != null || x.r.metrics!.shares != null).sort((a, b) => b.e - a.e)[0];
  if (eng && eng.e > 0) insights.push({ text: `Most saved or shared: "${eng.r.hook ?? eng.r.format}" (${eng.e} saves + shares).`, basis: "saves and shares" });
  return { insights, posts, withMetrics: withM.length };
}

/** Follower growth between the first and latest account snapshot per platform. */
export async function followerGrowth(db: Db) {
  const out: Record<string, { first: number; latest: number; since: Date }> = {};
  for (const platform of ["instagram", "facebook"]) {
    const snaps = await db.select().from(schema.metricsSnapshots).where(and(eq(schema.metricsSnapshots.platform, platform), isNull(schema.metricsSnapshots.publicationId))).orderBy(schema.metricsSnapshots.capturedAt);
    const f = snaps.filter((s) => typeof s.metrics.followers === "number");
    if (f.length >= 2) out[platform] = { first: f[0].metrics.followers as number, latest: f[f.length - 1].metrics.followers as number, since: f[0].capturedAt };
  }
  return out;
}
