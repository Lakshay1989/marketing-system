import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { audit } from "./audit";

export const AGENT_DEFS = [
  { key: "ceo", name: "CEO / Marketing Director", responsibility: "Coordinates agents, reviews output and performance, flags failed or stalled work, writes the daily and weekly reports." },
  { key: "trends", name: "Social Trend Research", responsibility: "Finds real, sourced trends (formats, audio, hooks, stickers, seasonal moments) and proposes original Kukur adaptations." },
  { key: "strategy", name: "Creative Director", responsibility: "Turns trends and the catalogue into a daily plan; scores concepts and rejects weak or generic ones." },
  { key: "instagram", name: "Instagram Marketing", responsibility: "Plans and prepares Instagram Reels, Stories and captions; collects Instagram metrics." },
  { key: "facebook", name: "Facebook Marketing", responsibility: "Plans and prepares Facebook Reels, Stories and Page posts; collects Facebook metrics." },
  { key: "production", name: "Creative Production", responsibility: "Renders finished 1080x1920 Reels, Stories, covers and graphics from the motion-graphics engine." },
  { key: "qa", name: "Quality Assurance", responsibility: "Checks every asset (format, text, brand, prices, audio, duplicates) before it can be queued." },
  { key: "analytics", name: "Analytics & Growth", responsibility: "Collects real metrics, compares formats and hooks, recommends changes; never invents numbers." },
  { key: "publishing", name: "Publishing Operations", responsibility: "Schedules, publishes, retries safely, prevents duplicates and verifies every post with the platform." },
] as const;
export type AgentKey = (typeof AGENT_DEFS)[number]["key"];

export async function seedAgents(db: Db) {
  for (const a of AGENT_DEFS) await db.insert(schema.agents).values({ key: a.key, name: a.name, responsibility: a.responsibility }).onConflictDoNothing();
}

/** Runs an agent task with a traceable run record. Errors are stored, never swallowed. */
export async function withRun<T>(db: Db, key: AgentKey, task: string, fn: () => Promise<{ summary: string; output?: Record<string, unknown>; result?: T }>): Promise<{ ok: boolean; runId: string; result?: T; error?: string }> {
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.key, key));
  const [run] = await db.insert(schema.agentRuns).values({ agentKey: key }).returning();
  if (agent && !agent.enabled) { await db.update(schema.agentRuns).set({ status: "failed", finishedAt: new Date(), error: "Agent is disabled" }).where(eq(schema.agentRuns.id, run.id)); return { ok: false, runId: run.id, error: "Agent is disabled" }; }
  await db.update(schema.agents).set({ currentTask: task, lastRunAt: new Date() }).where(eq(schema.agents.key, key));
  try {
    const out = await fn();
    await db.update(schema.agentRuns).set({ status: "success", finishedAt: new Date(), summary: out.summary, output: out.output }).where(eq(schema.agentRuns.id, run.id));
    await db.update(schema.agents).set({ currentTask: null, lastSuccessAt: new Date() }).where(eq(schema.agents.key, key));
    return { ok: true, runId: run.id, result: out.result };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    await db.update(schema.agentRuns).set({ status: "failed", finishedAt: new Date(), error: msg }).where(eq(schema.agentRuns.id, run.id));
    await db.update(schema.agents).set({ currentTask: null }).where(eq(schema.agents.key, key));
    await audit(db, key, "agent.failed", run.id, { task, error: msg });
    return { ok: false, runId: run.id, error: msg };
  }
}
