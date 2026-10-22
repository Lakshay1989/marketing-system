// Interactive, run by the owner in a terminal:  npm run meta:connect
// Prompts (hidden) for the Meta app secret and the short-lived token, connects the Page + Instagram account, saves the Page token to .env
// and records both accounts in the database. Secrets are never printed.
import fs from "node:fs";
import { eq, and } from "drizzle-orm";
import { openDb, schema } from "../src/db";
import { connectMeta } from "../src/lib/publish/connect";
import { metaClient } from "../src/lib/publish/meta";

function hidden(q: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(q); const stdin = process.stdin; stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding("utf8"); let s = "";
    const on = (ch: string) => { for (const c of ch) { if (c === "\r" || c === "\n") { stdin.setRawMode?.(false); stdin.pause(); stdin.off("data", on); process.stdout.write("\n"); return resolve(s.trim()); } if (c === "\u0003") process.exit(1); if (c === "\u007f") s = s.slice(0, -1); else s += c; } };
    stdin.on("data", on);
  });
}
const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const appId = env.META_APP_ID || process.env.META_APP_ID; if (!appId) throw new Error("META_APP_ID is missing in .env");
const appSecret = (await hidden("App secret (hidden). Just press Enter to skip if you used the Access Token Debugger: ")) || undefined;
const shortToken = await hidden("Paste the ACCESS TOKEN (the extended one from the Debugger, or the Explorer token if you gave the secret) (hidden, then Enter): ");
const r = await connectMeta({ appId, appSecret, shortToken, pageId: env.META_PAGE_ID || undefined });
console.log(r.neverExpires ? "" : "WARNING: this Page token EXPIRES (see below). It was made from a short-lived login. Extend the user token in the Access Token Debugger and run this again for a permanent one.");
console.log(`Page: ${r.pageName} (${r.pageId}) | Instagram: ${r.igUsername ? "@" + r.igUsername : "NOT LINKED"} | token never expires: ${r.neverExpires}`);
if (r.missingScopes.length) console.log("MISSING PERMISSIONS (re-generate the token with these ticked):", r.missingScopes.join(", "));
if (!r.igUserId) throw new Error("No Instagram business account is linked to this Page, or instagram_basic was not granted.");
const set = (k: string, v: string) => { const lines = fs.readFileSync(".env", "utf8").split("\n").filter((l) => l.trim() && !l.startsWith(k + "=")); lines.push(`${k}=${v}`); fs.writeFileSync(".env", lines.join("\n") + "\n"); };
set("META_PAGE_ID", r.pageId); set("META_IG_USER_ID", r.igUserId); set("META_PAGE_ACCESS_TOKEN", r.pageToken); set("META_GRAPH_VERSION", "v21.0");
const check = await metaClient({ graphVersion: "v21.0", pageId: r.pageId, igUserId: r.igUserId, pageToken: r.pageToken }).checkAccounts();
const db = await openDb(); const now = new Date();
const up = async (platform: string, handle: string, externalId: string, ok: boolean, note: string) => {
  const [ex] = await db.select().from(schema.socialAccounts).where(and(eq(schema.socialAccounts.platform, platform), eq(schema.socialAccounts.handle, handle)));
  const row = { externalId, status: ok ? "connected" : "blocked", permissions: r.scopes, lastCheckedAt: now, note, capabilities: { reels: ok, stories: ok && platform === "instagram", insights: r.scopes.includes("instagram_manage_insights") || r.scopes.includes("read_insights") } };
  if (ex) await db.update(schema.socialAccounts).set(row).where(eq(schema.socialAccounts.id, ex.id)); else await db.insert(schema.socialAccounts).values({ platform, handle, ...row });
};
await up("facebook", r.pageName, r.pageId, check.facebook.ok && r.missingScopes.every((s) => !s.startsWith("pages_")), check.facebook.ok ? "Page reachable" : (check.facebook as { error: string }).error);
await up("instagram", r.igUsername ?? "instagram", r.igUserId, check.instagram.ok && r.scopes.includes("instagram_content_publish"), check.instagram.ok ? `account type: ${(check.instagram as { accountType: string }).accountType}` : (check.instagram as { error: string }).error);
console.log("Account check:", { instagram: check.instagram.ok ? "reachable" : "FAILED", facebook: check.facebook.ok ? "reachable" : "FAILED" });
console.log("Saved to .env and the database. Restart the worker: pkill -f worker/index.ts; npm run worker");
process.exit(0);
