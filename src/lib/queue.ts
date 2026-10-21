import { sql } from "drizzle-orm";
import { schema, type Db } from "@/db";

export type Job = typeof schema.jobs.$inferSelect;
const backoffMs = (attempt: number) => Math.min(60 * 60_000, 30_000 * 2 ** (attempt - 1));

/** Adds a job. With an idempotencyKey a second enqueue is a no-op, so retries and double clicks never duplicate work (or posts). */
export async function enqueue(db: Db, type: string, payload: Record<string, unknown> = {}, opts: { idempotencyKey?: string; runAt?: Date; maxAttempts?: number } = {}) {
  const [row] = await db.insert(schema.jobs).values({ type, payload, idempotencyKey: opts.idempotencyKey, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 }).onConflictDoNothing({ target: schema.jobs.idempotencyKey }).returning();
  return row ?? null;
}

/** Atomically claims the next due job (safe with several workers). */
export async function claimNext(db: Db, now = new Date()): Promise<Job | null> {
  const res = await db.execute(sql`UPDATE jobs SET status='running', locked_at=${now.toISOString()}, attempts=attempts+1
    WHERE id = (SELECT id FROM jobs WHERE status='queued' AND run_at <= ${now.toISOString()} ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`);
  const r = (res as unknown as { rows: Record<string, unknown>[] }).rows[0];
  if (!r) return null;
  return { id: r.id as string, type: r.type as string, payload: r.payload as Record<string, unknown>, idempotencyKey: r.idempotency_key as string | null, status: r.status as string, runAt: new Date(r.run_at as string), attempts: r.attempts as number, maxAttempts: r.max_attempts as number, lastError: r.last_error as string | null, lockedAt: r.locked_at ? new Date(r.locked_at as string) : null, finishedAt: null, createdAt: new Date(r.created_at as string) };
}

export async function complete(db: Db, id: string) {
  await db.execute(sql`UPDATE jobs SET status='succeeded', finished_at=now(), last_error=NULL WHERE id=${id}`);
}
/** Transient failure: retry with exponential backoff until maxAttempts, then mark dead so a human is told. */
export async function fail(db: Db, job: Job, error: string, now = new Date()): Promise<"retry" | "dead"> {
  const safe = error.replace(/(access_token|token|secret)=([^&\s"]+)/gi, "$1=***").slice(0, 500);
  if (job.attempts >= job.maxAttempts) { await db.execute(sql`UPDATE jobs SET status='dead', finished_at=now(), last_error=${safe} WHERE id=${job.id}`); return "dead"; }
  await db.execute(sql`UPDATE jobs SET status='queued', run_at=${new Date(now.getTime() + backoffMs(job.attempts)).toISOString()}, last_error=${safe}, locked_at=NULL WHERE id=${job.id}`);
  return "retry";
}
/** Puts jobs whose worker crashed (running too long) back on the queue. */
export async function recoverStale(db: Db, olderThanMin = 15, now = new Date()) {
  const res = await db.execute(sql`UPDATE jobs SET status='queued', locked_at=NULL WHERE status='running' AND locked_at < ${new Date(now.getTime() - olderThanMin * 60_000).toISOString()} RETURNING id`);
  return (res as unknown as { rows: unknown[] }).rows.length;
}
