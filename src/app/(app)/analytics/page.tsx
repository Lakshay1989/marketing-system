import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export default async function Analytics() {
  const db = await getDb();
  const byDay = await db.execute(sql`SELECT date_trunc('day', created_at)::date AS day, platform, count(*) FILTER (WHERE status='verified')::int AS verified, count(*) FILTER (WHERE status='failed')::int AS failed FROM publications GROUP BY 1,2 ORDER BY 1 DESC LIMIT 60`);
  const snaps = await db.select().from(schema.metricsSnapshots).orderBy(desc(schema.metricsSnapshots.capturedAt)).limit(50);
  const rows = (byDay as unknown as { rows: { day: string; platform: string; verified: number; failed: number }[] }).rows;
  return (
    <div className="space-y-4"><h1 className="text-2xl font-black text-[var(--forest)]">Analytics</h1>
      <section className="card"><h2 className="font-bold">Publishing history by day</h2>
        {rows.length === 0 ? <p className="mt-2 text-sm text-gray-600">No publications yet.</p> : <table className="mt-2"><thead><tr><th>Day</th><th>Platform</th><th>Verified</th><th>Failed</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{String(r.day)}</td><td>{r.platform}</td><td>{r.verified}</td><td>{r.failed}</td></tr>)}</tbody></table>}</section>
      <section className="card"><h2 className="font-bold">Platform metrics snapshots</h2>
        {snaps.length === 0 ? <p className="mt-2 text-sm text-gray-600">No platform metrics collected yet. Reach, views, saves and shares appear here once accounts are connected; unavailable values stay empty and are never estimated.</p>
          : <table className="mt-2"><thead><tr><th>Captured</th><th>Platform</th><th>Metrics</th></tr></thead><tbody>{snaps.map((s) => <tr key={s.id}><td>{s.capturedAt.toLocaleString("en-IN")}</td><td>{s.platform}</td><td><code className="text-xs">{JSON.stringify(s.metrics)}</code></td></tr>)}</tbody></table>}</section>
    </div>
  );
}
