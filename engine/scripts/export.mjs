// Versi format lain dari Result/<nama>.mp4 untuk feed, YouTube, dan Reels/TikTok.
//
// Pemakaian: npm run export -- <nama> [--format=4x5,1x1,16x9,9x16] [--mode=auto|crop|fit]
// Video yang dibuat langsung dalam format lain (storyboard/edit.json "format", v0.8) memakai mode fit ke format tujuan
//   (bawaan --format: 9x16), mis. video YouTube 16:9 -> 9x16 1080x1920 utuh di tengah dengan latar blur.
//   Untuk potongan pendek bertumpu wajah dari video panjang: rencanakan sebagai proyek edit 9:16 terpisah.
//   4x5  1080x1350 -> Result/<nama>.4x5.mp4  (feed Instagram/Facebook/LinkedIn)
//   1x1  1080x1080 -> Result/<nama>.1x1.mp4
//   16x9 1920x1080 -> Result/<nama>.16x9.mp4 (YouTube): video 9:16 utuh di tengah, kiri-kanan versi blur
// Mode 4x5/1x1:
//   crop  potong bingkai dari 9:16; brand pojok ditempel ulang di atas potongan
//   fit   video 9:16 utuh dikecilkan ke tengah, sisi kiri-kanan diisi versi blur (tidak ada yang terpotong)
//   auto  (default) crop bila SEMUA teks dari cek tata letak (preview/layout.json, "band") muat di bawah pita brand
//         potongan; kalau tidak muat atau belum ada data, fit
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { ENGINE, FORMATS, P, ROOT, canvasOf, encodeFor, findLogo, parseScript, readJson, resolveName, run, x264Args } from "./lib.mjs";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const paths = P(name);
if (!existsSync(paths.result)) throw new Error(`Video belum ada: ${path.relative(ROOT, paths.result)}`);
const PY = path.join(ENGINE, ".venv", "bin", "python");
const board = readJson(paths.storyboard, {});
const meta = existsSync(paths.script) ? parseScript(readFileSync(paths.script, "utf8")).meta : {};
const brand = { ...(board.brand ?? {}) };
for (const k of ["logoLeft", "logoRight"]) if (brand[k]) brand[k] = findLogo(brand[k], meta.profile) ?? brand[k];
const hasBrand = !!(brand.left || brand.right || brand.logoLeft || brand.logoRight);
const png = path.join(paths.work, "brand.png");
if (hasBrand) execFileSync(PY, [path.join(ENGINE, "scripts", "brand_png.py"), JSON.stringify(brand), png]);
const enc = x264Args(encodeFor(name), { audio: "copy" });

const layout = readJson(path.join(paths.preview, "layout.json"), null);
const bands = (layout?.scenes ?? []).map((s) => s.band).filter(Boolean);
const textBand = bands.length ? [Math.min(...bands.map((b) => b[0])), Math.max(...bands.map((b) => b[1]))] : null;
// latar = video sama diperbesar menutupi bingkai lalu diblur; depan = video utuh muat di bingkai, di tengah
const fit = (W, H) =>
  `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.12[bg];[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[v]`;
const SRC = canvasOf(name);
if (SRC.format !== "9:16") {
  for (const f of (opt("format") ?? "9x16").split(",")) {
    const T = FORMATS[f.replace("x", ":")];
    if (!T) { console.warn(`! format "${f}" tidak dikenal (9x16, 4x5, 1x1, 16x9)`); continue; }
    if (T.format === SRC.format) { console.log(`${f}: dilewati (video sudah ${SRC.format})`); continue; }
    const out = paths.result.replace(/\.mp4$/, `.${f}.mp4`);
    run("ffmpeg", ["-v", "error", "-y", "-i", paths.result, "-filter_complex", fit(T.w, T.h), "-map", "[v]", "-map", "0:a", ...enc, out]);
    console.log(`${f}: ${path.relative(ROOT, out)} (${T.w}x${T.h}, video ${SRC.format} utuh di tengah, latar blur)`);
  }
  process.exit(0);
}

for (const f of (opt("format") ?? "4x5,16x9").split(",")) {
  const out = paths.result.replace(/\.mp4$/, `.${f}.mp4`);
  let how = "";
  if (f === "4x5" || f === "1x1") {
    const h = f === "4x5" ? 1350 : 1080;
    let mode = opt("mode") ?? "auto";
    let y = 0;
    if (mode !== "fit" && textBand) {
      // pita brand potongan = 130 px teratas; sisakan 30 px di bawah
      y = Math.max(0, Math.min(1920 - h, textBand[0] - 140));
      const fits = textBand[0] >= y + 130 && textBand[1] <= y + h - 30;
      if (mode === "auto") mode = fits ? "crop" : "fit";
      else if (!fits) console.warn(`! ${f}: teks y ${textBand[0]}-${textBand[1]} tidak muat di potongan, sebagian bisa terpotong`);
    } else if (mode === "auto") mode = "fit";
    if (mode === "crop" && !textBand) y = Math.round((1920 - h) / 2);
    if (mode === "crop") {
      const crop = `crop=1080:${h}:0:${y}`;
      if (hasBrand)
        run("ffmpeg", ["-v", "error", "-y", "-i", paths.result, "-i", png, "-filter_complex", `[0:v]${crop}[c];[1:v]crop=1080:${h}:0:0[b];[c][b]overlay=0:0[v]`, "-map", "[v]", "-map", "0:a", ...enc, out]);
      else run("ffmpeg", ["-v", "error", "-y", "-i", paths.result, "-vf", crop, "-map", "0:v", "-map", "0:a", ...enc, out]);
      how = `potong mulai y ${y}`;
    } else {
      run("ffmpeg", ["-v", "error", "-y", "-i", paths.result, "-filter_complex", fit(1080, h), "-map", "[v]", "-map", "0:a", ...enc, out]);
      how = textBand ? `dikecilkan utuh (teks y ${textBand[0]}-${textBand[1]} tidak muat untuk dipotong)` : "dikecilkan utuh (belum ada data cek tata letak)";
    }
  } else if (f === "16x9") {
    run("ffmpeg", ["-v", "error", "-y", "-i", paths.result, "-filter_complex", fit(1920, 1080), "-map", "[v]", "-map", "0:a", ...enc, out]);
    how = "video utuh di tengah, sisi blur";
  } else {
    if (f === "9x16") { console.log("9x16: dilewati (video sudah 9:16)"); continue; }
    console.warn(`! format "${f}" tidak dikenal (4x5, 1x1, 16x9)`);
    continue;
  }
  const s = JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", out])).streams[0];
  console.log(`${f}: ${path.relative(ROOT, out)} (${s.width}x${s.height}, ${how})`);
}
