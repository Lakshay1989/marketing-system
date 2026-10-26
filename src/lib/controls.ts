import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { getSetting } from "./settings";

export type Gate = { ok: true } | { ok: false; reason: string };

/** Single decision point for "may this content item be published right now?". Every publish path must call it. */
export async function mayPublish(db: Db, itemId: string, now = new Date()): Promise<Gate> {
  if (await getSetting(db, "emergency_stop")) return { ok: false, reason: "Emergency stop is on" };
  if (await getSetting(db, "paused_all")) return { ok: false, reason: "All marketing agents are paused" };
  const [item] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId));
  if (!item) return { ok: false, reason: "Content item not found" };
  const mode = await getSetting(db, "mode");
  const approved = item.status === "approved" || item.status === "scheduled";
  if (mode !== "autonomous" && !approved) return { ok: false, reason: `Needs approval (mode: ${mode}, status: ${item.status})` };
  if (item.status === "published") return { ok: false, reason: "Already published" };
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.key, "publishing"));
  if (agent && !agent.enabled) return { ok: false, reason: "Publishing agent is disabled" };
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.publications).where(and(gte(schema.publications.createdAt, dayStart), eq(schema.publications.status, "verified")));
  const limit = await getSetting(db, "daily_publish_limit");
  if (n >= limit) return { ok: false, reason: `Daily publishing limit reached (${n}/${limit})` };
  return { ok: true };
}

/** Review mode never publishes on a timer: the owner approves, then presses publish. Supervised and autonomous publish on schedule. */
export async function schedulerMayAutoPublish(db: Db): Promise<boolean> { return (await getSetting(db, "mode")) !== "review"; }

/** Posting slots in IST (minutes after midnight). Items of the same platform are spread at least 90 minutes apart. */
const SLOTS_MIN = [12 * 60 + 30, 17 * 60 + 30, 19 * 60 + 30, 21 * 60];
const IST_MS = 330 * 60_000;
export async function nextSlot(db: Db, platform: string, now = new Date()): Promise<Date> {
  const taken = (await db.select({ at: schema.contentItems.scheduledFor }).from(schema.contentItems).where(and(eq(schema.contentItems.platform, platform as "instagram" | "facebook"), inArray(schema.contentItems.status, ["approved", "scheduled"])))).map((r) => r.at?.getTime()).filter((x): x is number => Boolean(x));
  const istMidnight = Math.floor((now.getTime() + IST_MS) / 86_400_000) * 86_400_000 - IST_MS;
  for (let day = 0; day < 14; day++) for (const m of SLOTS_MIN) {
    const t = istMidnight + day * 86_400_000 + m * 60_000;
    if (t < now.getTime() + 5 * 60_000) continue;
    if (taken.every((x) => Math.abs(x - t) >= 90 * 60_000)) return new Date(t);
  }
  return new Date(now.getTime() + 5 * 60_000);
}

/** Autonomous mode: a QA-passed item is approved by the system and scheduled. Poll stories need a hand-added sticker, so they stay with the owner. */
export async function autoApproveIfAutonomous(db: Db, itemId: string, now = new Date()): Promise<boolean> {
  if ((await getSetting(db, "mode")) !== "autonomous") return false;
  const [item] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId));
  if (!item || item.status !== "awaiting_approval" || !item.assetId) return false;
  const [asset] = await db.select().from(schema.assets).where(eq(schema.assets.id, item.assetId));
  if (asset?.qaStatus !== "passed") return false;
  const spec = (asset.qaReport as { spec?: { template?: string } } | null)?.spec;
  if (spec?.template === "poll") return false;
  const at = await nextSlot(db, item.platform, now);
  await db.update(schema.contentItems).set({ status: "approved", scheduledFor: at }).where(eq(schema.contentItems.id, itemId));
  await db.insert(schema.approvals).values({ contentItemId: itemId, decision: "approved", note: "Auto-approved after passing QA (autonomous mode, owner instruction 26 Oct 2026)" });
  return true;
}
