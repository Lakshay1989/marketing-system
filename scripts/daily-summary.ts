// Plain-text daily summary: reels & stories created and posted today (IST day), with links. Usage: npm run report:summary
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
const IST = 330 * 60_000, now = Date.now();
const start = new Date(Math.floor((now + IST) / 86_400_000) * 86_400_000 - IST);
const created = await sql`select platform, format, status, count(*)::int n from content_items where created_at >= ${start} group by 1,2,3 order by 1,2`;
const posted = await sql`select p.platform, ci.format, p.url, p.created_at, left(c.title,60) title from publications p join content_items ci on ci.id=p.content_item_id join concepts c on c.id=ci.concept_id where p.status='verified' and p.created_at >= ${start} order by p.created_at`;
const failed = await sql`select count(*)::int n from publications where status='failed' and created_at >= ${start}`;
const queued = await sql`select ci.platform, ci.format, ci.scheduled_for, left(c.title,50) title from content_items ci join concepts c on c.id=ci.concept_id where ci.status='approved' order by ci.scheduled_for limit 8`;
const waiting = await sql`select count(*)::int n from content_items where status='awaiting_approval'`;
const dead = await sql`select count(*)::int n from jobs where status='dead' and created_at >= ${start}`;
const trends = await sql`select count(*)::int n from trends where discovered_at >= ${start}`;
const runsFailed = await sql`select agent_key, left(error,90) err from agent_runs where status='failed' and started_at >= ${start}`;
const f = (d: Date) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const sum = (rows: any[], fmt: string, st?: string) => rows.filter((r) => r.format === fmt && (!st || r.status === st)).reduce((a, r) => a + r.n, 0);
const L = [`Kukur marketing report, ${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" })}`,
  `Created today: ${sum(created, "reel")} reel(s), ${sum(created, "story")} stor(ies)`,
  `Posted today (verified by the platform): ${posted.filter((p: any) => p.format === "reel").length} reel(s), ${posted.filter((p: any) => p.format === "story").length} stor(ies)`,
  ...posted.map((p: any) => `  - ${p.platform} ${p.format} "${p.title}" ${f(p.created_at)} ${p.url}`),
  `Failed publications: ${failed[0].n}. Trends found today: ${trends[0].n}.`,
  `Scheduled next: ${queued.length ? "" : "nothing"}`, ...queued.map((q: any) => `  - ${q.platform} ${q.format} "${q.title}" ${q.scheduled_for ? f(q.scheduled_for) : "unscheduled"}`),
  `Waiting for you (poll stories need a sticker added by hand): ${waiting[0].n}`,
  ...(dead[0].n || runsFailed.length ? [`Problems: ${dead[0].n} dead job(s); failed runs: ${runsFailed.map((r: any) => `${r.agent_key} (${r.err})`).join("; ") || "none"}`] : ["Problems: none"])];
console.log(L.join("\n"));
