import { and, desc, gte, sql, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";

export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
async function n(db: Db, t: any, where?: any) { const q = db.select({ n: sql<number>`count(*)::int` }).from(t); const [r] = await (where ? q.where(where) : q); return r.n as number; }

export async function overview(db: Db) {
  const t0 = startOfToday();
  const [created, awaiting, scheduled, published, failedPub, deadJobs, queued] = await Promise.all([
    n(db, schema.contentItems, gte(schema.contentItems.createdAt, t0)),
    n(db, schema.contentItems, eq(schema.contentItems.status, "awaiting_approval")),
    n(db, schema.contentItems, eq(schema.contentItems.status, "scheduled")),
    n(db, schema.publications, and(gte(schema.publications.createdAt, t0), eq(schema.publications.status, "verified"))),
    n(db, schema.publications, and(gte(schema.publications.createdAt, t0), eq(schema.publications.status, "failed"))),
    n(db, schema.jobs, eq(schema.jobs.status, "dead")),
    n(db, schema.jobs, eq(schema.jobs.status, "queued")),
  ]);
  const reels = await n(db, schema.contentItems, and(gte(schema.contentItems.createdAt, t0), eq(schema.contentItems.format, "reel")));
  const stories = await n(db, schema.contentItems, and(gte(schema.contentItems.createdAt, t0), eq(schema.contentItems.format, "story")));
  const accounts = await db.select().from(schema.socialAccounts);
  const [report] = await db.select().from(schema.reports).orderBy(desc(schema.reports.createdAt)).limit(1);
  const agentErrors = await db.select().from(schema.agentRuns).where(eq(schema.agentRuns.status, "failed")).orderBy(desc(schema.agentRuns.startedAt)).limit(5);
  return { created, reels, stories, awaiting, scheduled, published, failedPub, deadJobs, queued, accounts, report, agentErrors };
}
