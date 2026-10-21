import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { seedAgents } from "@/lib/agents";
import { toggleAgent } from "../../actions";

export default async function Agents() {
  const db = await getDb(); await seedAgents(db);
  const agents = await db.select().from(schema.agents);
  const runs = await db.select().from(schema.agentRuns).orderBy(desc(schema.agentRuns.startedAt)).limit(300);
  const lastErr = (k: string) => runs.find((r) => r.agentKey === k && r.status === "failed");
  const lastRun = (k: string) => runs.find((r) => r.agentKey === k);
  return (
    <div className="space-y-4"><h1 className="text-2xl font-black text-[var(--forest)]">Agent control centre</h1>
      <div className="grid gap-3 md:grid-cols-2">
        {agents.map((a) => (
          <section key={a.key} className="card">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-bold">{a.name}</h2><p className="text-xs text-gray-600">{a.responsibility}</p></div>
              <form action={toggleAgent}><input type="hidden" name="key" value={a.key} /><button className={`btn ${a.enabled ? "ghost" : "warn"}`}>{a.enabled ? "Disable" : "Enable"}</button></form></div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-gray-500">Status</dt><dd><span className={`pill ${!a.enabled ? "bad" : a.currentTask ? "wait" : "ok"}`}>{!a.enabled ? "disabled" : a.currentTask ? "working" : "idle"}</span></dd>
              <dt className="text-gray-500">Current task</dt><dd>{a.currentTask ?? "none"}</dd>
              <dt className="text-gray-500">Last run</dt><dd>{a.lastRunAt ? a.lastRunAt.toLocaleString("en-IN") : "never"}</dd>
              <dt className="text-gray-500">Last success</dt><dd>{a.lastSuccessAt ? a.lastSuccessAt.toLocaleString("en-IN") : "never"}</dd>
              <dt className="text-gray-500">Last output</dt><dd>{lastRun(a.key)?.summary ?? "none yet"}</dd>
              <dt className="text-gray-500">Recent error</dt><dd className="text-red-700">{lastErr(a.key)?.error ?? "none"}</dd>
            </dl>
          </section>))}
      </div></div>
  );
}
