import { describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import { claimNext, complete, enqueue, fail, recoverStale } from "@/lib/queue";

describe("job queue", () => {
  it("ignores a duplicate idempotency key", async () => {
    const db = await testDb();
    expect(await enqueue(db, "publish", { id: 1 }, { idempotencyKey: "publish:abc" })).not.toBeNull();
    expect(await enqueue(db, "publish", { id: 1 }, { idempotencyKey: "publish:abc" })).toBeNull();
  });
  it("claims only due jobs, once", async () => {
    const db = await testDb();
    await enqueue(db, "later", {}, { runAt: new Date(Date.now() + 3_600_000) });
    await enqueue(db, "now", {});
    const a = await claimNext(db); expect(a?.type).toBe("now"); expect(a?.attempts).toBe(1);
    expect(await claimNext(db)).toBeNull();
  });
  it("retries with growing backoff then dies after max attempts", async () => {
    const db = await testDb();
    await enqueue(db, "flaky", {}, { maxAttempts: 2 });
    const t0 = new Date();
    let j = (await claimNext(db, t0))!;
    expect(await fail(db, j, "boom access_token=SECRET123 x", t0)).toBe("retry");
    expect(await claimNext(db, t0)).toBeNull();                        // backoff: not due yet
    const later = new Date(t0.getTime() + 40_000);
    j = (await claimNext(db, later))!; expect(j.attempts).toBe(2);
    expect(j.lastError).toContain("access_token=***"); expect(j.lastError).not.toContain("SECRET123");
    expect(await fail(db, j, "boom again", later)).toBe("dead");
  });
  it("completes jobs and recovers crashed ones", async () => {
    const db = await testDb();
    await enqueue(db, "a", {}); const j = (await claimNext(db))!; await complete(db, j.id);
    await enqueue(db, "b", {}); const k = (await claimNext(db))!;
    expect(await recoverStale(db, 15, new Date(Date.now() + 20 * 60_000))).toBe(1);
    expect((await claimNext(db))?.id).toBe(k.id);
  });
});
