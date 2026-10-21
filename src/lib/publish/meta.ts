/**
 * Meta Graph API client (Instagram + Facebook Page publishing).
 * STATUS: written against Meta's documented content-publishing flows and unit-tested with a mocked fetch.
 * It has NOT been exercised against the live API: that needs the Meta app, permissions and a Page token (see docs/02-accounts-and-permissions.md).
 * Rule: a post counts as published only if the platform lookup after publishing returns a permalink.
 */
export interface MetaConfig { graphVersion: string; pageId: string; igUserId: string; pageToken: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; pollMs?: number; maxPolls?: number }
export interface Verified { externalId: string; url: string; verified: true; raw: Record<string, unknown> }
export class MetaError extends Error { constructor(msg: string, public transient: boolean, public status?: number) { super(msg); } }

const redact = (s: string) => s.replace(/(access_token=)[^&"\s]+/gi, "$1***");

export function metaClient(cfg: MetaConfig) {
  const f = cfg.fetchImpl ?? fetch;
  const sleep = cfg.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const base = `https://graph.facebook.com/${cfg.graphVersion}`;

  async function call(method: "GET" | "POST", path: string, params: Record<string, string> = {}): Promise<Record<string, any>> {
    const qs = new URLSearchParams({ ...params, access_token: cfg.pageToken });
    const url = method === "GET" ? `${base}${path}?${qs}` : `${base}${path}`;
    const res = await f(url, method === "POST" ? { method, body: qs, headers: { "content-type": "application/x-www-form-urlencoded" } } : { method });
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (!res.ok || json.error) {
      const e = json.error ?? {};
      const transient = res.status >= 500 || res.status === 429 || e.is_transient === true || [1, 2, 4, 17, 32, 613].includes(e.code);
      throw new MetaError(redact(`Meta ${method} ${path} failed: ${res.status} ${e.message ?? ""}`.trim()), transient, res.status);
    }
    return json;
  }

  /** Checks the connected accounts and what they can do. Used by the dashboard's account status. */
  async function checkAccounts() {
    const ig = await call("GET", `/${cfg.igUserId}`, { fields: "username,account_type" }).then((r) => ({ ok: true as const, username: r.username as string, accountType: r.account_type as string })).catch((e: MetaError) => ({ ok: false as const, error: e.message }));
    const page = await call("GET", `/${cfg.pageId}`, { fields: "name" }).then((r) => ({ ok: true as const, name: r.name as string })).catch((e: MetaError) => ({ ok: false as const, error: e.message }));
    return { instagram: ig, facebook: page };
  }

  async function waitForContainer(id: string) {
    for (let i = 0; i < (cfg.maxPolls ?? 40); i++) {
      const s = await call("GET", `/${id}`, { fields: "status_code,status" });
      if (s.status_code === "FINISHED") return;
      if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new MetaError(`Instagram container ${s.status_code}: ${s.status ?? ""}`, false);
      await sleep(cfg.pollMs ?? 3000);
    }
    throw new MetaError("Instagram container did not finish processing in time", true);
  }

  async function publishInstagram(kind: "REELS" | "STORIES", media: { videoUrl?: string; imageUrl?: string; caption?: string; coverUrl?: string }): Promise<Verified> {
    const params: Record<string, string> = { media_type: kind };
    if (media.videoUrl) params.video_url = media.videoUrl;
    if (media.imageUrl) params.image_url = media.imageUrl;
    if (kind === "REELS") { if (media.caption) params.caption = media.caption; if (media.coverUrl) params.cover_url = media.coverUrl; params.share_to_feed = "true"; }
    const container = await call("POST", `/${cfg.igUserId}/media`, params);
    await waitForContainer(container.id);
    const published = await call("POST", `/${cfg.igUserId}/media_publish`, { creation_id: container.id });
    // Verification: ask the platform for the live media object.
    const look = await call("GET", `/${published.id}`, { fields: "permalink,media_type,timestamp" });
    if (!look.permalink) throw new MetaError("Published but the platform did not return a permalink: not verified", true);
    return { externalId: published.id as string, url: look.permalink as string, verified: true, raw: look };
  }
  const publishInstagramReel = (m: { videoUrl: string; caption: string; coverUrl?: string }) => publishInstagram("REELS", m);
  const publishInstagramStory = (m: { videoUrl?: string; imageUrl?: string }) => publishInstagram("STORIES", m);

  /** Facebook Page Reel: start, upload by hosted file URL, finish as PUBLISHED, then look the video up. */
  async function publishFacebookReel(m: { videoUrl: string; description: string }): Promise<Verified> {
    const start = await call("POST", `/${cfg.pageId}/video_reels`, { upload_phase: "start" });
    const up = await f(start.upload_url as string, { method: "POST", headers: { Authorization: `OAuth ${cfg.pageToken}`, file_url: m.videoUrl } });
    const upJson = (await up.json().catch(() => ({}))) as Record<string, any>;
    if (!up.ok || upJson.success === false) throw new MetaError(`Facebook reel upload failed: ${up.status}`, up.status >= 500);
    await call("POST", `/${cfg.pageId}/video_reels`, { upload_phase: "finish", video_id: start.video_id as string, video_state: "PUBLISHED", description: m.description });
    const look = await call("GET", `/${start.video_id}`, { fields: "permalink_url,status" });
    if (!look.permalink_url) throw new MetaError("Facebook reel submitted but no permalink yet: not verified", true);
    const url = String(look.permalink_url).startsWith("http") ? String(look.permalink_url) : `https://www.facebook.com${look.permalink_url}`;
    return { externalId: start.video_id as string, url, verified: true, raw: look };
  }

  return { checkAccounts, publishInstagramReel, publishInstagramStory, publishFacebookReel };
}
