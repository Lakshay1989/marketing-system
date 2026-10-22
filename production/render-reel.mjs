// Renders one reel from a spec: frames (Chrome) + original soundtrack (python/numpy) + encode (ffmpeg) + cover.
// Usage: node production/render-reel.mjs spec.json outDir      -> outDir/reel.mp4, outDir/cover.png, outDir/meta.json
import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const [specPath, outDir] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });
const frames = path.join(outDir, "frames"); fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames);
const FPS = 30;
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: "utf8" }); if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || r.stdout).slice(0, 400)}`); return r.stdout; };

const b = await chromium.launch({ channel: "chrome" });
const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
const problems = []; pg.on("pageerror", (e) => problems.push(e.message));
await pg.addInitScript((s) => { window.SPEC = s; }, spec);
await pg.goto("file://" + path.resolve("production/engine/player.html") + "?t=" + (spec.template || "showcase"), { waitUntil: "networkidle" });
await pg.waitForFunction("window.__ready===true", null, { timeout: 20000 });
await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(900);
const info = await pg.evaluate(() => ({ dur: window.REEL.dur, sections: window.REEL.sections, coverAt: window.REEL.coverAt }));
const total = Math.round(info.dur * FPS);
for (let f = 0; f < total; f++) { await pg.evaluate(([t, i]) => window.renderFrame(t, i), [f / FPS, f]); await pg.screenshot({ path: `${frames}/f${String(f).padStart(4, "0")}.jpg`, type: "jpeg", quality: 93 }); }
await b.close();
if (problems.length) throw new Error("page errors: " + problems.slice(0, 3).join(" | "));

const scoreSpec = path.join(outDir, "score.json"), wav = path.join(outDir, "score.wav"), norm = path.join(outDir, "score-norm.wav");
fs.writeFileSync(scoreSpec, JSON.stringify({ dur: info.dur, bpm: spec.bpm, key: spec.key ?? "C", sections: info.sections, seed: spec.seed ?? 7 }));
run("python3", ["production/score.py", "--spec", scoreSpec, wav]);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-15:TP=-3:LRA=9,alimiter=limit=0.71:level=false:attack=2:release=40", "-ar", "44100", "-c:a", "pcm_s24le", norm]);
const master = path.join(outDir, "master.mp4"), up = path.join(outDir, "reel.mp4");
run("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${frames}/f%04d.jpg`, "-i", norm, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
  "-vf", "scale=in_range=full:out_range=limited,unsharp=3:3:0.35:3:3:0.0,format=yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", master]);
const kb = Math.max(1500, Math.floor((9.2e6 * 8) / info.dur / 1000 - 140));
run("ffmpeg", ["-y", "-loglevel", "error", "-i", master, "-c:v", "libx264", "-preset", "slow", "-b:v", `${kb}k`, "-maxrate", `${kb + 400}k`, "-bufsize", `${kb * 2}k`, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", up]);
// Safety: AAC encoding can push true peaks over 0 dBTP. Measure, and if above -1.0 dBTP lower the audio only (video is stream-copied).
const truePeak = (f) => { const r = spawnSync("ffmpeg", ["-nostats", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }); const m = [...r.stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop(); return m ? Number(m[1]) : NaN; };
let peak = truePeak(up), lowered = 0;
for (let i = 0; i < 3 && peak > -1.0; i++) {
  const cut = Math.ceil(peak + 1.8); lowered += cut; const tmp = up + ".tmp.mp4";
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", master, "-i", up, "-map", "1:v", "-map", "0:a", "-c:v", "copy", "-af", `volume=-${lowered}dB`, "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tmp]);
  fs.renameSync(tmp, up); peak = truePeak(up);
}
const cf = Math.round((info.coverAt ?? 1) * FPS);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", `${frames}/f${String(cf).padStart(4, "0")}.jpg`, path.join(outDir, "cover.png")]);
fs.rmSync(frames, { recursive: true, force: true }); for (const f of [wav, norm, master, scoreSpec]) fs.rmSync(f, { force: true });
const meta = { durationSec: info.dur, width: 1080, height: 1920, bytes: fs.statSync(up).size, truePeakDb: peak, audioLoweredDb: lowered };
fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta)); console.log(JSON.stringify(meta));
