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

/** Queues publish jobs for approved items whose time has come. In Review mode nothing is auto-queued: the owner presses Publish. */
export async function scheduleDue(db: Db, now = new Date()) {
  if (!(await schedulerMayAutoPublish(db))) return 0;
  const due = await db.select().from(schema.contentItems).where(and(eq(schema.contentItems.status, "approved"), lte(schema.contentItems.scheduledFor, now)));
  let n = 0;
  for (const i of due) if (await enqueue(db, "publish", { contentItemId: i.id }, { idempotencyKey: `publish:${i.id}:auto` })) n++;
  return n;
}

/** Processes at most one job. Returns what happened so tests and the loop can assert on it. */
export interface Deps { runner?: Runner; urlCheck?: (u: string) => Promise<number> }
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
    if (job.type === "daily_pipeline") {
      const t = await withRun(db, "trends", "researching trends", async () => { const r = await researchTrends(db, { runner: deps.runner, urlCheck: deps.urlCheck, now }); return { summary: `${r.verified} verified of ${r.found} found, ${r.inserted} new`, output: r }; });
      const c = await withRun(db, "strategy", "planning concepts", async () => { const r = await planConcepts(db, { runner: deps.runner, now }); return { summary: `${r.approved} approved of ${r.proposed} proposed`, output: r }; });
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
