import { and, eq, gte } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { MetaError } from "../publish/meta";

type Getter = (path: string, params?: Record<string, string>) => Promise<Record<string, any>>;
export const IG_MEDIA_METRICS = ["reach", "views", "likes", "comments", "shares", "saved", "total_interactions", "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"];
export const FB_VIDEO_METRICS = ["post_video_views", "post_impressions_unique", "post_video_avg_time_watched", "post_video_view_time", "post_video_likes_by_reaction_type", "blue_reels_play_count"];
type M = Record<string, number | null>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : v && typeof v === "object" ? Object.values(v as Record<string, unknown>).reduce<number>((a, b) => a + (typeof b === "number" ? b : 0), 0) : null);

/** Asks for each metric on its own, so one unsupported metric (Meta changes these often) never hides the others. Unavailable = null, never an estimate. */
async function metricSet(get: Getter, path: string, names: string[], extra: Record<string, string> = {}): Promise<{ metrics: M; unavailable: string[] }> {
  const metrics: M = {}; const unavailable: string[] = [];
  for (const m of names) {
    try { const r = await get(path, { metric: m, ...extra }); const row = r.data?.[0]; const v = row?.values?.[0]?.value ?? row?.total_value?.value; metrics[m] = num(v); if (metrics[m] === null) unavailable.push(m); }
    catch (e) { metrics[m] = null; unavailable.push(m); if (e instanceof MetaError && !e.transient && e.status === 401) throw e; }
  }
  return { metrics, unavailable };
}

export async function collectPublicationMetrics(db: Db, get: Getter, opts: { sinceDays?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date(); const since = new Date(now.getTime() - (opts.sinceDays ?? 30) * 86_400_000);
  const pubs = await db.select().from(schema.publications).where(and(eq(schema.publications.status, "verified"), gte(schema.publications.createdAt, since)));
  let saved = 0; const gaps: Record<string, string[]> = {};
  for (const p of pubs) {
    if (!p.externalId) continue;
    const r = p.platform === "instagram" ? await metricSet(get, `/${p.externalId}/insights`, IG_MEDIA_METRICS) : await metricSet(get, `/${p.externalId}/video_insights`, FB_VIDEO_METRICS);
    if (Object.values(r.metrics).some((v) => v !== null)) { await db.insert(schema.metricsSnapshots).values({ publicationId: p.id, platform: p.platform, metrics: r.metrics, capturedAt: now }); saved++; }
    if (r.unavailable.length) gaps[p.id] = r.unavailable;
  }
  return { publications: pubs.length, snapshots: saved, gaps };
}

/** Account-level numbers: followers and, for Instagram, profile visits and website taps. */
export async function collectAccountMetrics(db: Db, get: Getter, ids: { pageId?: string; igUserId?: string }, now = new Date()) {
  const out: Record<string, M> = {};
  if (ids.igUserId) {
    const m: M = { followers: null, media_count: null }; try { const a = await get(`/${ids.igUserId}`, { fields: "followers_count,media_count" }); m.followers = num(a.followers_count); m.media_count = num(a.media_count); } catch { /* stays null */ }
    for (const k of ["profile_views", "website_clicks", "reach"]) { try { const r = await get(`/${ids.igUserId}/insights`, { metric: k, period: "day", metric_type: "total_value" }); m[k] = num(r.data?.[0]?.total_value?.value); } catch { m[k] = null; } }
    out.instagram = m;
  }
  if (ids.pageId) { const m: M = { followers: null }; try { const a = await get(`/${ids.pageId}`, { fields: "followers_count,fan_count" }); m.followers = num(a.followers_count ?? a.fan_count); } catch { /* null */ } out.facebook = m; }
  for (const [platform, metrics] of Object.entries(out)) await db.insert(schema.metricsSnapshots).values({ platform, metrics: { ...metrics, account: 1 }, capturedAt: now });
  return out;
}
