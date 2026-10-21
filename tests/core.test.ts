import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { schema } from "@/db";
import { testDb } from "./helpers";
import { buildReport } from "@/lib/reports";
import { withRun, AGENT_DEFS } from "@/lib/agents";
import { getSetting, setSetting } from "@/lib/settings";
import { checkPassword, signSession, verifySession } from "@/lib/auth";

describe("agents and reports", () => {
  it("seeds all nine agents", async () => { const db = await testDb(); expect((await db.select().from(schema.agents)).length).toBe(AGENT_DEFS.length); expect(AGENT_DEFS.length).toBe(9); });
  it("records successful and failed runs, and a disabled agent does not run", async () => {
    const db = await testDb();
    expect((await withRun(db, "trends", "t", async () => ({ summary: "ok" }))).ok).toBe(true);
    const bad = await withRun(db, "qa", "t", async () => { throw new Error("kaboom"); }); expect(bad.ok).toBe(false);
    const runs = await db.select().from(schema.agentRuns); expect(runs.map((r) => r.status).sort()).toEqual(["failed", "success"]);
    await db.update(schema.agents).set({ enabled: false });
    expect((await withRun(db, "ceo", "t", async () => ({ summary: "x" }))).error).toBe("Agent is disabled");
  });
  it("builds a report from stored facts and flags unverified publications as blockers", async () => {
    const db = await testDb();
    const [it] = await db.insert(schema.contentItems).values({ platform: "instagram", format: "reel", status: "awaiting_approval" }).returning();
    await db.insert(schema.publications).values({ contentItemId: it.id, platform: "instagram", status: "submitted" });
    const r = await buildReport(db, "daily");
    expect(r.body).toMatchObject({ contentCreated: 1, awaitingApproval: 1, publishedVerified: 0, submittedUnverified: 1 });
    expect(r.summaryText).toContain("NOT verified");
  });
  it("defaults to review mode and persists setting changes with an audit trail", async () => {
    const db = await testDb(); expect(await getSetting(db, "mode")).toBe("review");
    await setSetting(db, "mode", "supervised"); expect(await getSetting(db, "mode")).toBe("supervised");
    expect((await db.select().from(schema.auditEvents)).some((e) => e.action === "setting.changed")).toBe(true);
  });
});

describe("persistence", () => {
  it("keeps data after the database is closed and reopened", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kmai-"));
    const open = async () => { const c = new PGlite(dir); const d = drizzle(c, { schema }); await migrate(d, { migrationsFolder: path.resolve("drizzle") }); return { c, d }; };
    const a = await open(); await a.d.insert(schema.campaigns).values({ name: "Diwali" }); await a.c.close();
    const b = await open(); expect((await b.d.select().from(schema.campaigns))[0].name).toBe("Diwali"); await b.c.close();
  });
});

describe("auth", () => {
  it("signs and verifies sessions, rejects tampering and expiry", () => {
    const t = signSession(60, 1000); expect(verifySession(t, 2000)).toBe(true); expect(verifySession(t, 1000 + 61_000)).toBe(false);
    expect(verifySession(t.slice(0, -2) + "xx", 2000)).toBe(false); expect(verifySession(undefined)).toBe(false);
  });
  it("keeps login closed without a strong configured password", () => {
    delete process.env.ADMIN_PASSWORD; expect(checkPassword("anything-long-enough")).toBe(false);
    process.env.ADMIN_PASSWORD = "correct-horse-battery"; expect(checkPassword("correct-horse-battery")).toBe(true); expect(checkPassword("wrong-password-xx")).toBe(false);
  });
});
