import { describe, expect, it } from "vitest";
import { metaClient, MetaError } from "@/lib/publish/meta";

const cfg = { graphVersion: "v21.0", pageId: "P1", igUserId: "IG1", pageToken: "TOK", sleep: async () => {}, pollMs: 0 };
const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function fakeFetch(routes: Record<string, unknown[] | unknown>) {
  const calls: string[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url); calls.push(`${init?.method ?? "GET"} ${u.replace(/\?.*/, "")}`);
    const path = u.replace(/\?.*/, "");
    const key = Object.keys(routes).filter((k) => path.endsWith(k.split(" ")[1]) && (init?.method ?? "GET") === k.split(" ")[0]).sort((a, b) => b.length - a.length)[0];
    if (!key) return res({ error: { message: "no route " + u } }, 500);
    const r = routes[key]; const v = Array.isArray(r) ? (r.length > 1 ? r.shift() : r[0]) : r;
    return v instanceof Response ? v : res(v);
  }) as typeof fetch;
  return { f, calls };
}

describe("Meta client", () => {
  it("publishes an Instagram reel: create, poll until FINISHED, publish, then verifies the permalink", async () => {
    const { f, calls } = fakeFetch({ "POST /IG1/media": { id: "C1" }, "GET /C1": [{ status_code: "IN_PROGRESS" }, { status_code: "FINISHED" }], "POST /IG1/media_publish": { id: "M1" }, "GET /M1": { permalink: "https://www.instagram.com/reel/XYZ/" } });
    const v = await metaClient({ ...cfg, fetchImpl: f }).publishInstagramReel({ videoUrl: "https://cdn/x.mp4", caption: "c" });
    expect(v).toMatchObject({ externalId: "M1", url: "https://www.instagram.com/reel/XYZ/", verified: true });
    expect(calls.filter((c) => c.includes("/C1")).length).toBe(2);
  });
  it("does NOT report success when the platform returns no permalink", async () => {
    const { f } = fakeFetch({ "POST /IG1/media": { id: "C1" }, "GET /C1": { status_code: "FINISHED" }, "POST /IG1/media_publish": { id: "M1" }, "GET /M1": {} });
    await expect(metaClient({ ...cfg, fetchImpl: f }).publishInstagramReel({ videoUrl: "u", caption: "c" })).rejects.toThrow(/not verified/);
  });
  it("fails permanently when the container errors, and flags rate limits as transient", async () => {
    const a = fakeFetch({ "POST /IG1/media": { id: "C1" }, "GET /C1": { status_code: "ERROR", status: "bad codec" } });
    await expect(metaClient({ ...cfg, fetchImpl: a.f }).publishInstagramReel({ videoUrl: "u", caption: "c" })).rejects.toMatchObject({ transient: false });
    const b = fakeFetch({ "POST /IG1/media": new Response(JSON.stringify({ error: { message: "slow down", code: 4 } }), { status: 400 }) });
    await expect(metaClient({ ...cfg, fetchImpl: b.f }).publishInstagramReel({ videoUrl: "u", caption: "c" })).rejects.toMatchObject({ transient: true });
  });
  it("redacts the access token from error messages", async () => {
    const f = (async () => new Response(JSON.stringify({ error: { message: "bad access_token=TOK123" } }), { status: 400 })) as typeof fetch;
    try { await metaClient({ ...cfg, fetchImpl: f }).checkAccounts(); } catch { /* checkAccounts catches */ }
    const r = await metaClient({ ...cfg, fetchImpl: f }).checkAccounts();
    expect(JSON.stringify(r)).not.toContain("TOK123");
    expect(r.instagram.ok).toBe(false);
  });
  it("publishes a Facebook reel and verifies by lookup", async () => {
    const { f } = fakeFetch({ "POST /P1/video_reels": [{ video_id: "V1", upload_url: "https://rupload.facebook.com/video-upload/v21.0/V1" }, { success: true }], "POST /video-upload/v21.0/V1": { success: true }, "GET /V1": { permalink_url: "/reel/V1/", status: {} } });
    const v = await metaClient({ ...cfg, fetchImpl: f }).publishFacebookReel({ videoUrl: "https://cdn/x.mp4", description: "d" });
    expect(v.url).toBe("https://www.facebook.com/reel/V1/");
  });
  it("is a typed error class", () => { expect(new MetaError("x", true)).toBeInstanceOf(Error); });
});
