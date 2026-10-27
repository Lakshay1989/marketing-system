// Renders one 1080x1920 Story PNG from a spec. Templates: grid (headline + product cards), hero (photo + headline), poll (background for an Instagram poll/question sticker).
// Usage: node production/render-story.mjs spec.json out.png
import { chromium } from "playwright-core";
import path from "node:path";
import fs from "node:fs";

const [specPath, out] = process.argv.slice(2);
const S = JSON.parse(fs.readFileSync(specPath, "utf8"));
const U = (p) => "file://" + path.resolve(p);
const COL = { cream: "#fbf5ea", forest: "#14463f", deep: "#0c2f2a", orange: "#e8551f", gold: "#e9a23b", terra: "#b5482a", sand: "#f2e6cf" };
const BG = { forest: COL.forest, cream: COL.cream, orange: COL.orange, deep: COL.deep, sand: COL.sand };
const bgKey = S.bg ?? "forest"; const dark = ["forest", "orange", "deep"].includes(bgKey);
const css = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,900&family=Inter:wght@500;700;800;900&family=Archivo+Black&display=swap');
*{box-sizing:border-box;margin:0;padding:0}body{width:1080px;height:1920px;position:relative;overflow:hidden;font-family:Inter,sans-serif;background:${BG[bgKey]}}
.abs{position:absolute}.disp{font-family:'Archivo Black',Inter,sans-serif;text-transform:uppercase;line-height:.98}
.pill{position:absolute;left:0;right:0;margin:0 auto;width:max-content;padding:20px 48px;border-radius:999px;font-weight:900;font-size:42px;white-space:nowrap}`;
const logo = `<div class="abs" style="left:0;right:0;margin:0 auto;width:max-content;top:250px;background:${COL.cream};border-radius:28px;padding:14px 34px"><img src="${U("production/brand/logo.webp")}" style="height:104px;display:block"></div>`;
const hl = (top, lines) => `<div class="abs disp" style="left:0;right:0;top:${top}px;text-align:center">${lines.map(([t, px, c]) => `<span style="display:block;white-space:nowrap;font-size:${px}px;color:${COL[c] ?? c}">${t}</span>`).join("")}</div>`;
const card = (p, x, y, w, rot) => { const label = p.short ?? p.name; const fs_ = Math.round(w * (label.length > 10 ? 0.06 : 0.075)); return `<div class="abs" style="left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg)"><div style="border-radius:${Math.round(w * 0.1)}px;overflow:hidden;background:${COL.cream};box-shadow:0 26px 60px rgba(0,0,0,.3)"><img src="${U(`production/products/${p.slug}.webp`)}" style="width:100%;display:block"></div><div style="position:absolute;left:6%;right:6%;bottom:-${Math.round(w * 0.07)}px;background:${COL.deep};color:${COL.cream};border-radius:999px;padding:${Math.round(w * 0.03)}px ${Math.round(w * 0.04)}px;display:flex;justify-content:space-between;align-items:center;gap:8px;font-weight:800;font-size:${fs_}px;box-shadow:0 10px 24px rgba(0,0,0,.3)"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span>${p.price ? `<span style="color:${COL.gold};font-weight:900;font-size:${Math.round(fs_ * 1.15)}px">${p.price}</span>` : ""}</div></div>`; };
let body = "";
const ink = dark ? "cream" : "forest";
if (S.template === "grid") {
  const ps = S.products.slice(0, 6); const cols = ps.length === 4 ? 2 : ps.length === 2 ? 2 : 3; const four = ps.length === 4; const w = cols === 3 ? 295 : four ? 350 : 400; const gx = cols === 3 ? [55, 395, 735] : four ? [120, 610] : [110, 570]; const y0 = four ? 740 : 800, step = four ? w + 75 : w + 85;
  body = logo + hl(S.headTop ?? 430, S.headline) + ps.map((p, i) => card(p, gx[i % cols], y0 + Math.floor(i / cols) * step, w, [-3, 2, -2, 3, -2, 2][i])).join("");
} else if (S.template === "hero") {
  body = `<div class="abs" style="left:0;right:0;top:0;height:1150px;overflow:hidden"><img src="${U("production/assets/" + S.photo)}" style="width:100%;height:100%;object-fit:cover;object-position:${S.focus ?? "50% 25%"}"></div><div class="abs" style="left:0;right:0;top:600px;height:560px;background:linear-gradient(180deg,rgba(12,47,42,0),${COL.deep})"></div>` + logo + hl(S.headTop ?? 850, S.headline) + (S.products ?? []).slice(0, 3).map((p, i) => card(p, [60, 390, 720][i], 1280, 300, [-4, 3, -3][i])).join("");
} else if (S.template === "poll") {
  body = logo + hl(S.headTop ?? 470, S.headline) + (S.products ?? []).slice(0, 2).map((p, i) => card(p, [110, 590][i], 900, 380, [-4, 4][i])).join("") + (S.photos ?? []).slice(0, 2).map((ph, i) => `<div class="abs" style="left:${[40, 550][i]}px;width:490px;top:900px;height:490px;border-radius:50%;overflow:hidden;border:12px solid ${i ? COL.orange : COL.forest}"><img src="${U("production/assets/" + ph)}" style="width:100%;height:100%;object-fit:cover"></div>`).join("") + `<div class="abs" style="left:0;right:0;top:1480px;text-align:center;font-weight:800;font-size:44px;color:${COL[ink]}">${S.prompt ?? "Vote with the poll sticker 👇"}</div>`;
}
if (S.pill) body += `<div class="pill" style="bottom:200px;background:${S.pillBg === "forest" ? COL.forest : COL.orange};color:${COL.cream}">${S.pill}</div>`;
fs.writeFileSync("/tmp/_story.html", `<!doctype html><meta charset=utf-8><style>${css}</style>${body}`);
const b = await chromium.launch({ channel: "chrome" }); const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await pg.goto("file:///tmp/_story.html", { waitUntil: "networkidle" }); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(300);
fs.mkdirSync(path.dirname(out), { recursive: true }); await pg.screenshot({ path: out }); await b.close();
console.log(JSON.stringify({ width: 1080, height: 1920, bytes: fs.statSync(out).size }));
