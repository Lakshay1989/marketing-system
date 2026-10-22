import { describe, expect, it } from "vitest";
import { connectMeta } from "@/lib/publish/connect";

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s });
const fake = (pages: unknown[], scopes: string[], expires = 0) => (async (u: string | URL) => { const url = String(u);
  if (url.includes("/oauth/access_token")) return res({ access_token: "LONG" });
  if (url.includes("/me/accounts")) return res({ data: pages });
  if (url.includes("/debug_token")) return res({ data: { scopes, expires_at: expires } }); return res({ error: { message: "nope" } }, 400); }) as typeof fetch;
const page = { id: "61595609549007", name: "Kukur Pet Store India", access_token: "PAGETOK", instagram_business_account: { id: "1789", username: "kukur.petstoreindia" } };
const all = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "instagram_manage_insights"];

describe("connectMeta", () => {
  it("returns the Page token, Instagram account and full scope list", async () => {
    const r = await connectMeta({ appId: "A", appSecret: "S", shortToken: "T", pageId: "61595609549007", fetchImpl: fake([page], all) });
    expect(r).toMatchObject({ pageId: "61595609549007", pageToken: "PAGETOK", igUserId: "1789", igUsername: "kukur.petstoreindia", neverExpires: true, missingScopes: [] });
  });
  it("reports missing permissions and expiring tokens", async () => {
    const r = await connectMeta({ appId: "A", appSecret: "S", shortToken: "T", fetchImpl: fake([page], ["pages_show_list"], 1790000000) });
    expect(r.missingScopes).toContain("instagram_content_publish"); expect(r.neverExpires).toBe(false);
  });
  it("explains when no Page is managed or the Page cannot be chosen", async () => {
    await expect(connectMeta({ appId: "A", appSecret: "S", shortToken: "T", fetchImpl: fake([], all) })).rejects.toThrow(/manages no Pages/);
    await expect(connectMeta({ appId: "A", appSecret: "S", shortToken: "T", fetchImpl: fake([page, { ...page, id: "2", name: "Other" }], all) })).rejects.toThrow(/Could not pick the Page/);
  });
  it("never leaks the secret or tokens in errors", async () => {
    const f = (async () => res({ error: { message: "bad access_token=SECRETTOKEN123" } }, 400)) as typeof fetch;
    await expect(connectMeta({ appId: "A", appSecret: "SUPERSECRET", shortToken: "T", fetchImpl: f })).rejects.toThrow(/access_token=\*\*\*/);
    try { await connectMeta({ appId: "A", appSecret: "SUPERSECRET", shortToken: "T", fetchImpl: f }); } catch (e) { expect(String((e as Error).message)).not.toContain("SUPERSECRET"); expect(String((e as Error).message)).not.toContain("SECRETTOKEN123"); }
  });
});
