import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";

export default async function History() {
  const db = await getDb();
  const [pubs, runs, approvals, reports, audit, jobs] = await Promise.all([
    db.select().from(schema.publications).orderBy(desc(schema.publications.createdAt)).limit(50),
    db.select().from(schema.agentRuns).orderBy(desc(schema.agentRuns.startedAt)).limit(50),
    db.select().from(schema.approvals).orderBy(desc(schema.approvals.decidedAt)).limit(50),
    db.select().from(schema.reports).orderBy(desc(schema.reports.createdAt)).limit(30),
    db.select().from(schema.auditEvents).orderBy(desc(schema.auditEvents.at)).limit(100),
    db.select().from(schema.jobs).orderBy(desc(schema.jobs.createdAt)).limit(50),
  ]);
  const T = ({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) => <section className="card overflow-x-auto"><h2 className="font-bold">{title}</h2>{empty ? <p className="mt-2 text-sm text-gray-600">Nothing recorded yet.</p> : children}</section>;
  return (
    <div className="space-y-4"><h1 className="text-2xl font-black text-[var(--forest)]">Historical activity</h1>
      <p className="text-sm"><a className="underline" href="/api/export">Download everything as JSON</a></p>
      <T title="Publications" empty={!pubs.length}><table className="mt-2"><thead><tr><th>When</th><th>Platform</th><th>Status</th><th>ID</th><th>URL</th></tr></thead><tbody>{pubs.map((p) => <tr key={p.id}><td>{p.createdAt.toLocaleString("en-IN")}</td><td>{p.platform}</td><td>{p.status}</td><td>{p.externalId}</td><td>{p.url ? <a className="underline" href={p.url} target="_blank" rel="noreferrer">open</a> : ""}</td></tr>)}</tbody></table></T>
      <T title="Daily and weekly reports" empty={!reports.length}><ul className="mt-2 space-y-2 text-sm">{reports.map((r) => <li key={r.id}><b>{r.kind}</b> {r.createdAt.toLocaleString("en-IN")}: {r.summaryText}</li>)}</ul></T>
      <T title="Agent runs" empty={!runs.length}><table className="mt-2"><thead><tr><th>Started</th><th>Agent</th><th>Status</th><th>Summary / error</th></tr></thead><tbody>{runs.map((r) => <tr key={r.id}><td>{r.startedAt.toLocaleString("en-IN")}</td><td>{r.agentKey}</td><td>{r.status}</td><td>{r.error ?? r.summary}</td></tr>)}</tbody></table></T>
      <T title="Jobs (including failures and recovery)" empty={!jobs.length}><table className="mt-2"><thead><tr><th>Created</th><th>Type</th><th>Status</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>{jobs.map((j) => <tr key={j.id}><td>{j.createdAt.toLocaleString("en-IN")}</td><td>{j.type}</td><td>{j.status}</td><td>{j.attempts}/{j.maxAttempts}</td><td>{j.lastError}</td></tr>)}</tbody></table></T>
      <T title="Approval decisions" empty={!approvals.length}><table className="mt-2"><thead><tr><th>When</th><th>Decision</th><th>Note</th></tr></thead><tbody>{approvals.map((a) => <tr key={a.id}><td>{a.decidedAt.toLocaleString("en-IN")}</td><td>{a.decision}</td><td>{a.note}</td></tr>)}</tbody></table></T>
      <T title="Audit log" empty={!audit.length}><table className="mt-2"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead><tbody>{audit.map((e) => <tr key={e.id}><td>{e.at.toLocaleString("en-IN")}</td><td>{e.actor}</td><td>{e.action}</td><td>{e.target}</td></tr>)}</tbody></table></T>
    </div>
  );
}
