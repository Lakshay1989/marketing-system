import { and, gte, lt, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";

/** Deterministic executive report built only from stored facts (no model call, no invented numbers). */
export async function buildReport(db: Db, kind: "daily" | "weekly", end = new Date()) {
  const start = new Date(end.getTime() - (kind === "daily" ? 1 : 7) * 86_400_000);
  const within = (col: Parameters<typeof gte>[0]) => and(gte(col, start), lt(col, end));
  const count = async (t: Parameters<Db["select"]>[0] extends never ? never : any, where: any) => { const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(t).where(where); return r.n as number; };
  const created = await count(schema.contentItems, within(schema.contentItems.createdAt));
  const awaiting = await count(schema.contentItems, sql`${schema.contentItems.status} = 'awaiting_approval'`);
  const verified = await count(schema.publications, and(within(schema.publications.createdAt), sql`${schema.publications.status} = 'verified'`));
  const pubFailed = await count(schema.publications, and(within(schema.publications.createdAt), sql`${schema.publications.status} = 'failed'`));
  const unverified = await count(schema.publications, and(within(schema.publications.createdAt), sql`${schema.publications.status} = 'submitted'`));
  const deadJobs = await count(schema.jobs, sql`${schema.jobs.status} = 'dead'`);
  const agentFailures = await count(schema.agentRuns, and(within(schema.agentRuns.startedAt), sql`${schema.agentRuns.status} = 'failed'`));
  const blockers: string[] = [];
  if (deadJobs) blockers.push(`${deadJobs} job(s) failed permanently and need attention`);
  if (pubFailed) blockers.push(`${pubFailed} publication(s) failed`);
  if (unverified) blockers.push(`${unverified} publication(s) were submitted but NOT verified, so they are not counted as published`);
  if (agentFailures) blockers.push(`${agentFailures} agent run(s) failed`);
  if (awaiting) blockers.push(`${awaiting} item(s) are waiting for your approval`);
  const body = { periodStart: start.toISOString(), periodEnd: end.toISOString(), contentCreated: created, awaitingApproval: awaiting, publishedVerified: verified, publishFailed: pubFailed, submittedUnverified: unverified, deadJobs, agentFailures, blockers };
  const summaryText = `${kind === "daily" ? "Daily" : "Weekly"} report: ${created} item(s) created, ${verified} verified publication(s), ${pubFailed} failed. ${blockers.length ? "Needs attention: " + blockers.join("; ") + "." : "No blockers."}`;
  const [row] = await db.insert(schema.reports).values({ kind, periodStart: start, periodEnd: end, body, summaryText }).returning();
  return row;
}
