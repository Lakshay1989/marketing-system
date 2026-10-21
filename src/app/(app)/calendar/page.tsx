import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";

export default async function Calendar() {
  const db = await getDb();
  const items = await db.select().from(schema.contentItems).orderBy(asc(schema.contentItems.scheduledFor));
  const pubs = items.length ? await db.select().from(schema.publications).where(inArray(schema.publications.contentItemId, items.map((i) => i.id))) : [];
  return (
    <div className="space-y-6"><h1 className="text-2xl font-black text-[var(--forest)]">Content calendar</h1>
      {(["instagram", "facebook"] as const).map((p) => { const rows = items.filter((i) => i.platform === p); return (
        <section key={p} className="card"><h2 className="font-bold capitalize">{p}</h2>
          {rows.length === 0 ? <p className="mt-2 text-sm text-gray-600">Nothing planned.</p> : <table className="mt-2"><thead><tr><th>Format</th><th>Planned</th><th>Actually published</th><th>Status</th><th>Link</th></tr></thead><tbody>{rows.map((i) => { const pub = pubs.find((x) => x.contentItemId === i.id && x.status === "verified"); return <tr key={i.id}><td>{i.format}</td><td>{i.scheduledFor?.toLocaleString("en-IN") ?? "not scheduled"}</td><td>{pub?.verifiedAt?.toLocaleString("en-IN") ?? "not yet"}</td><td>{i.status}</td><td>{pub?.url ? <a className="underline" href={pub.url} target="_blank" rel="noreferrer">open</a> : "none"}</td></tr>; })}</tbody></table>}
        </section>); })}
    </div>
  );
}
