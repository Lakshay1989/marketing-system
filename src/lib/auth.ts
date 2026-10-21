import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "kmai_session";
function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ chars) is required in production");
  return "dev-only-secret-not-for-production-0123456789";
}
export const sessionCookieName = COOKIE;
export function signSession(maxAgeSec = 12 * 3600, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ exp: now + maxAgeSec * 1000 })).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
export function verifySession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const want = createHmac("sha256", secret()).update(body).digest(); const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  try { return (JSON.parse(Buffer.from(body, "base64url").toString()) as { exp: number }).exp > now; } catch { return false; }
}
export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 12) return false; // login stays closed until a 12+ char password is configured
  const a = Buffer.from(input), b = Buffer.from(pw);
  return a.length === b.length && timingSafeEqual(a, b);
}
