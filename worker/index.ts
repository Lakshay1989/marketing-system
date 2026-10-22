import { openDb } from "../src/db";
import { seedAgents } from "../src/lib/agents";
import { ensureDailyPipeline, ensureDailyReport, runOnce, scheduleDue } from "./loop";
import { envPublisher } from "./publisher";

/** Long-running worker: `npm run worker`. Run it on any always-on machine or container (see docs/03-deployment-and-operations.md). */
const db = await openDb(); await seedAgents(db);
const publisher = envPublisher();
console.log("kukur-marketing-ai worker started");
let stop = false; process.on("SIGINT", () => { stop = true; }); process.on("SIGTERM", () => { stop = true; });
while (!stop) {
  try {
    await ensureDailyReport(db); if (new Date().getHours() >= 6) await ensureDailyPipeline(db); await scheduleDue(db);
    let r = await runOnce(db, publisher);
    while (r !== "idle" && !stop) { console.log(new Date().toISOString(), r); r = await runOnce(db, publisher); }
  } catch (e) { console.error("worker tick failed:", (e as Error).message); }
  await new Promise((res) => setTimeout(res, 15_000));
}
