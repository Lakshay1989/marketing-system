import { schema, type Db } from "@/db";
import { and, eq } from "drizzle-orm";
import { metaClient } from "../publish/meta";
import { collectAccountMetrics, collectPublicationMetrics } from "./collect";
import { analyse } from "./analyse";

/** One analytics pass: refresh account status, collect account and per-post metrics, write findings as a report. Needs the Meta connection; otherwise it says exactly what is missing. */
export async function runAnalytics(db: Db, env: NodeJS.ProcessEnv = process.env) {
  const need = ["META_PAGE_ID", "META_IG_USER_ID", "META_PAGE_ACCESS_TOKEN"].filter((k) => !env[k]);
  if (need.length) throw new Error(`Analytics needs the Meta connection (missing: ${need.join(", ")})`);
  const client = metaClient({ graphVersion: env.META_GRAPH_VERSION ?? "v21.0", pageId: env.META_PAGE_ID!, igUserId: env.META_IG_USER_ID!, pageToken: env.META_PAGE_ACCESS_TOKEN! });
  const status = await client.checkAccounts(); const now = new Date();
  for (const [platform, r] of [["instagram", status.instagram], ["facebook", status.facebook]] as const) await db.update(schema.socialAccounts).set({ status: r.ok ? "connected" : "blocked", lastCheckedAt: now, note: r.ok ? null : (r as { error: string }).error }).where(and(eq(schema.socialAccounts.platform, platform)));
  const acct = await collectAccountMetrics(db, client.get, { pageId: env.META_PAGE_ID, igUserId: env.META_IG_USER_ID });
  const pubs = await collectPublicationMetrics(db, client.get);
  const a = await analyse(db);
  const body = { accounts: acct, publications: pubs, insights: a.insights };
  await db.insert(schema.reports).values({ kind: "analytics", periodStart: new Date(now.getTime() - 86_400_000), periodEnd: now, body, summaryText: a.insights.map((i) => i.text).join(" ") });
  return { snapshots: pubs.snapshots, publications: pubs.publications, insights: a.insights.length };
}
