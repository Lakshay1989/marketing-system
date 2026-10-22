import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { audit } from "../audit";
import { mayPublish } from "../controls";
import { MetaError, type Verified } from "./meta";

export type Publisher = (item: typeof schema.contentItems.$inferSelect, asset: typeof schema.assets.$inferSelect) => Promise<Verified>;
export type Outcome = { state: "published"; url: string } | { state: "blocked"; reason: string } | { state: "retry"; error: string } | { state: "failed"; error: string };

/**
 * The only path that publishes. Order matters: gate -> QA must have passed -> already-published check (idempotent)
 * -> publish -> verification result stored. A submit without a verified lookup is recorded as "submitted", never "published".
 */
export async function publishItem(db: Db, itemId: string, publisher: Publisher): Promise<Outcome> {
  const gate = await mayPublish(db, itemId);
  if (!gate.ok) return { state: "blocked", reason: gate.reason };
  const [item] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId));
  const existing = await db.select().from(schema.publications).where(eq(schema.publications.contentItemId, itemId));
  const done = existing.find((p) => p.status === "verified");
  if (done) return { state: "published", url: done.url ?? "" }; // idempotent: never post twice
  if (!item.assetId) return { state: "blocked", reason: "No asset attached" };
  const [asset] = await db.select().from(schema.assets).where(eq(schema.assets.id, item.assetId));
  if (!asset || asset.qaStatus !== "passed") return { state: "blocked", reason: "Asset has not passed QA" };
  if (!asset.storageKey && !asset.publicUrl) return { state: "blocked", reason: "Asset has no stored file" };
  await db.update(schema.contentItems).set({ status: "publishing" }).where(eq(schema.contentItems.id, itemId));
  try {
    const v = await publisher(item, asset);
    await db.insert(schema.publications).values({ contentItemId: itemId, platform: item.platform, externalId: v.externalId, url: v.url, status: "verified", platformResponse: v.raw, verifiedAt: new Date() });
    await db.update(schema.contentItems).set({ status: "published" }).where(eq(schema.contentItems.id, itemId));
    await audit(db, "publishing", "publish.verified", itemId, { url: v.url, id: v.externalId });
    return { state: "published", url: v.url };
  } catch (e) {
    const err = e as MetaError; const transient = err instanceof MetaError ? err.transient : false;
    await db.update(schema.contentItems).set({ status: transient ? "approved" : "failed" }).where(eq(schema.contentItems.id, itemId));
    if (!transient) await db.insert(schema.publications).values({ contentItemId: itemId, platform: item.platform, status: "failed", platformResponse: { error: err.message } });
    await audit(db, "publishing", transient ? "publish.retryable_error" : "publish.failed", itemId, { error: err.message });
    return transient ? { state: "retry", error: err.message } : { state: "failed", error: err.message };
  }
}
