// Queues a production job for every concept that is approved_for_production (idempotent).
import { eq } from "drizzle-orm";
import { openDb, schema } from "../src/db";
import { enqueue } from "../src/lib/queue";
const db = await openDb();
const rows = await db.select().from(schema.concepts).where(eq(schema.concepts.status, "approved_for_production"));
let n = 0; for (const c of rows) if (await enqueue(db, "produce", { conceptId: c.id }, { idempotencyKey: `produce:${c.id}`, maxAttempts: 2 })) n++;
console.log(`queued ${n} of ${rows.length} approved concepts`);
