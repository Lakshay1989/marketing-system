import { sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { analyse, followerGrowth } from "@/lib/analytics/analyse";

function Spark({ values, color = "#14463f" }: { values: number[]; color?: string }) {
  if (values.length < 2) return <p className="text-xs text-gray-500">Not enough points yet (needs at least 2 daily snapshots).</p>;
  const w = 320, h = 70, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 6 - ((v - min) / span) * (h - 12)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-sm" role="img" aria-label={`Trend from ${values[0]} to ${values[values.length - 1]}`}><polyline fill="none" stroke={color} strokeWidth="2.5" points={pts} /></svg>;
}

export default async function Analytics() {
  const db = await getDb();
  const [a, growth] = await Promise.all([analyse(db), followerGrowth(db)]);
  const byDay = (await db.execute(sql`SELECT date_trunc('day', created_at)::date AS day, platform, count(*) FILTER (WHERE status='verified')::int AS verified, count(*) FILTER (WHERE status='failed')::int AS failed FROM publications GROUP BY 1,2 ORDER BY 1 DESC LIMIT 60`)) as unknown as { rows: { day: string; platform: string; verified: number; failed: number }[] };
  const posts = (await db.execute(sql`select p.created_at, p.platform, p.url, c.hook, (select metrics from metrics_snapshots m where m.publication_id = p.id order by captured_at desc limit 1) as metrics from publications p join content_items ci on ci.id=p.content_item_id left join concepts c on c.id=ci.concept_id where p.status='verified' order by p.created_at desc limit 50`)) as unknown as { rows: { created_at: string; platform: string; url: string | null; hook: string | null; metrics: Record<string, number | null> | null }[] };
  const series = async (platform: string) => (await db.select().from(schema.metricsSnapshots).where(sql`${schema.metricsSnapshots.platform} = ${platform} and ${schema.metricsSnapshots.publicationId} is null`).orderBy(schema.metricsSnapshots.capturedAt)).map((s) => s.metrics.followers).filter((v): v is number => typeof v === "number");
  const [ig, fb] = await Promise.all([series("instagram"), series("facebook")]);
  const cols = ["views", "reach", "likes", "comments", "shares", "saved"];
  return (
    <div className="space-y-4"><h1 className="text-2xl font-black text-[var(--forest)]">Analytics</h1>
      <section className="card"><h2 className="font-bold">What the data says</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{a.insights.map((i, k) => <li key={k}>{i.text} <span className="text-xs text-gray-500">({i.basis})</span></li>)}</ul>
        <p className="mt-2 text-xs text-gray-500">Findings use only numbers the platforms returned. A blank means the platform did not provide it, never zero.</p></section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card"><h2 className="font-bold">Instagram followers over time</h2><Spark values={ig} />{growth.instagram && <p className="mt-1 text-sm">{growth.instagram.first} to {growth.instagram.latest} since {growth.instagram.since.toLocaleDateString("en-IN")}</p>}</section>
        <section className="card"><h2 className="font-bold">Facebook followers over time</h2><Spark values={fb} color="#1877f2" />{growth.facebook && <p className="mt-1 text-sm">{growth.facebook.first} to {growth.facebook.latest} since {growth.facebook.since.toLocaleDateString("en-IN")}</p>}</section>
      </div>
      <section className="card overflow-x-auto"><h2 className="font-bold">Per post (latest snapshot)</h2>
        {posts.rows.length === 0 ? <p className="mt-2 text-sm text-gray-600">No published posts yet.</p> : <table className="mt-2"><thead><tr><th>Published</th><th>Platform</th><th>Post</th>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{posts.rows.map((p, i) => <tr key={i}><td>{new Date(p.created_at).toLocaleDateString("en-IN")}</td><td>{p.platform}</td><td>{p.url ? <a className="underline" href={p.url} target="_blank" rel="noreferrer">{p.hook ?? "open"}</a> : p.hook}</td>{cols.map((c) => <td key={c}>{p.metrics ? (p.metrics[c] ?? "n/a") : "not collected"}</td>)}</tr>)}</tbody></table>}</section>
      <section className="card"><h2 className="font-bold">Publishing history by day</h2>
        {byDay.rows.length === 0 ? <p className="mt-2 text-sm text-gray-600">No publications yet.</p> : <table className="mt-2"><thead><tr><th>Day</th><th>Platform</th><th>Verified</th><th>Failed</th></tr></thead><tbody>{byDay.rows.map((r, i) => <tr key={i}><td>{String(r.day)}</td><td>{r.platform}</td><td>{r.verified}</td><td>{r.failed}</td></tr>)}</tbody></table>}</section>
    </div>
  );
}
