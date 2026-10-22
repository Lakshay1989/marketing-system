import { spawn } from "node:child_process";
import fs from "node:fs";
import type { MediaFacts } from "./rules";

function run(cmd: string, args: string[]): Promise<{ out: string; err: string; code: number | null }> {
  return new Promise((resolve, reject) => { const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }); let out = "", err = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d)); p.on("error", reject); p.on("close", (code) => resolve({ out, err, code })); });
}
const frac = (s: string | undefined) => { if (!s) return null; const [a, b] = s.split("/").map(Number); return b ? a / b : a; };

/** Measures a real media file with ffprobe/ffmpeg: size, codec, duration, fps, audio loudness and true peak, black and frozen frames, first-frame contrast. */
export async function inspectFile(file: string, kind: "video" | "image"): Promise<MediaFacts> {
  const probe = JSON.parse((await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file])).out || "{}");
  const v = (probe.streams ?? []).find((s: any) => s.codec_type === "video"); const a = (probe.streams ?? []).find((s: any) => s.codec_type === "audio");
  if (!v) throw new Error("No video/image stream found in file");
  const facts: MediaFacts = { width: v.width, height: v.height, durationSec: kind === "video" ? Number(probe.format?.duration ?? v.duration ?? 0) : null, fps: kind === "video" ? frac(v.avg_frame_rate) : null, videoCodec: v.codec_name ?? null, hasAudio: Boolean(a), loudnessLufs: null, truePeakDb: null, blackSeconds: 0, frozenSeconds: 0, bytes: fs.statSync(file).size, firstFrameStdDev: null };
  if (kind === "video" && a) {
    const e = (await run("ffmpeg", ["-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"])).err;
    const i = [...e.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop(); const p = [...e.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].pop();
    facts.loudnessLufs = i ? Number(i[1]) : null; facts.truePeakDb = p ? Number(p[1]) : null;
  }
  if (kind === "video") {
    const b = (await run("ffmpeg", ["-nostats", "-i", file, "-vf", "blackdetect=d=0.05:pix_th=0.06", "-an", "-f", "null", "-"])).err;
    facts.blackSeconds = [...b.matchAll(/black_duration:([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
    const f = (await run("ffmpeg", ["-nostats", "-i", file, "-vf", "freezedetect=n=-60dB:d=0.5", "-an", "-f", "null", "-"])).err;
    facts.frozenSeconds = [...f.matchAll(/freeze_duration:\s*([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  }
  // first-frame contrast (0-100): spread between the darkest and brightest luma; a blank or flat hook frame scores near 0
  const st = await run("ffmpeg", ["-nostats", "-i", file, "-frames:v", "1", "-vf", "scale=96:-1,format=gray,signalstats,metadata=print:file=-", "-f", "null", "-"]);
  const txt = st.out + st.err; const lo = /lavfi\.signalstats\.YLOW=(\d+)/.exec(txt), hi = /lavfi\.signalstats\.YHIGH=(\d+)/.exec(txt);
  facts.firstFrameStdDev = lo && hi ? ((Number(hi[1]) - Number(lo[1])) / 255) * 100 : null;
  return facts;
}
