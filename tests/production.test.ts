import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/db";
import { testDb } from "./helpers";
import { loadCatalog } from "@/lib/agents/strategy";
import { buildReelSpec, buildStorySpec, captionFor, hookLines, inr, productWord } from "@/lib/production/specs";
import { produceConcept, type Renderer } from "@/lib/production/produce";
import { enqueue } from "@/lib/queue";
import { runOnce } from "../worker/loop";

const cat = loadCatalog(); const dogItems = cat.products.filter((p) => p.species.includes("dog") && !p.species.includes("cat")).slice(0, 3); const catOnly = cat.products.filter((p) => p.species.includes("cat") && !p.species.includes("dog")); const [catItem, catItem2, catItem3] = catOnly;

describe("spec builders", () => {
  it("formats real prices and picks a product word", () => { expect(inr("1559.00")).toBe("₹1,559"); expect(productWord("Dog Rope Toy")).toBe("ROPE"); expect(productWord("Everyday Collar")).toBe("COLLAR"); });
  it("splits hooks into short lines", () => { expect(hookLines("Sleep looks like this")).toEqual(["SLEEP LOOKS", "LIKE THIS"]); expect(hookLines("Soft landings only.").join(" ")).toBe("SOFT LANDINGS ONLY."); expect(hookLines("Hi")).toEqual(["HI"]); });
  it("builds a reel spec from the catalogue and never includes prices", () => {
    const { spec } = buildReelSpec({ id: "c1", hook: "Sleep looks like this", title: "t", productSlugs: [dogItems[0].slug, dogItems[1].slug, dogItems[2].slug] }, cat);
    expect(spec.products).toHaveLength(3); expect(spec.products.every((x) => x.price === "")).toBe(true); expect(spec.petPhotos[0]).toBe("golden.jpg");
    expect(buildReelSpec({ id: "c2", hook: "x y z", title: "t", productSlugs: [catItem.slug, catItem2.slug, catItem3.slug] }, cat).spec.petPhotos[0]).toBe("cat.jpg");
  });
  it("rejects a concept with no catalogue products", () => { expect(() => buildReelSpec({ id: "c", hook: "h", title: "t", productSlugs: ["nope"] }, cat)).toThrow(); });
  it("detects poll stories and flags them as needing a manual sticker", () => {
    expect(buildStorySpec({ id: "s1", hook: "Diwali box or winter bed first?", title: "Diwali Box or Winter Bed Poll", productSlugs: [dogItems[0].slug, dogItems[1].slug] }, cat)).toMatchObject({ interactive: true, spec: { template: "poll" } });
    expect(buildStorySpec({ id: "s2", hook: "Everyday essentials", title: "Essentials", productSlugs: dogItems.map((p) => p.slug) }, cat)).toMatchObject({ interactive: false, spec: { template: "grid" } });
  });
  it("writes platform-specific calls to action without duplicating them", () => {
    expect(captionFor("instagram", "Soft places to land. Shop now at kukur.shop", [dogItems[0]]).caption).toBe("Soft places to land. Link in bio.");
    expect(captionFor("facebook", "Soft places. Link in bio", [catItem]).caption).toBe("Soft places. Shop at kukur.shop");
  });
});

const stub: Renderer = async (kind, _spec, dir) => {
  fs.mkdirSync(dir, { recursive: true });
  if (kind === "reel") { fs.writeFileSync(path.join(dir, "reel.mp4"), "fake-video"); fs.writeFileSync(path.join(dir, "cover.png"), "fake-cover"); return { files: [{ path: path.join(dir, "reel.mp4"), kind: "reel", mime: "video/mp4", width: 1080, height: 1920, durationSec: 11 }, { path: path.join(dir, "cover.png"), kind: "cover", mime: "image/png", width: 1080, height: 1920 }] }; }
  fs.writeFileSync(path.join(dir, "story.png"), "fake-story"); return { files: [{ path: path.join(dir, "story.png"), kind: "story_image", mime: "image/png", width: 1080, height: 1920 }] };
};
async function concept(db: Awaited<ReturnType<typeof testDb>>, o: Partial<typeof schema.concepts.$inferInsert> = {}) {
  const [c] = await db.insert(schema.concepts).values({ title: "Dusk reveal", hook: "Sleep looks like this", format: "reel", platform: "instagram", status: "approved_for_production", caption: "Soft places to land for dogs and cats.", cta: "Shop at kukur.shop", productSlugs: dogItems.map((p) => p.slug), ...o }).returning(); return c;
}
describe("production agent", () => {
  it("stores assets, a draft content item awaiting QA, and marks the concept produced", async () => {
    const db = await testDb(); const c = await concept(db);
    const r = await produceConcept(db, c.id, stub); expect(r).toMatchObject({ skipped: false, assets: 2 });
    const assets = await db.select().from(schema.assets); expect(assets.map((a) => a.kind).sort()).toEqual(["cover", "reel"]); expect(assets.every((a) => a.qaStatus === "pending")).toBe(true);
    const [item] = await db.select().from(schema.contentItems); expect(item).toMatchObject({ status: "draft", platform: "instagram", format: "reel" }); expect(item.caption).toContain("Link in bio."); expect(item.contentHash).toHaveLength(64);
    expect((await db.select().from(schema.concepts).where(eq(schema.concepts.id, c.id)))[0].status).toBe("produced");
  });
  it("never produces the same concept twice and refuses unapproved concepts", async () => {
    const db = await testDb(); const c = await concept(db); await produceConcept(db, c.id, stub);
    expect(await produceConcept(db, c.id, stub)).toEqual({ skipped: true }); expect((await db.select().from(schema.contentItems)).length).toBe(1);
    await expect(produceConcept(db, (await concept(db, { status: "rejected" })).id, stub)).rejects.toThrow(/not approved/);
  });
  it("produces a story and notes interactive stickers", async () => {
    const db = await testDb(); const c = await concept(db, { format: "story", hook: "Box or bed first?", title: "Box or Bed Poll", productSlugs: [dogItems[0].slug, dogItems[1].slug] });
    const r = await produceConcept(db, c.id, stub); expect(r).toMatchObject({ interactive: true }); expect((await db.select().from(schema.assets))[0].kind).toBe("story_image");
  });
  it("runs through the worker queue and records a production agent run", async () => {
    const db = await testDb(); const c = await concept(db); await enqueue(db, "produce", { conceptId: c.id });
    expect(await runOnce(db, async () => { throw new Error("n/a"); }, new Date(), { renderer: stub })).toBe("produce done");
    expect((await db.select().from(schema.agentRuns)).some((r) => r.agentKey === "production" && r.status === "success")).toBe(true);
  });
});

describe("production fixes from the first real review", () => {
  it("keeps long hooks big by using more lines", () => { const l = hookLines("Why is everyone suddenly cleaning? Asks Biscuit"); expect(l.length).toBeGreaterThanOrEqual(4); expect(l.length).toBeLessThanOrEqual(5); expect(Math.max(...l.map((x) => x.length))).toBeLessThanOrEqual(16); });
  it("does not pad short concepts with unrelated products", () => { expect(() => buildReelSpec({ id: "x", hook: "h", title: "t", productSlugs: [dogItems[0].slug, dogItems[1].slug] }, cat)).toThrow(/at least 3/); });
  it("removes hashtags from the draft caption so tags are not duplicated", () => { const r = captionFor("instagram", "Soft places to land. #dogtoys #kukur Link in bio.", [dogItems[0]]); expect(r.caption).toBe("Soft places to land. Link in bio."); expect(r.caption).not.toContain("#"); });
  it("lays out 3 products in one row", async () => { expect(buildStorySpec({ id: "g", hook: "Everyday essentials", title: "t", productSlugs: [dogItems[0].slug, dogItems[1].slug, cat.products[5].slug] }, cat).spec.products).toHaveLength(3); });
});
