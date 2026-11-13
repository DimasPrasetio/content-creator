// Kompres ulang video hasil yang sudah jadi (mis. render sebelum v0.2.1 yang memakai CRF 18 tanpa batas bitrate).
//
//   npm run compress -- <nama>                  capped CRF (setelan encode proyek: config/profil/storyboard "encode")
//   npm run compress -- <nama> --target=50MB    ukuran target (two-pass, bitrate dihitung dari durasi)
//   npm run compress -- <nama> --crf=26 --maxrate=6M   timpa setelan untuk sekali jalan
//   npm run compress -- <nama> --all            ikut kompres .4x5 / .16x9 / .1x1 / .sub.mp4 di folder hasil
//   npm run compress -- --file=<video.mp4> [--target=..]   file mana pun -> <video>.compressed.mp4 (asli tidak diubah)
//
// Video utama: versi lama disimpan ke Projects/<nama>/versions/vN.mp4 (archiveResult), lalu diganti hasil kompres.
// Bila hasil tidak lebih kecil, file asli dipertahankan.
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { ENCODE_DEFAULT, P, ROOT, archiveResult, bps, config, encodeFor, resolveName, run, x264Args } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const file = opt("file");
const name = file ? null : resolveName(args.find((a) => !a.startsWith("--")));
const MB = (f) => statSync(f).size / 1048576;
const probe = (f) => {
  const j = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration,bit_rate", "-of", "json", f]));
  return { dur: parseFloat(j.format.duration), rate: parseFloat(j.format.bit_rate) };
};

const base = name ? encodeFor(name) : { ...ENCODE_DEFAULT, ...(config().encode ?? {}) };
const e = { ...base, ...(opt("crf") ? { crf: opt("crf") } : {}), ...(opt("maxrate") ? { maxrate: opt("maxrate"), bufsize: null } : {}), ...(opt("preset") ? { preset: opt("preset") } : {}) };
if (e.maxrate && !e.bufsize) e.bufsize = `${bps(e.maxrate) * 2}`;
const target = opt("target") ? parseFloat(opt("target")) : null; // MB
if (opt("target") && !(target > 0)) throw new Error("--target harus angka MB, mis. --target=50MB");

/** Kompres src -> out. Capped CRF, atau two-pass ke ukuran target. */
const squeeze = (src, out, work) => {
  const { dur } = probe(src);
  if (!target) {
    run("ffmpeg", ["-v", "error", "-y", "-i", src, "-map", "0:v:0", "-map", "0:a?", ...x264Args(e), out]);
    return `CRF ${e.crf}, maks ${e.maxrate ?? "-"}`;
  }
  const audio = bps(e.audioBitrate);
  const video = Math.floor((target * 8388608) / dur - audio);
  if (video < 500e3) throw new Error(`Target ${target} MB terlalu kecil untuk ${dur.toFixed(0)} dtk (video < 500 kbps)`);
  const log = path.join(work, "x264-2pass");
  const common = ["-c:v", "libx264", "-preset", String(e.preset), "-b:v", String(video), "-maxrate", String(Math.round(video * 1.5)), "-bufsize", String(video * 2), "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", "30", "-passlogfile", log];
  run("ffmpeg", ["-v", "error", "-y", "-i", src, "-map", "0:v:0", ...common, "-pass", "1", "-an", "-f", "null", "-"]);
  run("ffmpeg", ["-v", "error", "-y", "-i", src, "-map", "0:v:0", "-map", "0:a?", ...common, "-pass", "2", "-c:a", "aac", "-b:a", String(e.audioBitrate), "-movflags", "+faststart", out]);
  for (const f of readdirSync(work)) if (f.startsWith("x264-2pass")) rmSync(path.join(work, f), { force: true });
  return `target ${target} MB (two-pass, video ${(video / 1e6).toFixed(2)} Mbps)`;
};

const report = (label, before, after, how) =>
  console.log(`${label}: ${before.toFixed(1)} MB -> ${after.toFixed(1)} MB (${Math.round((1 - after / before) * 100)}% lebih kecil; ${how})`);

if (file) {
  if (!existsSync(file)) throw new Error(`File tidak ada: ${file}`);
  const out = file.replace(/\.mp4$/i, "") + ".compressed.mp4";
  const how = squeeze(file, out, path.dirname(path.resolve(file)));
  report(path.basename(file), MB(file), MB(out), how);
} else {
  const p = P(name);
  if (!existsSync(p.result)) throw new Error(`Video belum ada: ${path.relative(ROOT, p.result)}`);
  mkdirSync(p.work, { recursive: true });
  const variants = args.includes("--all")
    ? readdirSync(p.resultDir).filter((f) => f.startsWith(`${name}.`) && f.endsWith(".mp4") && f !== `${name}.mp4`).map((f) => path.join(p.resultDir, f))
    : [];
  for (const src of [p.result, ...variants]) {
    const tmp = path.join(p.work, `compress-${path.basename(src)}`);
    const before = MB(src);
    const { rate } = probe(src);
    const how = squeeze(src, tmp, p.work);
    const after = MB(tmp);
    if (after >= before * 0.97) {
      rmSync(tmp, { force: true });
      console.log(`${path.basename(src)}: sudah ringkas (${before.toFixed(1)} MB, ${(rate / 1e6).toFixed(1)} Mbps), tidak diubah`);
      continue;
    }
    if (src === p.result) archiveResult(name);
    renameSync(tmp, src);
    report(path.relative(ROOT, src), before, after, how);
  }
}
