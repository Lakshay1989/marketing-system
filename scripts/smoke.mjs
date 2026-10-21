// Browser smoke test: logs in with the password from the local environment and visits every page.
import { chromium } from "playwright-core";
const base = process.env.BASE_URL ?? "http://localhost:3402";
const b = await chromium.launch({ channel: "chrome" });
const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; pg.on("pageerror", (e) => errors.push(e.message)); pg.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await pg.goto(base + "/login"); await pg.fill("#pw", process.env.ADMIN_PASSWORD); await pg.click("button");
await pg.waitForURL(base + "/", { timeout: 15000 });
const out = [];
for (const p of ["/", "/agents", "/studio", "/calendar", "/trends", "/analytics", "/history", "/settings"]) {
  const r = await pg.goto(base + p); const h1 = await pg.textContent("h1"); out.push(`${r.status()} ${p} -> ${h1}`);
  if (process.env.SHOTS) await pg.screenshot({ path: `/tmp/kmai${p === "/" ? "-home" : p.replace("/", "-")}.png` });
}
console.log(out.join("\n")); console.log("console errors:", errors.length ? errors : "none");
await b.close();
