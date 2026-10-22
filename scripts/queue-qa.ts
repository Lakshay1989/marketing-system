// Queues a QA review for every content item that is still awaiting QA (draft or approved but never reviewed).
import { openDb, schema } from "../src/db";
import { eq, inArray } from "drizzle-orm";
import { enqueue } from "../src/lib/queue";
const db = await openDb();
const items = await db.select().from(schema.contentItems).where(inArray(schema.contentItems.status, ["draft", "approved", "qa_failed"]));
let n = 0; for (const i of items) { const [a] = await db.select().from(schema.assets).where(eq(schema.assets.id, i.assetId!)); if (a?.qaStatus === "pending") if (await enqueue(db, "qa", { contentItemId: i.id }, { idempotencyKey: `qa:${i.id}`, maxAttempts: 2 })) n++; }
console.log(`queued QA for ${n} item(s)`);
