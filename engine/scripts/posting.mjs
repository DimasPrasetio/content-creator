// Paket siap posting untuk satu video.
//
// Pemakaian: npm run posting -- <nama> [--burn] [--y=1300] [--cover=<detik>]
// Hasil jadi (yang diunggah) -> Result/<brand>/<nama>/:
//   <nama>.mp4 (dari render) · thumbnail.jpg (1080x1920; 16:9 = sampul YouTube 1280x720) · caption.txt (caption + hashtag;
//   16:9 = deskripsi YouTube, ditambah daftar bab bertimestamp bila naskah punya "> bab:" yang memenuhi syarat YouTube)
//   [+ <nama>.sub.mp4 bila --burn, <nama>.4x5.mp4 / .16x9.mp4 dari `npm run export`]
// Bahan kerja -> Projects/<nama>/posting/:
//   caption.md (ditulis agent; divalidasi: baris pembuka ≤ 125 huruf, total ≤ 2200, hashtag 3-10, maks 30)
//   subtitle.srt + .vtt (dari waktu per kata), cover-grid.jpg (potongan 4:5 seperti grid profil Instagram)
// Thumbnail = sampul khusus dari posting/thumbnail.json (npm run thumbnail: varian berpemicu psikologis, tema brand) bila ada;
//   selain itu (atau --cover=<detik>) frame video: storyboard "cover": {"at": detik} | akhir scene 1.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, ROOT, canvasOf, chaptersOf, encodeFor, readJson, resolveName, run, ts as hms, x264Args, youtubeChapters } from "./lib.mjs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const paths = P(name);
const PY = path.join(ENGINE, ".venv", "bin", "python");
const timing = readJson(paths.timing);
if (!timing) throw new Error(`Timing belum ada: jalankan npm run voice -- ${name}`);
if (!existsSync(paths.result)) throw new Error(`Video belum ada: ${path.relative(ROOT, paths.result)}`);
const board = readJson(paths.storyboard, {});
const out = path.join(paths.dir, "posting");
mkdirSync(out, { recursive: true });
const fps = timing.fps;
const CV = canvasOf(name), YT = CV.format === "16:9";
let problems = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const bad = (m) => {
  problems++;
  console.log(`  GAGAL ${m}`);
};

// --- subtitle dari waktu per kata ---
const words = timing.scenes.flatMap((s) => (s.words ?? []).map((w) => ({ w: w.w, s: (s.startFrame + w.f) / fps, e: (s.startFrame + Math.max(w.e, w.f + 4)) / fps })));
const cues = [];
let cur = [];
const flush = () => {
  if (!cur.length) return;
  cues.push({ s: cur[0].s, e: cur.at(-1).e, t: cur.map((x) => x.w).join(" ") });
  cur = [];
};
for (const w of words) {
  const len = cur.map((x) => x.w).join(" ").length + w.w.length + 1;
  if (cur.length && (cur.length >= (YT ? 7 : 5) || len > (YT ? 42 : 32) || w.s - cur.at(-1).e > 0.6)) flush();
  cur.push(w);
  if (/[.!?…]$/.test(w.w)) flush();
}
flush();
// tiap potongan minimal 0,6 dtk, tidak menimpa potongan berikutnya
cues.forEach((c, i) => {
  const next = cues[i + 1]?.s ?? timing.totalFrames / fps;
  c.e = Math.min(Math.max(c.e + 0.15, c.s + 0.6), next - 0.02);
});
const ts = (x, sep) => {
  const ms = Math.round(x * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s}${sep}${String(ms % 1000).padStart(3, "0")}`;
};
writeFileSync(path.join(out, "subtitle.srt"), cues.map((c, i) => `${i + 1}\n${ts(c.s, ",")} --> ${ts(c.e, ",")}\n${c.t}\n`).join("\n"));
writeFileSync(path.join(out, "subtitle.vtt"), "WEBVTT\n\n" + cues.map((c) => `${ts(c.s, ".")} --> ${ts(c.e, ".")}\n${c.t}\n`).join("\n"));
const guessed = timing.scenes.flatMap((s) => s.words ?? []).filter((w) => w.guessed).length;
ok(`subtitle: ${cues.length} potongan dari ${words.length} kata${guessed ? ` (${guessed} kata waktunya ditebak)` : ""} -> posting/subtitle.srt, .vtt`);

// --- cover ---
const thumbSpec = path.join(out, "thumbnail.json");
if (existsSync(thumbSpec) && !opt("cover")) {
  // sampul khusus (bukan frame video): varian dari thumbnail.json, dicek panjang teks, kejujuran klaim, keterbacaan grid
  try {
    execFileSync(process.execPath, [path.join(ENGINE, "scripts", "thumbnail.mjs"), name], { stdio: "inherit" });
    ok(`thumbnail khusus -> ${path.relative(ROOT, paths.thumbnail)} (varian di posting/thumb-N.jpg)`);
  } catch {
    bad("thumbnail khusus belum lolos cek (lihat pesan di atas); perbaiki posting/thumbnail.json");
  }
} else {
  const s1 = timing.scenes[0];
  const coverAt = parseFloat(opt("cover") ?? board.cover?.at ?? ((s1.startFrame + s1.durationFrames) / fps - 0.5));
  const cover = paths.thumbnail;
  run("ffmpeg", ["-v", "error", "-y", "-ss", coverAt.toFixed(2), "-i", paths.result, "-frames:v", "1", ...(YT ? ["-vf", "scale=1280:720"] : []), "-q:v", "2", cover]);
  if (CV.format === "9:16") run("ffmpeg", ["-v", "error", "-y", "-i", cover, "-vf", "crop=1080:1350:0:285", "-q:v", "2", path.join(out, "cover-grid.jpg")]);
  ok(`thumbnail: detik ${coverAt.toFixed(2)} -> ${path.relative(ROOT, cover)}${YT ? " (1280x720 YouTube)" : CV.format === "9:16" ? " (+ posting/cover-grid.jpg untuk cek grid 4:5)" : ""}`);
  if (!opt("cover")) console.log("  -     sampul = frame video; untuk sampul khusus tulis posting/thumbnail.json (npm run thumbnail)");
}

// --- caption ---
const capPath = path.join(out, "caption.md");
if (!existsSync(capPath)) {
  writeFileSync(
    capPath,
    `<!-- Tulis caption di bawah. Baris pertama = hook (≤ 125 huruf, terlihat sebelum "selengkapnya"). -->\n${timing.scenes[0]?.text ?? ""}\n\nTODO: isi caption (manfaat, konteks singkat) dan CTA.\n\n#TODO\n`,
  );
  bad("caption.md baru dibuat sebagai templat: isi lalu jalankan posting lagi");
} else {
  let cap = readFileSync(capPath, "utf8").replace(/<!--[\s\S]*?-->/g, "").trim();
  // bab -> timestamp (YouTube: >= 3 bab, mulai 0:00, tiap bab >= 10 dtk); disisipkan sebelum baris hashtag
  const { chapters, total } = chaptersOf(name);
  if (chapters.length && !/^\s*\d{1,2}:\d{2}(:\d{2})?\s+\S/m.test(cap)) {
    const yc = youtubeChapters(chapters, total);
    if (!YT) console.log(`  -     ${chapters.length} bab tidak dicantumkan di caption (bab bertimestamp hanya untuk video 16:9/YouTube)`);
    else if (!yc.ok) console.log(`  !     ${chapters.length} bab tidak memenuhi syarat bab YouTube (${yc.alasan}); deskripsi tanpa timestamp`);
    else {
      const block = `Bab:\n${yc.chapters.map((c) => `${hms(c.start)} ${c.title}`).join("\n")}`;
      const lines = cap.split("\n"), hi = lines.findIndex((l, i) => i > 0 && /^\s*#[\p{L}\p{N}_]/u.test(l));
      cap = hi > 0 ? [...lines.slice(0, hi), block, "", ...lines.slice(hi)].join("\n") : `${cap}\n\n${block}`;
      ok(`deskripsi YouTube: ${yc.chapters.length} bab bertimestamp`);
    }
  }
  const first = cap.split("\n")[0].trim();
  const tags = cap.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (/TODO/.test(cap)) bad("caption masih berisi TODO");
  else {
    writeFileSync(paths.caption, cap + "\n");
    ok(`caption: ${cap.length} huruf, ${tags.length} hashtag -> ${path.relative(ROOT, paths.caption)}`);
  }
  if (first.length > 125) bad(`baris pembuka ${first.length} huruf (maks 125 agar tidak terpotong "selengkapnya")`);
  if (YT) {
    if (cap.length > 5000) bad(`deskripsi ${cap.length} huruf (batas YouTube 5000)`);
    if (tags.length > 15) bad(`${tags.length} hashtag (YouTube mengabaikan semua hashtag bila lebih dari 15)`);
    else if (tags.length < 1 || tags.length > 5) console.log(`  -     ${tags.length} hashtag; YouTube menampilkan 3 pertama di atas judul, disarankan 3-5`);
  } else {
    if (cap.length > 2200) bad(`caption ${cap.length} huruf (batas Instagram/TikTok 2200)`);
    if (tags.length > 30) bad(`${tags.length} hashtag (batas Instagram 30)`);
    else if (tags.length < 3 || tags.length > 10) console.log(`  -     ${tags.length} hashtag; disarankan 3-10 yang relevan`);
  }
}

// --- subtitle ditanam (opsional) ---
if (args.includes("--burn")) {
  const y = parseInt(opt("y") ?? board.subtitleY ?? (CV.format === "9:16" ? 1300 : CV.safe.b - 150));
  const dir = path.join(paths.work, "subtitle-png");
  mkdirSync(dir, { recursive: true });
  const inputs = [];
  const chain = [];
  let last = "0:v";
  cues.forEach((c, i) => {
    const f = path.join(dir, `c${i}.png`);
    execFileSync(PY, [path.join(ENGINE, "scripts", "subtitle_png.py"), f, c.t, "--y", String(y), "--w", String(CV.w), "--h", String(CV.h), ...(YT ? ["--size", "46"] : [])]);
    inputs.push("-i", f);
    const o = i === cues.length - 1 ? "v" : `s${i}`;
    chain.push(`[${last}][${i + 1}:v]overlay=0:0:enable='between(t,${c.s.toFixed(3)},${c.e.toFixed(3)})'[${o}]`);
    last = o;
  });
  const sub = paths.result.replace(/\.mp4$/, ".sub.mp4");
  run("ffmpeg", ["-v", "error", "-y", "-i", paths.result, ...inputs, "-filter_complex", chain.join(";"), "-map", "[v]", "-map", "0:a",
    ...x264Args(encodeFor(name), { audio: "copy" }), sub]);
  ok(`subtitle ditanam (y ${y}) -> ${path.relative(ROOT, sub)}`);
}

console.log(problems ? `\n${problems} hal perlu dibereskan di ${path.relative(ROOT, out)}/` : `\nHasil siap unggah: ${path.relative(ROOT, paths.resultDir)}/ (video, thumbnail.jpg, caption.txt)`);
process.exit(problems ? 1 : 0);
