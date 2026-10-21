import { getDb } from "@/db";
import { overview } from "@/lib/queries";
import { getSetting } from "@/lib/settings";
import { seedAgents } from "@/lib/agents";
import { setMode, togglePauseAll } from "../actions";

const Stat = ({ label, value, tone }: { label: string; value: number; tone?: string }) => <div className="card"><p className="text-xs font-bold uppercase text-gray-500">{label}</p><p className={`mt-1 text-3xl font-black ${tone ?? ""}`}>{value}</p></div>;

export default async function Overview() {
  const db = await getDb(); await seedAgents(db);
  const [o, mode, paused] = await Promise.all([overview(db), getSetting(db, "mode"), getSetting(db, "paused_all")]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-[var(--forest)]">Marketing overview</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Created today" value={o.created} /><Stat label="Reels / Stories" value={o.reels + o.stories} />
        <Stat label="Awaiting approval" value={o.awaiting} tone={o.awaiting ? "text-[var(--orange)]" : ""} /><Stat label="Scheduled" value={o.scheduled} />
        <Stat label="Published & verified today" value={o.published} /><Stat label="Failed publications today" value={o.failedPub} tone={o.failedPub ? "text-red-700" : ""} />
        <Stat label="Jobs queued" value={o.queued} /><Stat label="Dead jobs (need attention)" value={o.deadJobs} tone={o.deadJobs ? "text-red-700" : ""} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card"><h2 className="font-bold">Operating mode</h2>
          <form action={setMode} className="mt-2 flex flex-wrap gap-2">{(["review", "supervised", "autonomous"] as const).map((m) => <button key={m} name="mode" value={m} className={`btn ${mode === m ? "" : "ghost"}`}>{m}</button>)}</form>
          <p className="mt-2 text-xs text-gray-600">Review: nothing is published without your approval and a manual publish. Supervised: approved items publish on schedule. Autonomous: agents publish within the limits you set. Starts in Review until quality and reliability are proven.</p>
          <form action={togglePauseAll} className="mt-3"><button className="btn ghost">{paused ? "Resume all agents" : "Pause all agents"}</button></form>
        </section>
        <section className="card"><h2 className="font-bold">Accounts</h2>
          {o.accounts.length === 0 ? <p className="mt-2 text-sm text-gray-600">No accounts connected yet. Instagram and Facebook connect through the Meta app: see <code>docs/02-accounts-and-permissions.md</code>. Nothing can be published until they are connected and verified.</p>
            : <ul className="mt-2 space-y-1 text-sm">{o.accounts.map((a) => <li key={a.id}>{a.platform} <b>{a.handle}</b> <span className={`pill ${a.status === "connected" ? "ok" : "wait"}`}>{a.status}</span></li>)}</ul>}
        </section>
      </div>
      <section className="card"><h2 className="font-bold">Latest executive report</h2>
        {o.report ? <p className="mt-2 text-sm">{o.report.summaryText} <span className="text-gray-500">({o.report.createdAt.toLocaleString("en-IN")})</span></p> : <p className="mt-2 text-sm text-gray-600">No report yet. Run <code>npm run report:daily</code> or let the worker create one each morning.</p>}
      </section>
      <section className="card"><h2 className="font-bold">Recent agent errors</h2>
        {o.agentErrors.length === 0 ? <p className="mt-2 text-sm text-gray-600">None.</p> : <table className="mt-2"><thead><tr><th>Agent</th><th>When</th><th>Error</th></tr></thead><tbody>{o.agentErrors.map((r) => <tr key={r.id}><td>{r.agentKey}</td><td>{r.startedAt.toLocaleString("en-IN")}</td><td>{r.error}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}
