import { getDb, schema } from "@/db";
import { getSetting } from "@/lib/settings";
import { setDailyLimit } from "../../actions";

const ENV = [["DATABASE_URL", "Production database (empty = local embedded)"], ["ADMIN_PASSWORD", "Dashboard login"], ["SESSION_SECRET", "Session signing"], ["ANTHROPIC_API_KEY", "AI agents"], ["MEDIA_S3_BUCKET", "Media storage"], ["MEDIA_PUBLIC_BASE_URL", "Public media URL for Meta"], ["META_APP_ID", "Meta app"], ["META_PAGE_ID", "Facebook Page"], ["META_IG_USER_ID", "Instagram account"], ["META_PAGE_ACCESS_TOKEN", "Page token"]];
export default async function Settings() {
  const db = await getDb(); const limit = await getSetting(db, "daily_publish_limit"); const accounts = await db.select().from(schema.socialAccounts);
  return (
    <div className="space-y-4"><h1 className="text-2xl font-black text-[var(--forest)]">Settings</h1>
      <section className="card"><h2 className="font-bold">Publishing limits</h2>
        <form action={setDailyLimit} className="mt-2 flex items-center gap-2"><label htmlFor="l" className="text-sm">Maximum verified publications per day</label><input id="l" name="limit" type="number" min={0} max={50} defaultValue={limit} className="w-20 rounded-lg border border-[var(--line)] p-1.5" /><button className="btn">Save</button></form>
        <p className="mt-2 text-xs text-gray-600">Timezone: {process.env.APP_TIMEZONE ?? "Asia/Kolkata"}. Budget limits and AI model selection are set through environment variables (see .env.example).</p></section>
      <section className="card"><h2 className="font-bold">Connection checklist (values are never shown)</h2>
        <table className="mt-2"><thead><tr><th>Variable</th><th>Purpose</th><th>Configured</th></tr></thead><tbody>{ENV.map(([k, p]) => <tr key={k}><td><code>{k}</code></td><td>{p}</td><td><span className={`pill ${process.env[k] ? "ok" : "wait"}`}>{process.env[k] ? "yes" : "not set"}</span></td></tr>)}</tbody></table></section>
      <section className="card"><h2 className="font-bold">Connected accounts</h2>{accounts.length === 0 ? <p className="mt-2 text-sm text-gray-600">None yet.</p> : <ul className="mt-2 text-sm">{accounts.map((a) => <li key={a.id}>{a.platform} {a.handle}: {a.status}</li>)}</ul>}</section>
    </div>
  );
}
