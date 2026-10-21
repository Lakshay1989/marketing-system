import { openDb } from "../src/db";
import { buildReport } from "../src/lib/reports";
const db = await openDb(); const r = await buildReport(db, process.argv[2] === "weekly" ? "weekly" : "daily"); console.log(r.summaryText);
