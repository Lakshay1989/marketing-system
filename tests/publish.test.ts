import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { testDb } from "./helpers";
import { setSetting } from "@/lib/settings";
import { publishItem } from "@/lib/publish/execute";
import { MetaError } from "@/lib/publish/meta";

async function seed(db: Awaited<ReturnType<typeof testDb>>, over: Partial<typeof schema.contentItems.$inferInsert> = {}, qa = "passed") {
  const [asset] = await db.insert(schema.assets).values({ kind: "reel", storageKey: "k" + Math.random(), publicUrl: "https://cdn.example/x.mp4", mimeType: "video/mp4", qaStatus: qa }).returning();
  const [item] = await db.insert(schema.contentItems).values({ platform: "instagram", format: "reel", caption: "hi", assetId: asset.id, status: "approved", ...over }).returning();
  return item;
}
const ok = vi.fn(async () => ({ externalId: "123", url: "https://instagram.com/reel/abc/", verified: true as const, raw: {} }));

describe("publishItem", () => {
  it("publishes an approved, QA-passed item and records a verified publication", async () => {
    const db = await testDb(); const item = await seed(db); ok.mockClear();
    const r = await publishItem(db, item.id, ok);
    expect(r).toEqual({ state: "published", url: "https://instagram.com/reel/abc/" });
    const pubs = await db.select().from(schema.publications); expect(pubs).toHaveLength(1); expect(pubs[0].status).toBe("verified");
  });
  it("never posts the same item twice", async () => {
    const db = await testDb(); const item = await seed(db); ok.mockClear();
    await publishItem(db, item.id, ok);
    await db.update(schema.contentItems).set({ status: "approved" }).where(eq(schema.contentItems.id, item.id)); // even if status is wrongly reset
    await publishItem(db, item.id, ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });
  it("blocks in review mode without approval, but allows it once approved", async () => {
    const db = await testDb(); const draft = await seed(db, { status: "awaiting_approval" });
    expect(await publishItem(db, draft.id, ok)).toMatchObject({ state: "blocked" });
    await db.update(schema.contentItems).set({ status: "approved" }).where(eq(schema.contentItems.id, draft.id));
    expect((await publishItem(db, draft.id, ok)).state).toBe("published");
  });
  it("emergency stop and pause-all block everything", async () => {
    const db = await testDb(); const item = await seed(db);
    await setSetting(db, "emergency_stop", true);
    expect(await publishItem(db, item.id, ok)).toMatchObject({ state: "blocked", reason: "Emergency stop is on" });
    await setSetting(db, "emergency_stop", false); await setSetting(db, "paused_all", true);
    expect(await publishItem(db, item.id, ok)).toMatchObject({ state: "blocked" });
  });
  it("blocks assets that failed or skipped QA, and respects the daily limit", async () => {
    const db = await testDb();
    expect(await publishItem(db, (await seed(db, {}, "failed")).id, ok)).toMatchObject({ state: "blocked", reason: "Asset has not passed QA" });
    await setSetting(db, "daily_publish_limit", 1);
    expect((await publishItem(db, (await seed(db)).id, ok)).state).toBe("published");
    expect(await publishItem(db, (await seed(db)).id, ok)).toMatchObject({ state: "blocked" });
  });
  it("treats transient errors as retryable and permanent errors as failed", async () => {
    const db = await testDb(); const a = await seed(db); const b = await seed(db);
    expect((await publishItem(db, a.id, async () => { throw new MetaError("rate limited", true, 429); })).state).toBe("retry");
    expect((await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, a.id)))[0].status).toBe("approved");
    expect((await publishItem(db, b.id, async () => { throw new MetaError("invalid media", false, 400); })).state).toBe("failed");
    expect((await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, b.id)))[0].status).toBe("failed");
  });
});
