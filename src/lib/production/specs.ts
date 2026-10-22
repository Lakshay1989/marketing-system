import { createHash } from "node:crypto";
import type { CatalogProduct } from "../agents/strategy";

export const inr = (price: string | number) => "₹" + Math.round(Number(price)).toLocaleString("en-IN");
const STOP = new Set(["dog", "cat", "pet", "puppy", "everyday", "the", "and", "set", "foldable", "portable", "for"]);
/** One big word for a product card, e.g. "Dog Rope Toy" -> "ROPE". */
export function productWord(name: string): string {
  const w = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean); const pick = w.find((x) => !STOP.has(x.toLowerCase())) ?? w[0] ?? "NEW";
  return pick.toUpperCase().slice(0, 9);
}
/** Splits a hook into up to 5 short lines (about 11 characters each) of upper-case words, so long hooks stay big and readable. */
export function hookLines(hook: string, maxLines = 5, lineChars = 11): string[] {
  const words = hook.replace(/[“”"]/g, "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [words[0] ?? "KUKUR"];
  const lines: string[] = []; let cur = "";
  for (const w of words) { if (cur && (cur + " " + w).length > lineChars) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; }
  if (cur) lines.push(cur);
  while (lines.length > maxLines) { let k = 0; for (let i = 1; i < lines.length - 1; i++) if (lines[i].length + lines[i + 1].length < lines[k].length + lines[k + 1].length) k = i; lines.splice(k, 2, lines[k] + " " + lines[k + 1]); }
  return lines;
}
const pickIdx = (seed: string, n: number) => parseInt(createHash("sha1").update(seed).digest("hex").slice(0, 6), 16) % n;
const speciesOf = (ps: CatalogProduct[]) => { const dog = ps.some((p) => p.species.includes("dog")), cat = ps.some((p) => p.species.includes("cat")); return dog && cat ? "both" : cat ? "cat" : "dog"; };

export interface ReelSpec { template: "showcase"; bpm: number; key: string; seed: number; hookLines: string[]; products: { slug: string; name: string; price: string; word: string }[]; petPhotos: string[]; petWords: string[]; tag: string; cta: string }
export interface ConceptLike { id: string; hook: string; title: string; productSlugs: string[] }

export function buildReelSpec(c: ConceptLike, catalog: { products: CatalogProduct[] }): { spec: ReelSpec; padded: string[] } {
  const by = new Map(catalog.products.map((p) => [p.slug, p])); const items = c.productSlugs.map((s) => by.get(s)).filter((p): p is CatalogProduct => Boolean(p)).slice(0, 6);
  if (!items.length) throw new Error("Concept has no valid catalogue products");
  // A reel needs at least 3 real products to be a full-length showcase. We never pad with unrelated items: the concept must name enough products.
  if (items.length < 3) throw new Error(`A reel needs at least 3 catalogue products (concept has ${items.length})`);
  const padded: string[] = []; const sp = speciesOf(items);
  const photos = sp === "cat" ? ["cat.jpg", "dogcat.jpg"] : sp === "both" ? ["golden.jpg", "cat.jpg"] : ["golden.jpg", "beagle.jpg"];
  const words = sp === "cat" ? ["PURR", "POUNCE"] : sp === "both" ? ["LOVE", "PLAY"] : ["WAG", "PLAY"];
  const keys = ["C", "D", "G", "F", "A"]; const bpms = [112, 116, 120, 124, 128];
  return { padded, spec: { template: "showcase", bpm: bpms[pickIdx(c.id, bpms.length)], key: keys[pickIdx(c.id + "k", keys.length)], seed: pickIdx(c.id + "s", 50) + 3, hookLines: hookLines(c.hook),
    products: items.map((p) => ({ slug: p.slug, name: p.name, price: inr(p.price), word: productWord(p.name) })), petPhotos: photos, petWords: words, tag: "EVERY TAIL TELLS A STORY.", cta: "kukur.shop" } };
}

export interface StorySpec { template: "grid" | "poll" | "hero"; bg: string; headline: [string, number, string][]; products: { slug: string; name: string; short: string; price: string }[]; pill?: string; pillBg?: string; prompt?: string; photos?: string[]; photo?: string }
const shortName = (n: string) => n.replace(/^(Dog|Cat|Pet|Everyday)\s+/i, "").slice(0, 14);
export function buildStorySpec(c: ConceptLike & { storyboard?: unknown[] }, catalog: { products: CatalogProduct[] }): { spec: StorySpec; interactive: boolean } {
  const by = new Map(catalog.products.map((p) => [p.slug, p])); const items = c.productSlugs.map((s) => by.get(s)).filter((p): p is CatalogProduct => Boolean(p)).slice(0, 6);
  if (!items.length) throw new Error("Concept has no valid catalogue products");
  const poll = /poll|vote|which|or\b.*\?/i.test(c.title + " " + c.hook) && items.length >= 2;
  const lines = hookLines(c.hook, 4, 14).map((l, i, a) => [l, Math.min(a.length === 1 ? 150 : 120, Math.floor(960 / (l.length * 0.74))), i === a.length - 1 && a.length > 1 ? "orange" : "forest"] as [string, number, string]);
  const prods = items.map((p) => ({ slug: p.slug, name: p.name, short: shortName(p.name), price: inr(p.price) }));
  const bgs = ["cream", "forest", "sand", "orange"]; const bg = bgs[pickIdx(c.id, bgs.length)]; const darkBg = bg === "forest" || bg === "orange";
  const fixed = lines.map(([t, px, col]) => [t, px, darkBg ? (col === "forest" ? "cream" : col === "orange" ? "gold" : col) : col] as [string, number, string]);
  return { interactive: poll, spec: poll ? { template: "poll", bg, headline: fixed, products: prods.slice(0, 2), prompt: "Vote with the poll sticker 👇" } : { template: "grid", bg, headline: fixed, products: prods, pill: "🔗 Tap the link · kukur.shop", pillBg: darkBg ? "orange" : "forest" } };
}

const TAGS = { dog: ["#dogsofindia", "#dogparents", "#petstoreindia", "#dogtoys"], cat: ["#catsofindia", "#catparents", "#petstoreindia", "#cattoys"], both: ["#dogsofindia", "#catsofindia", "#petparentsindia", "#petstoreindia"] } as const;
export function captionFor(platform: "instagram" | "facebook", draft: string, products: CatalogProduct[]): { caption: string; hashtags: string[] } {
  const base = draft.replace(/#\w+/g, "").replace(/\s*(link in bio|shop (now )?at kukur\.shop)\.?/gi, "").replace(/\s+/g, " ").trim();
  const cta = platform === "instagram" ? "Link in bio." : "Shop at kukur.shop";
  return { caption: `${base} ${cta}`.replace(/\s+/g, " ").trim(), hashtags: [...TAGS[speciesOf(products)]] };
}
