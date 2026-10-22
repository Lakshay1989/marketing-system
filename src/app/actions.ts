"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { checkPassword, sessionCookieName, signSession } from "@/lib/auth";
import { requireAuth } from "@/lib/session";
import { setSetting, type Mode } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { enqueue } from "@/lib/queue";
import { seedAgents } from "@/lib/agents";

export async function login(_: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  if (!checkPassword(String(fd.get("password") ?? ""))) return { error: "Wrong password, or login is not configured (ADMIN_PASSWORD needs 12+ characters)." };
  (await cookies()).set(sessionCookieName, signSession(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
  redirect("/");
}
export async function logout() { (await cookies()).delete(sessionCookieName); redirect("/login"); }

async function db() { await requireAuth(); const d = await getDb(); await seedAgents(d); return d; }

export async function setMode(fd: FormData) { const d = await db(); const m = String(fd.get("mode")) as Mode; if (!["review", "supervised", "autonomous"].includes(m)) return; await setSetting(d, "mode", m); revalidatePath("/", "layout"); }
export async function togglePauseAll() { const d = await db(); const cur = (await d.select().from(schema.settings).where(eq(schema.settings.key, "paused_all")))[0]?.value === true; await setSetting(d, "paused_all", !cur); revalidatePath("/", "layout"); }
export async function toggleEmergencyStop() { const d = await db(); const cur = (await d.select().from(schema.settings).where(eq(schema.settings.key, "emergency_stop")))[0]?.value === true; await setSetting(d, "emergency_stop", !cur); revalidatePath("/", "layout"); }
export async function setDailyLimit(fd: FormData) { const d = await db(); const n = Math.max(0, Math.min(50, Number(fd.get("limit")) || 0)); await setSetting(d, "daily_publish_limit", n); revalidatePath("/settings"); }
export async function toggleAgent(fd: FormData) { const d = await db(); const key = String(fd.get("key")); const [a] = await d.select().from(schema.agents).where(eq(schema.agents.key, key)); if (!a) return; await d.update(schema.agents).set({ enabled: !a.enabled }).where(eq(schema.agents.key, key)); await audit(d, "owner", a.enabled ? "agent.disabled" : "agent.enabled", key); revalidatePath("/agents"); }

export async function decide(fd: FormData) {
  const d = await db(); const id = String(fd.get("id")); const decision = String(fd.get("decision")); const note = String(fd.get("note") ?? "").slice(0, 500) || null;
  const next = { approved: "approved", rejected: "rejected", revision_requested: "revision_requested" }[decision]; if (!next) return;
  await d.update(schema.contentItems).set({ status: next }).where(eq(schema.contentItems.id, id));
  await d.insert(schema.approvals).values({ contentItemId: id, decision, note });
  await audit(d, "owner", `content.${decision}`, id, { note });
  revalidatePath("/studio");
}
/** Review mode: the owner presses this after approving. The job goes through the same gate and verification as any publication. */
export async function publishNow(fd: FormData) { const d = await db(); const id = String(fd.get("id")); await enqueue(d, "publish", { contentItemId: id }, { idempotencyKey: `publish:${id}:manual:${Math.floor(Date.now() / 60000)}` }); await audit(d, "owner", "publish.requested", id); revalidatePath("/studio"); }

/** "Run now" for the research + planning pipeline. The worker picks it up; one manual run per minute at most. */
export async function runPipelineNow() { const d = await db(); await enqueue(d, "daily_pipeline", {}, { idempotencyKey: `daily_pipeline:manual:${Math.floor(Date.now() / 60000)}`, maxAttempts: 2 }); await audit(d, "owner", "pipeline.requested"); revalidatePath("/agents"); }
