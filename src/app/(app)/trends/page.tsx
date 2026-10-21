import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";

export default async function Trends() {
  const db = await getDb(); const rows = await db.select().from(schema.trends).orderBy(desc(schema.trends.discoveredAt)).limit(200);
  return (
    <div className="space-y-4"><h1 className="text-2xl font-black text-[var(--forest)]">Trend intelligence</h1>
      {rows.length === 0 ? <p className="card text-sm text-gray-600">No trends researched yet. Every trend saved here carries its source link, discovery time and evidence; none are invented.</p>
        : <div className="card overflow-x-auto"><table><thead><tr><th>Trend</th><th>Platform</th><th>Source</th><th>Found</th><th>Relevance</th><th>Kukur adaptation</th><th>Status</th></tr></thead><tbody>{rows.map((t) => <tr key={t.id}><td><b>{t.title}</b><br /><span className="text-xs text-gray-600">{t.evidence}</span></td><td>{t.platform}</td><td><a className="underline" href={t.sourceUrl} target="_blank" rel="noreferrer">source</a></td><td>{t.discoveredAt.toLocaleString("en-IN")}</td><td>{t.relevanceScore}/100</td><td>{t.adaptation}</td><td>{t.status}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
