import { and, eq, lte } from "drizzle-orm";
import { schema, type Db } from "../src/db";
import { claimNext, complete, enqueue, fail, recoverStale } from "../src/lib/queue";
import { schedulerMayAutoPublish } from "../src/lib/controls";
import { publishItem, type Publisher } from "../src/lib/publish/execute";
import { buildReport } from "../src/lib/reports";
import { getSetting } from "../src/lib/settings";
import { withRun } from "../src/lib/agents";
import { audit } from "../src/lib/audit";
import { researchTrends } from "../src/lib/agents/trends";
import { planConcepts } from "../src/lib/agents/strategy";
import type { Runner } from "../src/lib/llm";
import { produceConcept, type Renderer } from "../src/lib/production/produce";
import { qaContentItem, type QaDeps } from "../src/lib/qa/run";
import { runAnalytics } from "../src/lib/analytics/run";

/** Queues publish jobs for approved items whose time has come. In Review mode nothing is auto-queued: the owner presses Publish. */
export async function scheduleDue(db: Db, now = new Date()) {
  if (!(await schedulerMayAutoPublish(db))) return 0;
  const due = await db.select().from(schema.contentItems).where(and(eq(schema.contentItems.status, "approved"), lte(schema.contentItems.scheduledFor, now)));
  let n = 0;
  for (const i of due) if (await enqueue(db, "publish", { contentItemId: i.id }, { idempotencyKey: `publish:${i.id}:auto` })) n++;
  return n;
}

/** Processes at most one job. Returns what happened so tests and the loop can assert on it. */
export interface Deps { runner?: Runner; urlCheck?: (u: string) => Promise<number>; renderer?: Renderer; qa?: QaDeps; env?: NodeJS.ProcessEnv }
export async function runOnce(db: Db, publisher: Publisher, now = new Date(), deps: Deps = {}): Promise<string> {
  await recoverStale(db, 15, now);
  const job = await claimNext(db, now);
  if (!job) return "idle";
  try {
    if (job.type === "publish") {
      const id = String(job.payload.contentItemId);
      const r = await withRun(db, "publishing", `publish ${id}`, async () => {
        const out = await publishItem(db, id, publisher);
        if (out.state === "retry") throw new Error(out.error);
        return { summary: out.state === "published" ? `published ${out.url}` : out.state === "blocked" ? `blocked: ${out.reason}` : `failed: ${out.error}`, output: { outcome: out.state }, result: out };
      });
      if (!r.ok) { const res = await fail(db, job, r.error ?? "publish failed", now); return `publish ${res}`; }
      await complete(db, job.id); return `publish ${r.result?.state}`;
    }
    if (job.type === "daily_report") {
      await withRun(db, "ceo", "daily report", async () => { const rep = await buildReport(db, "daily", now); return { summary: rep.summaryText }; });
      await complete(db, job.id); return "daily_report done";
    }
    if (job.type === "analytics") {
      const r = await withRun(db, "analytics", "collecting metrics", async () => { const out = await runAnalytics(db, deps.env); return { summary: `${out.snapshots} snapshot(s) from ${out.publications} post(s), ${out.insights} finding(s)`, output: out }; });
      if (!r.ok) { const res = await fail(db, job, r.error ?? "analytics failed", now); return `analytics ${res}`; }
      await complete(db, job.id); return "analytics done";
    }
    if (job.type === "qa") {
      const id = String(job.payload.contentItemId);
      const r = await withRun(db, "qa", `reviewing ${id.slice(0, 8)}`, async () => { const out = await qaContentItem(db, id, deps.qa); return { summary: out.skipped ? "already passed" : out.passed ? `passed (${out.warnings.length} warning(s))` : `FAILED: ${out.failed.map((f) => f.name).join(", ")}`, output: { passed: out.passed } }; });
      if (!r.ok) { const res = await fail(db, job, r.error ?? "qa failed", now); return `qa ${res}`; }
      await complete(db, job.id);
      // a failed review reopens the concept for a revision: queue its production again
      const [it] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, id));
      if (it?.status === "qa_failed" && it.conceptId) { const [c] = await db.select().from(schema.concepts).where(eq(schema.concepts.id, it.conceptId)); if (c?.status === "approved_for_production") await enqueue(db, "produce", { conceptId: c.id }, { idempotencyKey: `produce:${c.id}:rev:${it.id}`, maxAttempts: 2 }); }
      return "qa done";
    }
    if (job.type === "produce") {
      const id = String(job.payload.conceptId);
      const r = await withRun(db, "production", `producing ${id.slice(0, 8)}`, async () => { const out = await produceConcept(db, id, deps.renderer); return { summary: out.skipped ? "already produced" : `produced ${out.assets} asset(s)${out.interactive ? " (needs manual sticker)" : ""}`, output: out as Record<string, unknown>, result: out }; });
      if (!r.ok) { const res = await fail(db, job, r.error ?? "production failed", now); return `produce ${res}`; }
      const made = (r.result as { contentItemId?: string } | undefined)?.contentItemId;
      if (made) await enqueue(db, "qa", { contentItemId: made }, { idempotencyKey: `qa:${made}`, maxAttempts: 2 });
      await complete(db, job.id); return "produce done";
    }
    if (job.type === "daily_pipeline") {
      const t = await withRun(db, "trends", "researching trends", async () => { const r = await researchTrends(db, { runner: deps.runner, urlCheck: deps.urlCheck, now }); return { summary: `${r.verified} verified of ${r.found} found, ${r.inserted} new`, output: r }; });
      const c = await withRun(db, "strategy", "planning concepts", async () => { const r = await planConcepts(db, { runner: deps.runner, now }); return { summary: `${r.approved} approved of ${r.proposed} proposed`, output: r }; });
      // hand every approved concept to the production agent (one queued job each; idempotent)
      const ready = await db.select().from(schema.concepts).where(eq(schema.concepts.status, "approved_for_production"));
      for (const k of ready) await enqueue(db, "produce", { conceptId: k.id }, { idempotencyKey: `produce:${k.id}`, maxAttempts: 2 });
      if (!t.ok && !c.ok) { const res = await fail(db, job, `pipeline failed: ${t.error} | ${c.error}`, now); return `pipeline ${res}`; }
      await complete(db, job.id); return `pipeline done (trends ${t.ok ? "ok" : "failed"}, strategy ${c.ok ? "ok" : "failed"})`;
    }
    await audit(db, "worker", "job.unknown_type", job.id, { type: job.type });
    await fail(db, { ...job, attempts: job.maxAttempts }, `Unknown job type ${job.type}`, now); return "unknown job type";
  } catch (e) { const res = await fail(db, job, String((e as Error).message), now); return `error ${res}`; }
}

/** Makes sure today's report job exists (08:00 local is handled by the caller passing `now`). */
export async function ensureDailyReport(db: Db, now = new Date()) {
  const tz = await getSetting(db, "timezone");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  return enqueue(db, "daily_report", {}, { idempotencyKey: `daily_report:${day}` });
}

/** One pipeline job per local day, due at 06:30 in the configured timezone (or immediately if the worker starts later in the day). */
export async function ensureDailyPipeline(db: Db, now = new Date()) {
  const tz = await getSetting(db, "timezone");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  return enqueue(db, "daily_pipeline", {}, { idempotencyKey: `daily_pipeline:${day}`, maxAttempts: 3 });
}

/** Analytics once a day (idempotent per local day). Skipped quietly until the Meta connection exists. */
export async function ensureDailyAnalytics(db: Db, now = new Date(), env: NodeJS.ProcessEnv = process.env) {
  if (!env.META_PAGE_ACCESS_TOKEN) return null;
  const tz = await getSetting(db, "timezone"); const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  return enqueue(db, "analytics", {}, { idempotencyKey: `analytics:${day}`, maxAttempts: 3 });
}
