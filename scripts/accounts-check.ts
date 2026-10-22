// Re-checks the Facebook Page and Instagram account with the saved token and updates their status in the dashboard.
import { and, eq } from "drizzle-orm";
import { openDb, schema } from "../src/db";
import { metaClient } from "../src/lib/publish/meta";
const e = process.env; const db = await openDb();
const c = metaClient({ graphVersion: e.META_GRAPH_VERSION ?? "v21.0", pageId: e.META_PAGE_ID!, igUserId: e.META_IG_USER_ID!, pageToken: e.META_PAGE_ACCESS_TOKEN! });
const r = await c.checkAccounts(); const now = new Date();
for (const [platform, x] of [["instagram", r.instagram], ["facebook", r.facebook]] as const) await db.update(schema.socialAccounts).set({ status: x.ok ? "connected" : "blocked", lastCheckedAt: now, note: x.ok ? null : (x as { error: string }).error }).where(and(eq(schema.socialAccounts.platform, platform)));
console.log(JSON.stringify(r));
