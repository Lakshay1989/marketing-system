import { bannedClaim } from "../agents/strategy";

export type Check = { name: string; status: "pass" | "warn" | "fail"; detail: string };
export interface MediaFacts { width: number; height: number; durationSec: number | null; fps: number | null; videoCodec: string | null; hasAudio: boolean; loudnessLufs: number | null; truePeakDb: number | null; blackSeconds: number; frozenSeconds: number; bytes: number; firstFrameStdDev: number | null }
export interface SpecPrice { slug: string; price: string }
export interface Item { platform: string; format: string; caption: string; hashtags: string[]; cta: string | null }

const c = (name: string, ok: boolean, detail: string, soft = false): Check => ({ name, status: ok ? "pass" : soft ? "warn" : "fail", detail });
const fmt = (n: number | null, d = 1) => (n === null ? "n/a" : n.toFixed(d));

/** Technical checks for a reel video against Instagram/Facebook Reels requirements and our own standards. */
export function checkReelMedia(m: MediaFacts, platform: string): Check[] {
  const out: Check[] = [];
  out.push(c("format 9:16 1080x1920", m.width === 1080 && m.height === 1920, `${m.width}x${m.height}`));
  out.push(c("video codec H.264", m.videoCodec === "h264", String(m.videoCodec)));
  out.push(c("duration 3-90 s", m.durationSec !== null && m.durationSec >= 3 && m.durationSec <= 90, `${fmt(m.durationSec)} s`));
  out.push(c("short enough to hold attention (<= 45 s)", m.durationSec !== null && m.durationSec <= 45, `${fmt(m.durationSec)} s`, true));
  out.push(c("frame rate 24-60 fps", m.fps !== null && m.fps >= 24 && m.fps <= 60, `${fmt(m.fps)} fps`));
  out.push(c("file size <= 100 MB", m.bytes <= 100e6, `${(m.bytes / 1e6).toFixed(1)} MB`));
  out.push(c("has an audio track", m.hasAudio, m.hasAudio ? "yes" : "silent video"));
  if (m.hasAudio) {
    out.push(c("audio loudness -20 to -12 LUFS", m.loudnessLufs !== null && m.loudnessLufs >= -20 && m.loudnessLufs <= -12, `${fmt(m.loudnessLufs)} LUFS`));
    out.push(c("true peak at or below -1 dBTP (no clipping)", m.truePeakDb !== null && m.truePeakDb <= -1, `${fmt(m.truePeakDb)} dBTP`));
  }
  out.push(c("no black frames", m.blackSeconds < 0.3, `${fmt(m.blackSeconds, 2)} s black`));
  out.push(c("no frozen video", m.frozenSeconds < 2.5, `${fmt(m.frozenSeconds, 2)} s frozen`, true));
  out.push(c("first frame is not blank", m.firstFrameStdDev === null || m.firstFrameStdDev > 12, `contrast ${fmt(m.firstFrameStdDev)}`, true));
  return out;
}
export function checkStoryMedia(m: MediaFacts): Check[] {
  return [c("format 9:16 1080x1920", m.width === 1080 && m.height === 1920, `${m.width}x${m.height}`), c("file size <= 30 MB", m.bytes <= 30e6, `${(m.bytes / 1e6).toFixed(1)} MB`), c("image is not blank", m.firstFrameStdDev === null || m.firstFrameStdDev > 12, `contrast ${fmt(m.firstFrameStdDev)}`)];
}

/** Caption, hashtags, links and claims. Spelling is a warning only: a dictionary cannot know every pet-product word. */
export function checkText(item: Item, unknownWords: string[]): Check[] {
  const out: Check[] = []; const text = [item.caption, item.cta ?? ""].join(" ");
  out.push(c("caption length <= 2200", item.caption.length <= 2200, `${item.caption.length} chars`));
  out.push(c("caption is not empty and not too short", item.caption.trim().length >= 20, `${item.caption.trim().length} chars`));
  out.push(c("hashtags 3-10", item.hashtags.length >= 3 && item.hashtags.length <= 10, `${item.hashtags.length} tags`, true));
  out.push(c("no hashtags typed inside the caption (tags are separate)", !/#\w/.test(item.caption), "ok"));
  const claim = bannedClaim(text); out.push(c("no banned claims (health, safe, vet approved, discounts)", !claim, claim ?? "none"));
  const cta = item.platform === "instagram" ? /link in bio/i.test(item.caption) : /kukur\.shop/i.test(item.caption);
  out.push(c(item.platform === "instagram" ? "call to action: link in bio" : "call to action: kukur.shop", cta, cta ? "present" : "missing"));
  out.push(c("no repeated words or stray punctuation", !/\b(\w{3,})\s+\1\b/i.test(item.caption) && !/[!?.]{3,}/.test(item.caption), "ok", true));
  out.push(c("no prices in the text", !PRICE_TEXT.test(item.caption), "ok"));
  out.push(c("spelling", unknownWords.length === 0, unknownWords.length ? `unrecognised: ${unknownWords.slice(0, 6).join(", ")}` : "no unknown words", true));
  return out;
}

/** Policy (26 Oct 2026): no prices anywhere in reels or stories. Any price text in the render spec fails QA. */
export function checkPrices(spec: SpecPrice[], _live: Record<string, number | null> = {}): Check[] {
  const shown = spec.filter((p) => p.price && p.price.trim());
  return [{ name: "no prices shown in the video", status: shown.length ? "fail" : "pass", detail: shown.length ? `prices found for: ${shown.map((p) => p.slug).join(", ")}` : "none shown" }];
}
export const PRICE_TEXT = /₹|\brs\.?\s*\d|\binr\b|\bprices?\b|\bunder\s+\d/i;

export function checkDuplicates(sameHash: number, sameCaption: number, sameHook: number): Check[] {
  return [c("not a duplicate file", sameHash === 0, sameHash ? `${sameHash} identical file(s) already exist` : "unique"), c("caption not used before", sameCaption === 0, sameCaption ? `${sameCaption} earlier item(s) with the same caption` : "unique"), c("hook not used before", sameHook === 0, sameHook ? `${sameHook} earlier concept(s) with the same hook` : "unique", true)];
}
export const verdict = (checks: Check[]) => ({ passed: !checks.some((x) => x.status === "fail"), failed: checks.filter((x) => x.status === "fail"), warnings: checks.filter((x) => x.status === "warn") });
