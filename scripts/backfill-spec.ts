// One-off: records the exact reel spec and audio provenance for assets made before the production agent stored them
// (the spec is a pure function of the concept, so it can be rebuilt exactly), then queues a fresh QA review.
import { eq } from "drizzle-orm";
import { openDb, schema } from "../src/db";
import { loadCatalog } from "../src/lib/agents/strategy";
import { buildReelSpec } from "../src/lib/production/specs";
import { enqueue } from "../src/lib/queue";
const db = await openDb(); const cat = loadCatalog(); let n = 0;
for (const a of await db.select().from(schema.assets)) {
  const rep = (a.qaReport ?? {}) as Record<string, unknown>; if (a.kind !== "reel" || rep.spec || !a.conceptId) continue;
  const [c] = await db.select().from(schema.concepts).where(eq(schema.concepts.id, a.conceptId)); if (!c) continue;
  let spec; try { ({ spec } = buildReelSpec({ id: c.id, hook: c.hook, title: c.title, productSlugs: c.productSlugs }, cat)); } catch { continue; } // old superseded drafts that no longer meet the rules are skipped
  await db.update(schema.assets).set({ qaStatus: "pending", qaReport: { ...rep, spec, audio: "original-generated" } }).where(eq(schema.assets.id, a.id));
  const [it] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.assetId, a.id));
  if (it && it.status !== "rejected") { await enqueue(db, "qa", { contentItemId: it.id }, { idempotencyKey: `qa:${it.id}:backfill` , maxAttempts: 2 }); n++; }
}
console.log(`backfilled and queued QA for ${n} asset(s)`);
