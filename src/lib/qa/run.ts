import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, ne, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { audit } from "../audit";
import { signedMediaUrl, s3Configured } from "../storage";
import { checkDuplicates, checkPrices, checkReelMedia, checkStoryMedia, checkText, verdict, type Check, type MediaFacts } from "./rules";
import { inspectFile } from "./inspect";

export interface QaDeps {
  inspector?: (file: string, kind: "video" | "image") => Promise<MediaFacts>;
  fetchMedia?: (storageKey: string, ext: string) => Promise<string>;
  livePrices?: (slugs: string[]) => Promise<Record<string, number | null>>;
  unknownWords?: (text: string) => string[];
}
export const MAX_REVISIONS = 2;

/** Downloads the file from the private bucket (signed link) or reads the local fallback copy. */
export async function fetchMedia(key: string, ext: string): Promise<string> {
  const f = path.join(os.tmpdir(), `kmai-qa-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  if (!s3Configured()) { fs.copyFileSync(path.resolve("media", key), f); return f; }
  const r = await fetch(await signedMediaUrl(key, 600)); if (!r.ok) throw new Error(`Could not download ${key}: HTTP ${r.status}`);
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f;
}
/** Reads the real price of each product from the live store's own structured data (kukur.shop). */
export async function livePrices(slugs: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (const s of slugs) {
    out[s] = null;
    try {
      const html = await (await fetch(`https://kukur.shop/product/${s}`, { signal: AbortSignal.timeout(15000) })).text();
      for (const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) { try { const j = JSON.parse(m[1]); for (const x of Array.isArray(j) ? j : [j]) if (x["@type"] === "Product") { const o = Array.isArray(x.offers) ? x.offers[0] : x.offers; const p = Number(o?.price ?? o?.lowPrice); if (p > 0) out[s] = p; } } catch { /* skip bad block */ } }
    } catch { /* leave null: unverifiable */ }
  }
  return out;
}
const ALLOW = new Set(["kukur", "diwali", "dhanteras", "bandana", "leash", "crinkle", "scratcher", "snuffle", "indian", "india", "petstoreindia", "dogsofindia", "catsofindia", "whatsapp", "instagram", "facebook", "harness", "kennel"]);
let dict: Set<string> | null = null;
export function unknownWords(text: string): string[] {
  if (!dict) { try { dict = new Set(fs.readFileSync("/usr/share/dict/words", "utf8").split("\n").map((w) => w.trim().toLowerCase())); } catch { dict = new Set(); } }
  if (!dict.size) return [];
  const known = (w: string) => dict!.has(w) || ALLOW.has(w) || [w.endsWith("s") ? w.slice(0, -1) : "", w.endsWith("es") ? w.slice(0, -2) : "", w.endsWith("ing") ? w.slice(0, -3) : "", w.endsWith("ing") ? w.slice(0, -3) + "e" : "", w.endsWith("ed") ? w.slice(0, -2) : "", w.endsWith("ed") ? w.slice(0, -1) : "", w.endsWith("ly") ? w.slice(0, -2) : "", w.endsWith("'s") ? w.slice(0, -2) : ""].some((x) => x.length > 2 && dict!.has(x));
  return [...new Set(text.replace(/#\w+/g, " ").replace(/https?:\/\/\S+/g, " ").split(/[^A-Za-z']+/).map((w) => w.toLowerCase()).filter((w) => w.length >= 4 && !known(w)))];
}

/** Reviews one content item end to end. Passing moves it to the approval queue; failing sends it back for revision (max 2) or rejects the concept. */
export async function qaContentItem(db: Db, itemId: string, deps: QaDeps = {}) {
  const [item] = await db.select().from(schema.contentItems).where(eq(schema.contentItems.id, itemId)); if (!item) throw new Error("Content item not found");
  if (!item.assetId) throw new Error("Content item has no asset");
  const [asset] = await db.select().from(schema.assets).where(eq(schema.assets.id, item.assetId));
  if (asset.qaStatus === "passed") return { skipped: true as const, passed: true };
  const [concept] = item.conceptId ? await db.select().from(schema.concepts).where(eq(schema.concepts.id, item.conceptId)) : [];
  const isVideo = asset.mimeType.startsWith("video"); const ext = isVideo ? "mp4" : "png";
  const file = await (deps.fetchMedia ?? fetchMedia)(asset.storageKey, ext);
  let facts: MediaFacts; try { facts = await (deps.inspector ?? inspectFile)(file, isVideo ? "video" : "image"); } finally { fs.rmSync(file, { force: true }); }
  const checks: Check[] = [...(isVideo ? checkReelMedia(facts, item.platform) : checkStoryMedia(facts)), ...checkText({ platform: item.platform, format: item.format, caption: item.caption, hashtags: item.hashtags, cta: item.cta }, (deps.unknownWords ?? unknownWords)(item.caption))];
  const report = (asset.qaReport ?? {}) as { spec?: { products?: { slug: string; price: string }[] }; audio?: string };
  const specProducts = report.spec?.products ?? [];
  if (specProducts.length) checks.push(...checkPrices(specProducts, await (deps.livePrices ?? livePrices)(specProducts.map((p) => p.slug))));
  else if (isVideo || item.format === "story") checks.push({ name: "prices match the live store", status: "warn", detail: "not checked: no record of the prices shown in this asset" });
  if (isVideo) checks.push({ name: "audio is original (no licensed music)", status: report.audio === "original-generated" ? "pass" : "warn", detail: report.audio ?? "provenance not recorded" });
  const count = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: { n: number }[] }).rows[0].n;
  const sha = (asset.qaReport as { sha256?: string } | null)?.sha256;
  const sameHash = item.contentHash ? await count(sql`select count(*)::int n from content_items where content_hash=${item.contentHash} and id<>${item.id} and status<>'rejected'`) : 0;
  const sameCaption = await count(sql`select count(*)::int n from content_items where caption=${item.caption} and id<>${item.id} and status not in ('rejected','qa_failed')`);
  const sameHook = concept ? await count(sql`select count(*)::int n from concepts where lower(hook)=lower(${concept.hook}) and id<>${concept.id} and status in ('produced')`) : 0;
  void sha; checks.push(...checkDuplicates(sameHash, sameCaption, sameHook));
  const v = verdict(checks);
  await db.update(schema.assets).set({ qaStatus: v.passed ? "passed" : "failed", qaReport: { ...(asset.qaReport ?? {}), checks, passed: v.passed, checkedAt: new Date().toISOString() } }).where(eq(schema.assets.id, asset.id));
  // Passing keeps an owner approval that already exists; otherwise the item joins the approval queue. Failing always withdraws approval.
  if (v.passed) { if (item.status === "draft" || item.status === "qa_failed") await db.update(schema.contentItems).set({ status: "awaiting_approval" }).where(eq(schema.contentItems.id, item.id)); }
  else {
    await db.update(schema.contentItems).set({ status: "qa_failed" }).where(eq(schema.contentItems.id, item.id));
    if (concept) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.assets).where(and(eq(schema.assets.conceptId, concept.id), ne(schema.assets.kind, "cover")));
      const reason = v.failed.map((f) => `${f.name}: ${f.detail}`).join("; ");
      if (n < MAX_REVISIONS) await db.update(schema.concepts).set({ status: "approved_for_production", notes: `QA revision ${n}: ${reason}`.slice(0, 500) }).where(eq(schema.concepts.id, concept.id));
      else await db.update(schema.concepts).set({ status: "rejected", notes: `QA failed after ${n} attempts: ${reason}`.slice(0, 500) }).where(eq(schema.concepts.id, concept.id));
    }
  }
  await audit(db, "qa", v.passed ? "qa.passed" : "qa.failed", item.id, { failed: v.failed.map((f) => f.name), warnings: v.warnings.length });
  return { skipped: false as const, passed: v.passed, failed: v.failed, warnings: v.warnings, checks };
}
