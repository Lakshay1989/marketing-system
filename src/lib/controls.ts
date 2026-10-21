import { and, eq, gte, sql } from "drizzle-orm";
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
