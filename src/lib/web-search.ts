import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface SearchResult { title: string; url: string; snippet: string; publisherUrl?: string }
export interface OpenedSource extends SearchResult { pageTitle: string; excerpt: string }
export type SearchProvider = (query: string, maxResults?: number) => Promise<SearchResult[]>;

const UA = "Mozilla/5.0 (compatible; KukurMarketingAI/0.1; +https://kukur.shop)";
const TIMEOUT_MS = 12_000;
const PAGE_BYTES_LIMIT = 1_500_000;
const PAGE_TEXT_LIMIT = 2_000;

function decodeHtml(s: string): string {
  return s.replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)));
}
const textOnly = (s: string) => decodeHtml(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

function resultUrl(raw: string): string | null {
  try {
    let url = new URL(decodeHtml(raw), "https://html.duckduckgo.com");
    if (url.hostname.endsWith("duckduckgo.com")) {
      const redirected = url.searchParams.get("uddg");
      if (!redirected) return null;
      url = new URL(redirected);
    }
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}

function xmlText(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeHtml(xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"))?.[1] ?? "").trim();
}

export function parseGoogleNewsResults(xml: string, maxResults = 8): SearchResult[] {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  const out: SearchResult[] = [];
  for (const item of items) {
    const title = textOnly(xmlText(item, "title")).slice(0, 240);
    const url = resultUrl(xmlText(item, "link"));
    const description = xmlText(item, "description");
    const sourceTag = item.match(/<source\b([^>]*)>/i);
    const source = textOnly(xmlText(item, "source"));
    const publisherUrl = sourceTag?.[1].match(/\burl="([^"]+)"/i)?.[1];
    const safePublisherUrl = publisherUrl ? resultUrl(publisherUrl) ?? undefined : undefined;
    const snippet = [source, textOnly(description)].filter(Boolean).join(" — ").slice(0, 900);
    if (!title || !url || out.some((r) => r.url === url)) continue;
    out.push({ title, url, snippet, publisherUrl: safePublisherUrl });
    if (out.length >= maxResults) break;
  }
  return out;
}

/** Public Google News RSS search; no API key is required. */
export const googleNewsSearch: SearchProvider = async (query, maxResults = 8) => {
  const url = new URL("https://news.google.com/rss/search");
  url.search = new URLSearchParams({ q: query, hl: "en-IN", gl: "IN", ceid: "IN:en" }).toString();
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "application/rss+xml,application/xml,text/xml" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Web search failed (Google News RSS HTTP ${response.status})`);
  const results = parseGoogleNewsResults(await response.text(), maxResults);
  if (!results.length) throw new Error("Web search returned no parseable results; trend research stopped without inventing sources");
  return results;
};

/** Self-hostable SearXNG JSON API; useful on EC2 without a commercial search API key. */
export const searxngSearch: SearchProvider = async (query, maxResults = 8) => {
  const base = process.env.SEARXNG_BASE_URL?.trim();
  if (!base) throw new Error("WEB_SEARCH_PROVIDER=searxng requires SEARXNG_BASE_URL");
  const url = new URL("search", base.endsWith("/") ? base : `${base}/`);
  url.search = new URLSearchParams({ q: query, format: "json", language: "en-IN", safesearch: "1" }).toString();
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Web search failed (SearXNG HTTP ${response.status})`);
  const data = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  const results = (data.results ?? []).flatMap((r) => {
    if (!r.title || !r.url) return [];
    const safeUrl = resultUrl(r.url); return safeUrl ? [{ title: textOnly(r.title).slice(0, 240), url: safeUrl, snippet: textOnly(r.content ?? "").slice(0, 900) }] : [];
  }).slice(0, maxResults);
  if (!results.length) throw new Error("SearXNG returned no usable HTTPS results");
  return results;
};

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const lower = address.toLowerCase();
    if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
    return !(lower.startsWith("2") || lower.startsWith("3")); // only global 2000::/3 IPv6 is allowed
  }
  const p = address.split(".").map(Number); if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
}

async function assertPublicHttps(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error("Source URL must use public HTTPS");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Private source hosts are not allowed");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("Private or reserved source addresses are not allowed");
  return url;
}

async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > PAGE_BYTES_LIMIT) throw new Error("Source page is too large to inspect");
  if (!response.body) return "";
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > PAGE_BYTES_LIMIT) { await reader.cancel(); throw new Error("Source page is too large to inspect"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/** Opens a search result with redirect and private-address checks, then extracts a small text excerpt. */
export async function openSearchResult(result: SearchResult): Promise<OpenedSource> {
  let current = result.url;
  for (let redirects = 0; redirects <= 4; redirects++) {
    const url = await assertPublicHttps(current);
    const response = await fetch(url, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location"); if (!location || redirects === 4) throw new Error("Source redirects could not be followed safely");
      current = new URL(location, url).href; continue;
    }
    if (!response.ok) throw new Error(`Source page returned HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) throw new Error("Source is not an HTML page");
    const html = await readLimited(response);
    const pageTitle = textOnly(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? result.title).slice(0, 240);
    const cleaned = html.replace(/<(script|style|svg|noscript|nav|footer|header|form)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
    let excerpt = textOnly(cleaned).slice(0, PAGE_TEXT_LIMIT);
    if (excerpt.length < 80) {
      // Google News item pages are client-rendered; retain their fetched RSS item summary
      // as evidence instead of treating the empty shell as article content.
      if (url.hostname === "news.google.com" && result.snippet.length >= 30) excerpt = `Google News RSS item summary: ${result.snippet}`;
      else throw new Error("Source page did not contain enough readable text");
    }
    return { ...result, url: url.href, pageTitle, excerpt };
  }
  throw new Error("Source redirects could not be followed safely");
}

export async function searchAndOpen(search?: SearchProvider, queries?: string[]): Promise<{ sources: OpenedSource[]; failures: { url: string; reason: string }[] }> {
  const selectedSearch = search ?? (process.env.WEB_SEARCH_PROVIDER === "searxng" ? searxngSearch : googleNewsSearch);
  const searches = queries ?? [
    "India pet brand social media campaign Instagram Reels 2026",
    "pet industry brand campaign social media trend 2026",
    "Instagram Reels trends creators brands India 2026",
  ];
  const groups = await Promise.all(searches.map(async (q) => {
    try { return { results: await selectedSearch(q, 5) }; }
    catch (e) { return { error: String((e as Error).message).slice(0, 160) }; }
  }));
  const resultGroups: SearchResult[][] = groups.flatMap((g) => "results" in g && g.results ? [g.results] : []);
  if (!resultGroups.some((group) => group.length)) throw new Error(`Web search failed for all queries: ${groups.flatMap((g) => "error" in g ? [g.error] : []).join(" | ")}`);
  const candidates = resultGroups.flat();
  const unique = candidates.filter((item, i, all): item is SearchResult => Boolean(item) && all.findIndex((x) => x?.url === item.url) === i).slice(0, 9);
  const checked: ({ ok: OpenedSource } | { fail: { url: string; reason: string } })[] = [];
  for (let i = 0; i < unique.length; i += 3) {
    checked.push(...await Promise.all(unique.slice(i, i + 3).map(async (r) => {
      try { return { ok: await openSearchResult(r) }; }
      catch (e) { return { fail: { url: r.url, reason: String((e as Error).message).slice(0, 160) } }; }
    })));
  }
  return { sources: checked.flatMap((x) => "ok" in x ? [x.ok] : []), failures: checked.flatMap((x) => "fail" in x ? [x.fail] : []) };
}
