import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decide, publishNow } from "../../actions";
import { s3Configured, signedMediaUrl } from "@/lib/storage";

export default async function Studio() {
  const db = await getDb();
  const items = await db.select().from(schema.contentItems).orderBy(desc(schema.contentItems.createdAt)).limit(60);
  const assets = items.length ? await db.select().from(schema.assets).where(inArray(schema.assets.id, items.map((i) => i.assetId).filter(Boolean) as string[])) : [];
  const asset = (id: string | null) => assets.find((a) => a.id === id);
  // Media sits in a private bucket: previews use short-lived signed links (1 hour).
  const urls: Record<string, string | null> = {}; for (const a of assets) urls[a.id] = a.publicUrl ?? (s3Configured() ? await signedMediaUrl(a.storageKey, 3600).catch(() => null) : null);
  const tone = (s: string) => (["published", "approved", "scheduled"].includes(s) ? "ok" : ["failed", "rejected", "qa_failed"].includes(s) ? "bad" : "wait");
  return (
    <div className="space-y-4"><h1 className="text-2xl font-black text-[var(--forest)]">Content Studio</h1>
      {items.length === 0 && <p className="card text-sm text-gray-600">No content yet. When the production and QA agents deliver assets they appear here for approval.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((i) => { const a = asset(i.assetId); return (
          <section key={i.id} className="card space-y-2">
            <div className="flex items-center justify-between"><b>{i.platform} · {i.format}</b><span className={`pill ${tone(i.status)}`}>{i.status}</span></div>
            {a && urls[a.id] ? (a.mimeType.startsWith("video") ? <video src={urls[a.id]!} controls className="mx-auto max-h-96 rounded-lg" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={urls[a.id]!} alt="" className="mx-auto max-h-96 rounded-lg" />) : <p className="text-xs text-gray-500">No preview available.</p>}
            <p className="text-xs">QA: <span className={`pill ${a?.qaStatus === "passed" ? "ok" : a?.qaStatus === "failed" ? "bad" : "wait"}`}>{a?.qaStatus ?? "no asset"}</span></p>
            <p className="whitespace-pre-wrap text-sm">{i.caption}</p><p className="text-xs text-gray-600">{i.hashtags.join(" ")}</p>
            <form action={decide} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={i.id} /><input name="note" placeholder="Note (optional)" className="min-w-0 flex-1 rounded-lg border border-[var(--line)] p-1.5 text-sm" />
              <button name="decision" value="approved" className="btn">Approve</button><button name="decision" value="revision_requested" className="btn ghost">Request revision</button><button name="decision" value="rejected" className="btn danger">Reject</button></form>
            {i.status === "approved" && <form action={publishNow}><input type="hidden" name="id" value={i.id} /><button className="btn warn">Publish now (verified)</button></form>}
          </section>); })}
      </div></div>
  );
}
