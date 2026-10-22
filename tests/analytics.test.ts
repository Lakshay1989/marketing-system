import { describe, expect, it } from "vitest";
import { schema } from "@/db";
import { testDb } from "./helpers";
import { collectAccountMetrics, collectPublicationMetrics } from "@/lib/analytics/collect";
import { analyse, followerGrowth } from "@/lib/analytics/analyse";
import { runAnalytics } from "@/lib/analytics/run";
import { ensureDailyAnalytics, runOnce } from "../worker/loop";
import { enqueue } from "@/lib/queue";
import { MetaError } from "@/lib/publish/meta";

async function published(db: Awaited<ReturnType<typeof testDb>>, platform = "instagram", format = "reel", hook = "Pack the bag", ext = "M1") {
  const [c] = await db.insert(schema.concepts).values({ title: "t", hook, format, platform, status: "produced" }).returning();
  const [i] = await db.insert(schema.contentItems).values({ conceptId: c.id, platform, format, status: "published", caption: "x" }).returning();
  const [p] = await db.insert(schema.publications).values({ contentItemId: i.id, platform, externalId: ext, url: "https://x/" + ext, status: "verified" }).returning(); return p;
}
const metric = (name: string, v: unknown) => ({ data: [{ name, values: [{ value: v }] }] });
const getter = (table: Record<string, unknown>) => async (path: string, params: Record<string, string> = {}) => { const k = `${path}|${params.metric ?? params.fields ?? ""}`; if (!(k in table)) throw new MetaError("(#100) not supported", false, 400); const v = table[k]; if (v instanceof Error) throw v; return v as Record<string, any>; };

describe("analytics collection", () => {
  it("stores real values and null for unsupported metrics (never zero or estimates)", async () => {
    const db = await testDb(); const p = await published(db);
    const g = getter({ "/M1/insights|views": metric("views", 1200), "/M1/insights|reach": metric("reach", 900), "/M1/insights|saved": metric("saved", 14) });
    const r = await collectPublicationMetrics(db, g); expect(r).toMatchObject({ publications: 1, snapshots: 1 });
    const [s] = await db.select().from(schema.metricsSnapshots); expect(s.publicationId).toBe(p.id); expect(s.metrics).toMatchObject({ views: 1200, reach: 900, saved: 14, likes: null, shares: null });
    expect(r.gaps[p.id]).toContain("likes");
  });
  it("saves no snapshot when the platform returned nothing", async () => { const db = await testDb(); await published(db); expect((await collectPublicationMetrics(db, getter({}))).snapshots).toBe(0); });
  it("collects follower counts and Instagram profile visits", async () => {
    const db = await testDb();
    const g = getter({ "/IG|followers_count,media_count": { followers_count: 312, media_count: 20 }, "/IG/insights|profile_views": { data: [{ total_value: { value: 41 } }] }, "/PG|followers_count,fan_count": { followers_count: 25 } });
    const r = await collectAccountMetrics(db, g, { igUserId: "IG", pageId: "PG" }); expect(r.instagram).toMatchObject({ followers: 312, profile_views: 41, website_clicks: null }); expect(r.facebook.followers).toBe(25);
    expect((await db.select().from(schema.metricsSnapshots)).length).toBe(2);
  });
});

describe("analysis", () => {
  it("says there is nothing to analyse before the first post", async () => { const db = await testDb(); expect((await analyse(db)).insights[0].text).toMatch(/Nothing has been published/); });
  it("refuses to declare winners from a tiny sample", async () => {
    const db = await testDb(); const a = await published(db, "instagram", "reel", "A", "M1"); const b = await published(db, "facebook", "reel", "B", "M2");
    await db.insert(schema.metricsSnapshots).values([{ publicationId: a.id, platform: "instagram", metrics: { views: 900 } }, { publicationId: b.id, platform: "facebook", metrics: { post_video_views: 300 } }]);
    const r = await analyse(db); expect(r.insights.some((i) => /anecdotes/.test(i.text))).toBe(true); expect(r.insights.some((i) => /Best so far: "A"/.test(i.text))).toBe(true);
  });
  it("computes follower growth from account snapshots only", async () => {
    const db = await testDb(); const t = (d: number) => new Date(Date.now() - d * 86_400_000);
    await db.insert(schema.metricsSnapshots).values([{ platform: "instagram", metrics: { followers: 100 }, capturedAt: t(3) }, { platform: "instagram", metrics: { followers: 130 }, capturedAt: t(0) }]);
    expect((await followerGrowth(db)).instagram).toMatchObject({ first: 100, latest: 130 });
  });
});

describe("analytics agent", () => {
  it("explains exactly what is missing when Meta is not connected", async () => { const db = await testDb(); await expect(runAnalytics(db, {} as NodeJS.ProcessEnv)).rejects.toThrow(/missing: META_PAGE_ID/); });
  it("does not schedule analytics until a token exists, then once per day", async () => {
    const db = await testDb(); expect(await ensureDailyAnalytics(db, new Date(), {} as NodeJS.ProcessEnv)).toBeNull();
    const env = { META_PAGE_ACCESS_TOKEN: "t" } as unknown as NodeJS.ProcessEnv; expect(await ensureDailyAnalytics(db, new Date(), env)).not.toBeNull(); expect(await ensureDailyAnalytics(db, new Date(), env)).toBeNull();
  });
  it("records a failed analytics run clearly in the worker when unconfigured", async () => {
    const db = await testDb(); await enqueue(db, "analytics", {}, { maxAttempts: 1 });
    expect(await runOnce(db, async () => { throw new Error("n/a"); }, new Date(), { env: {} as NodeJS.ProcessEnv })).toBe("analytics dead");
    expect((await db.select().from(schema.agentRuns)).find((r) => r.agentKey === "analytics")?.error).toMatch(/Meta connection/);
  });
});
