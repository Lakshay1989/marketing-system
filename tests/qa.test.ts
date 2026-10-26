import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { testDb } from "./helpers";
import { checkDuplicates, checkPrices, checkReelMedia, checkStoryMedia, checkText, verdict, type MediaFacts } from "@/lib/qa/rules";
import { qaContentItem, unknownWords } from "@/lib/qa/run";
import { inspectFile } from "@/lib/qa/inspect";
import { runOnce } from "../worker/loop";
import { enqueue } from "@/lib/queue";
import fs from "node:fs";

const good: MediaFacts = { width: 1080, height: 1920, durationSec: 12, fps: 30, videoCodec: "h264", hasAudio: true, loudnessLufs: -15.5, truePeakDb: -3.4, blackSeconds: 0, frozenSeconds: 0, bytes: 8e6, firstFrameStdDev: 40 };
const names = (c: ReturnType<typeof checkReelMedia>, s: string) => c.filter((x) => x.status === s).map((x) => x.name);

describe("QA rules", () => {
  it("passes a good reel", () => { expect(verdict(checkReelMedia(good, "instagram")).passed).toBe(true); });
  it("fails wrong size, silent video, clipping, black frames and wrong codec", () => {
    expect(names(checkReelMedia({ ...good, width: 1080, height: 1080 }, "instagram"), "fail")).toContain("format 9:16 1080x1920");
    expect(names(checkReelMedia({ ...good, hasAudio: false }, "instagram"), "fail")).toContain("has an audio track");
    expect(names(checkReelMedia({ ...good, truePeakDb: 1.6 }, "instagram"), "fail")).toContain("true peak at or below -1 dBTP (no clipping)");
    expect(names(checkReelMedia({ ...good, blackSeconds: 1 }, "instagram"), "fail")).toContain("no black frames");
    expect(names(checkReelMedia({ ...good, videoCodec: "vp9" }, "instagram"), "fail")).toContain("video codec H.264");
    expect(names(checkReelMedia({ ...good, durationSec: 120 }, "instagram"), "fail")).toContain("duration 3-90 s");
  });
  it("only warns about long reels, frozen video and a flat first frame", () => {
    const w = names(checkReelMedia({ ...good, durationSec: 60, frozenSeconds: 3, firstFrameStdDev: 3 }, "instagram"), "warn"); expect(w.length).toBe(3);
  });
  it("checks stories", () => { expect(verdict(checkStoryMedia({ ...good, durationSec: null })).passed).toBe(true); expect(verdict(checkStoryMedia({ ...good, width: 800 })).passed).toBe(false); });
  it("checks captions: claims, CTA, tags, repeats", () => {
    const ok = { platform: "instagram", format: "reel", caption: "Four things for every evening walk. Link in bio.", hashtags: ["#a", "#b", "#c"], cta: null };
    expect(verdict(checkText(ok, [])).passed).toBe(true);
    expect(verdict(checkText({ ...ok, caption: "The safest vet approved bed for every pet. Link in bio." }, [])).passed).toBe(false);
    expect(verdict(checkText({ ...ok, caption: "Four things for every walk." }, [])).passed).toBe(false);
    expect(verdict(checkText({ ...ok, caption: "Soft soft bed here. Link in bio #oops" }, [])).passed).toBe(false);
    expect(verdict(checkText({ ...ok, platform: "facebook", caption: "Four things for every evening walk. Shop at kukur.shop" }, [])).passed).toBe(true);
  });
  it("fails if any price is shown in the video (policy: no prices in reels or stories)", () => {
    expect(checkPrices([{ slug: "a", price: "" }, { slug: "b", price: "" }])[0].status).toBe("pass");
    expect(checkPrices([{ slug: "a", price: "" }, { slug: "b", price: "₹219" }])[0]).toMatchObject({ status: "fail" });
  });
  it("flags duplicates", () => { expect(verdict(checkDuplicates(1, 0, 0)).passed).toBe(false); expect(verdict(checkDuplicates(0, 1, 0)).passed).toBe(false); expect(verdict(checkDuplicates(0, 0, 2)).passed).toBe(true); });
  it("spell-checks with the system dictionary and tolerates brand words", () => { const u = unknownWords("Soft landings for your cats and kukur wandd toy #dogsofindia"); expect(u).toContain("wandd"); expect(u).not.toContain("kukur"); expect(u).not.toContain("landings"); });
});

async function item(db: Awaited<ReturnType<typeof testDb>>, o: { caption?: string; hook?: string; spec?: object } = {}) {
  const [c] = await db.insert(schema.concepts).values({ title: "t", hook: o.hook ?? "Pack the evening walk bag", format: "reel", platform: "instagram", status: "produced", productSlugs: ["a", "b", "c"] }).returning();
  const [a] = await db.insert(schema.assets).values({ conceptId: c.id, kind: "reel", storageKey: "k" + Math.random(), mimeType: "video/mp4", qaReport: { spec: o.spec ?? { products: [{ slug: "a", price: "" }] }, audio: "original-generated" } }).returning();
  const [i] = await db.insert(schema.contentItems).values({ conceptId: c.id, assetId: a.id, platform: "instagram", format: "reel", caption: o.caption ?? "Four things for every evening walk. Link in bio.", hashtags: ["#a", "#b", "#c"], status: "draft", contentHash: "h" + Math.random() }).returning(); return { c, a, i };
}
const deps = (facts: MediaFacts, live = { a: 219 } as Record<string, number | null>) => ({ inspector: async () => facts, fetchMedia: async () => "/tmp/kmai-none.mp4", livePrices: async () => live });

describe("QA agent", () => {
  it("passes a good item and moves it to the approval queue", async () => {
    const db = await testDb(); const { i, a } = await item(db); const r = await qaContentItem(db, i.id, deps(good));
    expect(r.passed).toBe(true); expect((await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, i.id)))[0].status).toBe("awaiting_approval");
    expect((await db.select().from(schema.assets).where(eq(schema.assets.id, a.id)))[0].qaStatus).toBe("passed");
  });
  it("keeps an existing owner approval when QA passes, and withdraws it when QA fails", async () => {
    const db = await testDb(); const a = await item(db); await db.update(schema.contentItems).set({ status: "approved" }).where(eq(schema.contentItems.id, a.i.id));
    await qaContentItem(db, a.i.id, deps(good)); expect((await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, a.i.id)))[0].status).toBe("approved");
    const b = await item(db, { caption: "A different caption for the second item here. Link in bio.", hook: "Other hook" }); await db.update(schema.contentItems).set({ status: "approved" }).where(eq(schema.contentItems.id, b.i.id));
    await qaContentItem(db, b.i.id, deps({ ...good, truePeakDb: 2 })); expect((await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, b.i.id)))[0].status).toBe("qa_failed");
  });
  it("fails a clipped reel, records why, and reopens the concept for one revision", async () => {
    const db = await testDb(); const { i, c, a } = await item(db); const r = await qaContentItem(db, i.id, deps({ ...good, truePeakDb: 1.6 }));
    expect(r.passed).toBe(false); expect((await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, i.id)))[0].status).toBe("qa_failed");
    const [cc] = await db.select().from(schema.concepts).where(eq(schema.concepts.id, c.id)); expect(cc.status).toBe("approved_for_production"); expect(cc.notes).toContain("true peak");
    expect(((await db.select().from(schema.assets).where(eq(schema.assets.id, a.id)))[0].qaReport as { checks: unknown[] }).checks.length).toBeGreaterThan(5);
  });
  it("rejects the concept after the maximum number of failed attempts", async () => {
    const db = await testDb(); const { i, c } = await item(db);
    await db.insert(schema.assets).values({ conceptId: c.id, kind: "reel", storageKey: "older", mimeType: "video/mp4" });
    await qaContentItem(db, i.id, deps({ ...good, hasAudio: false })); expect((await db.select().from(schema.concepts).where(eq(schema.concepts.id, c.id)))[0].status).toBe("rejected");
  });
  it("fails when a price is shown in the video", async () => {
    const db = await testDb(); const { i } = await item(db, { spec: { products: [{ slug: "a", price: "₹219" }] } }); const r = await qaContentItem(db, i.id, deps(good));
    expect(r.passed).toBe(false); expect(!r.skipped && r.failed.map((f) => f.name)).toContain("no prices shown in the video");
  });
  it("fails when the caption mentions a price", async () => {
    const db = await testDb(); const { i } = await item(db, { caption: "Toys from ₹199 at Kukur. Link in bio." }); const r = await qaContentItem(db, i.id, deps(good));
    expect(r.passed).toBe(false); expect(!r.skipped && r.failed.map((f) => f.name)).toContain("no prices in the text");
  });
  it("detects a duplicate caption", async () => {
    const db = await testDb(); await item(db, { caption: "Same caption text here. Link in bio." }); const { i } = await item(db, { caption: "Same caption text here. Link in bio.", hook: "Another hook entirely" });
    const r = await qaContentItem(db, i.id, deps(good)); expect(r.passed).toBe(false);
  });
  it("runs through the worker queue", async () => {
    const db = await testDb(); const { i } = await item(db); await enqueue(db, "qa", { contentItemId: i.id });
    expect(await runOnce(db, async () => { throw new Error("n/a"); }, new Date(), { qa: deps(good) })).toBe("qa done");
    expect((await db.select().from(schema.agentRuns)).some((r) => r.agentKey === "qa" && r.status === "success")).toBe(true);
  });
});

describe("real media inspection", () => {
  const real = "production/out/sample/reel.mp4";
  it.skipIf(!fs.existsSync(real))("measures a real rendered reel with ffprobe/ffmpeg", async () => {
    const f = await inspectFile(real, "video"); expect(f).toMatchObject({ width: 1080, height: 1920, videoCodec: "h264", hasAudio: true });
    expect(f.truePeakDb).toBeLessThanOrEqual(-1); expect(f.loudnessLufs).toBeLessThan(-12); expect(f.blackSeconds).toBeLessThan(0.3); expect(verdict(checkReelMedia(f, "instagram")).passed).toBe(true);
  });
});
