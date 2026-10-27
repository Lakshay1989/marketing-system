import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { and, eq, ne, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { loadCatalog } from "../agents/strategy";
import { putMedia } from "../storage";
import { audit } from "../audit";
import { enqueue } from "../queue";
import { buildReelSpec, buildStorySpec, captionFor } from "./specs";

export interface Rendered { files: { path: string; kind: "reel" | "cover" | "story_image" | "story_video"; mime: string; width: number; height: number; durationSec?: number }[] }
export type Renderer = (kind: "reel" | "story", spec: unknown, workDir: string) => Promise<Rendered>;

function exec(args: string[], timeoutMs = 20 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] }); let out = "", err = "";
    const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("render timed out")); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d)); p.on("error", reject);
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(`render failed (${code}): ${(err || out).slice(-400)}`)); });
  });
}
/** Real renderer: Chrome frame capture + original music + ffmpeg (reels) or a Chrome screenshot (stories). */
export const realRenderer: Renderer = async (kind, spec, workDir) => {
  fs.mkdirSync(workDir, { recursive: true }); const sp = path.join(workDir, "spec.json"); fs.writeFileSync(sp, JSON.stringify(spec));
  if (kind === "reel") {
    const meta = JSON.parse((await exec(["production/render-reel.mjs", sp, workDir])).trim().split("\n").pop()!);
    return { files: [{ path: path.join(workDir, "reel.mp4"), kind: "reel", mime: "video/mp4", width: 1080, height: 1920, durationSec: meta.durationSec }, { path: path.join(workDir, "cover.png"), kind: "cover", mime: "image/png", width: 1080, height: 1920 }] };
  }
  const png = path.join(workDir, "story.png"); await exec(["production/render-story.mjs", sp, png]);
  // Stories carry the same original soundtrack as reels: the finished image becomes an 8 s video (Instagram's API cannot attach library music).
  const mp4 = path.join(workDir, "story.mp4"); const meta = JSON.parse((await exec(["production/story-video.mjs", png, sp, mp4])).trim().split("\n").pop()!);
  return { files: [{ path: mp4, kind: "story_video", mime: "video/mp4", width: 1080, height: 1920, durationSec: meta.durationSec }, { path: png, kind: "cover", mime: "image/png", width: 1080, height: 1920 }] };
};

/** Turns one approved concept into stored media assets and a draft content item (QA still pending). Idempotent per concept. */
export async function produceConcept(db: Db, conceptId: string, renderer: Renderer = realRenderer) {
  const [c] = await db.select().from(schema.concepts).where(eq(schema.concepts.id, conceptId));
  if (!c) throw new Error("Concept not found");
  if (c.status === "produced") return { skipped: true as const };
  if (c.status !== "approved_for_production") throw new Error(`Concept is ${c.status}, not approved for production`);
  const catalog = loadCatalog(); const by = new Map(catalog.products.map((p) => [p.slug, p]));
  const note: string[] = []; let spec: unknown; let interactive = false;
  if (c.format === "reel") { const r = buildReelSpec({ id: c.id, hook: c.hook, title: c.title, productSlugs: c.productSlugs }, catalog); spec = r.spec; if (r.padded.length) note.push(`padded with ${r.padded.join(", ")} to reach a full-length reel`); }
  else { const r = buildStorySpec({ id: c.id, hook: c.hook, title: c.title, productSlugs: c.productSlugs }, catalog); spec = r.spec; interactive = r.interactive; if (interactive) note.push("needs the poll sticker added manually in Instagram"); }
  const workDir = path.resolve(".data/production", c.id);
  const [{ prior }] = await db.select({ prior: sql<number>`count(*)::int` }).from(schema.assets).where(and(eq(schema.assets.conceptId, c.id), ne(schema.assets.kind, "cover")));
  const version = prior + 1;
  const out = await renderer(c.format === "reel" ? "reel" : "story", spec, workDir);
  const stored: { id: string; kind: string }[] = [];
  for (const f of out.files) {
    const buf = fs.readFileSync(f.path); const key = `${c.format}s/${c.id}/v${version}/${path.basename(f.path)}`;
    await putMedia(key, buf, f.mime);
    const [a] = await db.insert(schema.assets).values({ conceptId: c.id, kind: f.kind, storageKey: key, mimeType: f.mime, width: f.width, height: f.height, durationSec: f.durationSec, bytes: buf.length, qaStatus: "pending", version, qaReport: { notes: note, spec, audio: f.kind === "reel" || f.kind === "story_video" ? "original-generated" : undefined, sha256: createHash("sha256").update(buf).digest("hex") } }).onConflictDoNothing().returning();
    if (a) stored.push({ id: a.id, kind: f.kind });
  }
  const main = stored.find((s) => s.kind !== "cover"); if (!main) throw new Error("Render produced no main asset");
  const products = c.productSlugs.map((s) => by.get(s)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const { caption, hashtags } = captionFor(c.platform as "instagram" | "facebook", c.caption ?? c.title, products);
  const [item] = await db.insert(schema.contentItems).values({ conceptId: c.id, assetId: main.id, platform: c.platform, format: c.format, caption, hashtags, cta: c.cta, status: "draft", contentHash: (await db.select().from(schema.assets).where(eq(schema.assets.id, main.id)))[0].qaReport?.sha256 as string }).returning();
  // Every Instagram reel is also offered to Facebook (same video, Facebook caption), so the Page gets steady reels too.
  let siblingId: string | undefined;
  if (c.format === "reel" && c.platform === "instagram") siblingId = (await createFacebookSibling(db, item.id))?.id;
  await db.update(schema.concepts).set({ status: "produced", notes: note.join("; ") || c.notes }).where(eq(schema.concepts.id, c.id));
  fs.rmSync(workDir, { recursive: true, force: true });
  await audit(db, "production", "concept.produced", c.id, { assets: stored.length, interactive });
  return { skipped: false as const, contentItemId: item.id, siblingId, assets: stored.length, interactive, notes: note };
}

/** Creates a Facebook content item that reuses the Instagram reel's video. QA still runs on it (text checks) before it is scheduled. */
export async function createFacebookSibling(db: Db, igItemId: string) {
  const [ig] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, igItemId));
  if (!ig || ig.platform !== "instagram" || ig.format !== "reel" || !ig.assetId || !ig.conceptId) return null;
  const dup = await db.select().from(schema.contentItems).where(and(eq(schema.contentItems.assetId, ig.assetId), eq(schema.contentItems.platform, "facebook")));
  if (dup.length) return null;
  const [concept] = await db.select().from(schema.concepts).where(eq(schema.concepts.id, ig.conceptId));
  const by = new Map(loadCatalog().products.map((p) => [p.slug, p])); const products = (concept?.productSlugs ?? []).map((x) => by.get(x)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const { caption, hashtags } = captionFor("facebook", ig.caption.replace(/\s*link in bio\.?/gi, ""), products);
  const [fb] = await db.insert(schema.contentItems).values({ conceptId: ig.conceptId, assetId: ig.assetId, platform: "facebook", format: "reel", caption, hashtags: hashtags.length ? hashtags : ig.hashtags, cta: "Shop at kukur.shop", status: "draft", contentHash: ig.contentHash }).returning();
  await enqueue(db, "qa", { contentItemId: fb.id }, { idempotencyKey: `qa:${fb.id}`, maxAttempts: 2 });
  return fb;
}
