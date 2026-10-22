import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { testDb } from "./helpers";
import { enqueue } from "@/lib/queue";
import { setSetting } from "@/lib/settings";
import { ensureDailyReport, runOnce, scheduleDue } from "../worker/loop";
import { envPublisher } from "../worker/publisher";
import { MetaError } from "@/lib/publish/meta";

async function item(db: Awaited<ReturnType<typeof testDb>>, status = "approved", when = new Date(Date.now() - 1000)) {
  const [a] = await db.insert(schema.assets).values({ kind: "reel", storageKey: "k" + Math.random(), publicUrl: "https://cdn/x.mp4", mimeType: "video/mp4", qaStatus: "passed" }).returning();
  const [i] = await db.insert(schema.contentItems).values({ platform: "instagram", format: "reel", assetId: a.id, status, scheduledFor: when }).returning(); return i;
}
describe("worker", () => {
  it("review mode never auto-queues; supervised queues due approved items exactly once", async () => {
    const db = await testDb(); await item(db);
    expect(await scheduleDue(db)).toBe(0);
    await setSetting(db, "mode", "supervised");
    expect(await scheduleDue(db)).toBe(1); expect(await scheduleDue(db)).toBe(0);
  });
  it("publishes through the queue and marks the job done", async () => {
    const db = await testDb(); const i = await item(db); await setSetting(db, "mode", "supervised");
    await enqueue(db, "publish", { contentItemId: i.id });
    expect(await runOnce(db, async () => ({ externalId: "1", url: "https://i/g", verified: true as const, raw: {} }))).toBe("publish published");
    expect((await db.select().from(schema.jobs))[0].status).toBe("succeeded");
    expect(await runOnce(db, async () => { throw new Error("should not run"); })).toBe("idle");
  });
  it("retries transient failures and dead-letters after the last attempt", async () => {
    const db = await testDb(); const i = await item(db);
    await enqueue(db, "publish", { contentItemId: i.id }, { maxAttempts: 1 });
    expect(await runOnce(db, async () => { throw new MetaError("rate limit", true, 429); })).toBe("publish dead");
  });
  it("an unconfigured Meta connection fails with a clear reason, and never fakes success", async () => {
    const db = await testDb(); const i = await item(db);
    await enqueue(db, "publish", { contentItemId: i.id });
    await runOnce(db, envPublisher({} as NodeJS.ProcessEnv));
    const [row] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, i.id));
    expect(row.status).toBe("failed"); expect(await db.select().from(schema.publications).then((r) => r.filter((p) => p.status === "verified"))).toHaveLength(0);
  });
  it("creates one daily report job per day", async () => {
    const db = await testDb(); expect(await ensureDailyReport(db)).not.toBeNull(); expect(await ensureDailyReport(db)).toBeNull();
    expect(await runOnce(db, async () => { throw new Error("x"); })).toBe("daily_report done");
    expect((await db.select().from(schema.reports)).length).toBe(1);
  });
});

describe("daily pipeline job", () => {
  it("runs research then planning through the queue and records both agent runs", async () => {
    const { ensureDailyPipeline } = await import("../worker/loop");
    const db = await testDb();
    const slug = (await import("@/lib/agents/strategy")).loadCatalog().products[0].slug;
    const runner = async ({ prompt }: { prompt: string }) => ({ via: "cli" as const, result: JSON.stringify(prompt.includes("Social Trend Research") ? [{ platform: "instagram", title: "Dusk reveal pattern", sourceUrl: "https://example.com/p", evidence: "A brand reveals a bed at dusk with slow push-in.", relevance: 80, adaptation: "Kukur original dusk reveal of the cosy bed." }] : [{ title: "Dusk reveal", hook: "Sleep looks like this", format: "reel", platform: "instagram", trendTitle: "Dusk reveal pattern", productSlugs: [slug], storyboard: ["dusk sky", "bed rises", "logo end"], cta: "Shop at kukur.shop", caption: "Soft places to land for dogs and cats. Find yours at kukur.shop", scores: { originality: 80, brandFit: 85, quality: 78, commercial: 75 } }]) });
    expect(await ensureDailyPipeline(db)).not.toBeNull(); expect(await ensureDailyPipeline(db)).toBeNull();
    expect(await runOnce(db, async () => { throw new Error("x"); }, new Date(), { runner, urlCheck: async () => 200 })).toMatch(/pipeline done/);
    expect((await db.select().from(schema.concepts)).filter((c) => c.status === "approved_for_production")).toHaveLength(1);
    expect((await db.select().from(schema.agentRuns)).map((r) => r.agentKey).sort()).toEqual(["strategy", "trends"]);
  });
});
