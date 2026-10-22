/**
 * Connects the Kukur Facebook Page and its Instagram account to this system.
 * Input: the Meta app id + secret and a short-lived user token from the Graph API Explorer (entered by the owner in a hidden terminal prompt).
 * Output: a non-expiring Page access token (derived from a long-lived user token), the Page id and the Instagram business account id.
 * Nothing here logs or returns the secret or the user token.
 */
export const REQUIRED_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "instagram_manage_insights"];
export interface ConnectInput { appId: string; /** Optional. Without it the token must already be long-lived (extend it in Meta's Access Token Debugger first). */ appSecret?: string; shortToken: string; graphVersion?: string; pageId?: string; fetchImpl?: typeof fetch }
export interface ConnectResult { pageId: string; pageName: string; pageToken: string; igUserId: string | null; igUsername: string | null; scopes: string[]; missingScopes: string[]; neverExpires: boolean; pagesSeen: string[] }

export async function connectMeta(i: ConnectInput): Promise<ConnectResult> {
  const f = i.fetchImpl ?? fetch; const base = `https://graph.facebook.com/${i.graphVersion ?? "v21.0"}`;
  const get = async (path: string, params: Record<string, string>) => {
    const r = await f(`${base}${path}?${new URLSearchParams(params)}`); const j = (await r.json().catch(() => ({}))) as any;
    if (!r.ok || j.error) throw new Error(`Meta ${path} failed (${r.status}): ${String(j.error?.message ?? "").replace(/access_token=[^&\s]+/g, "access_token=***").slice(0, 200)}`); return j;
  };
  const longUser = i.appSecret ? ((await get("/oauth/access_token", { grant_type: "fb_exchange_token", client_id: i.appId, client_secret: i.appSecret, fb_exchange_token: i.shortToken })).access_token as string) : i.shortToken;
  if (!longUser) throw new Error("Meta did not return a long-lived token");
  const pages = (await get("/me/accounts", { access_token: longUser, fields: "id,name,access_token,instagram_business_account{id,username}", limit: "50" })).data as any[];
  if (!pages?.length) throw new Error("This Facebook login manages no Pages. Log in as the owner of the Kukur Page and grant it in the permission dialog.");
  const page = i.pageId ? pages.find((p) => p.id === i.pageId) : pages.length === 1 ? pages[0] : undefined;
  if (!page) throw new Error(`Could not pick the Page. Found: ${pages.map((p) => `${p.name} (${p.id})`).join(", ")}. Re-run with META_PAGE_ID set.`);
  const dbg = (await get("/debug_token", { input_token: page.access_token, access_token: i.appSecret ? `${i.appId}|${i.appSecret}` : longUser })).data;
  const scopes: string[] = dbg.scopes ?? [];
  return { pageId: page.id, pageName: page.name, pageToken: page.access_token, igUserId: page.instagram_business_account?.id ?? null, igUsername: page.instagram_business_account?.username ?? null, scopes,
    missingScopes: REQUIRED_SCOPES.filter((s) => !scopes.includes(s)), neverExpires: !dbg.expires_at || dbg.expires_at === 0, pagesSeen: pages.map((p) => p.name) };
}
