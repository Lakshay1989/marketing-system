// Turns a finished story image into an 8 s vertical video with an original generated soundtrack (no licensed music).
// Usage: node production/story-video.mjs story.png spec.json out.mp4
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

const [png, specPath, out] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const dir = path.dirname(out), DUR = 8, FPS = 30;
const run = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: "utf8" }); if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || "").slice(-300)}`); return r; };
const h = parseInt(createHash("sha1").update(JSON.stringify(spec)).digest("hex").slice(0, 6), 16);
const keys = ["C", "D", "G", "F", "A"], bpms = [96, 100, 104, 108];
const scoreJson = path.join(dir, "story-score.json"), wav = path.join(dir, "story-score.wav"), norm = path.join(dir, "story-score-norm.wav");
fs.writeFileSync(scoreJson, JSON.stringify({ dur: DUR, bpm: bpms[h % bpms.length], key: keys[(h >> 3) % keys.length], sections: [[0, 3, "bell"], [3, DUR, "half"]], seed: (h % 50) + 3 }));
run("python3", ["production/score.py", "--spec", scoreJson, wav]);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", "loudnorm=I=-15:TP=-3:LRA=9,alimiter=limit=0.71:level=false:attack=2:release=40", "-ar", "44100", "-c:a", "pcm_s24le", norm]);
const zoom = "zoompan=z='1+0.06*on/" + DUR * FPS + "':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=" + DUR * FPS + ":s=1080x1920:fps=" + FPS;
const encode = (db) => run("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", png, "-i", norm, "-t", String(DUR), "-vf", `scale=2160:3840,${zoom},format=yuv420p`, "-af", `volume=-${db}dB,afade=t=out:st=${DUR - 0.7}:d=0.7`, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", String(FPS), "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out]);
const peakOf = (f) => { const r = spawnSync("ffmpeg", ["-nostats", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }); const m = [...r.stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop(); return m ? Number(m[1]) : NaN; };
let lowered = 0; encode(lowered);
for (let i = 0; i < 4 && !(peakOf(out) <= -1.5); i++) { lowered += 1.5; encode(lowered); }
for (const f of [scoreJson, wav, norm]) fs.rmSync(f, { force: true });
console.log(JSON.stringify({ durationSec: DUR, peak: peakOf(out) }));
