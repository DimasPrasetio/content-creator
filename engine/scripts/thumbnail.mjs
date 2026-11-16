// Thumbnail khusus (bukan frame video): 2-3 varian sampul dengan pemicu psikologis, dirender dari tema brand.
//
//   npm run thumbnail -- <nama> [--pick=N]
//
// Masukan: Projects/<nama>/posting/thumbnail.json (ditulis agent):
//   { "pick": 1, "variants": [
//       { "trigger": "penasaran", "kicker": "SIMULASI SIDANG", "headline": "Dosen pasti tanya ini", "accent": "ini",
//         "sub": "Jawabanmu menentukan lulus", "sticker": "question", "layout": "atas", "visual": { "at": 3.2 } }, ... ] }
//   trigger : penasaran | takut-rugi | angka | tantangan | kontras | larangan (label, dicatat; tiap varian sebaiknya beda)
//   headline: 2-6 kata (huruf besar otomatis; "upper": false untuk mempertahankan); accent = kata yang distabilo
//   sticker : question | alert | cross | check | arrow | null
//   layout  : atas (teks di atas, potongan visual di bawah) | tengah (teks di tengah, visual penuh digelapkan)
//   visual  : { "at": detik, "crop": [x, y, w, h] } dari video hasil | { "image": "assets/x.png" } | false (polos)
//             bawaan: frame cover/akhir hook; potongan = zona visual kit (y 316-1171) bila proyek memakai kit HTML
//   font    : opsional, mis. "Anton" (bawaan = font judul tema)
// Keluaran: Result/<brand>/<nama>/thumbnail.jpg (varian terpilih) · Projects/<nama>/posting/thumb-N.jpg (semua varian) ·
//   posting/thumb-pilihan.jpg (papan perbandingan) · posting/thumb-grid.jpg (simulasi grid profil 3:4) · cover-grid.jpg
// Cek (GAGAL = exit 1): panjang teks, angka & klaim mutlak harus ada di naskah/brief (curiosity bait yang jujur, bukan
//   clickbait menipu), ukuran huruf headline >= 100 px (terbaca di grid), semua teks di pita aman x 60-1020 · y 300-1500.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DIRS, ENGINE, P, ROOT, brandOf, deepMerge, parseScript, readJson, resolveName, run } from "./lib.mjs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const paths = P(name);
const PY = path.join(ENGINE, ".venv", "bin", "python");
const postDir = path.join(paths.dir, "posting");
const specFile = path.join(postDir, "thumbnail.json");
if (!existsSync(specFile)) {
  console.error(`Belum ada ${path.relative(ROOT, specFile)} (varian sampul ditulis agent; format di kepala scripts/thumbnail.mjs).`);
  process.exit(3);
}
const spec = JSON.parse(readFileSync(specFile, "utf8"));
const variants = spec.variants ?? [];
if (!variants.length || variants.length > 4) throw new Error("thumbnail.json: isi 1-4 varian (disarankan 3)");
const board = readJson(paths.storyboard, {});
const timing = readJson(paths.timing, null);
let fails = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const bad = (m) => (fails++, console.log(`  GAGAL ${m}`));
const warn = (m) => console.log(`  !     ${m}`);

// --- 1. teks: ringkas, dan semua janji harus ditepati video (angka & klaim mutlak ada di naskah/brief) ---
// angka dicocokkan dengan narasi yang diucapkan saja (bukan judul scene/frontmatter); klaim mutlak dengan narasi + brief
const narration = existsSync(paths.script) ? parseScript(readFileSync(paths.script, "utf8")).scenes.map((x) => x.text).join(" ").toLowerCase() : "";
const brief = existsSync(path.join(paths.dir, "brief.md")) ? readFileSync(path.join(paths.dir, "brief.md"), "utf8").toLowerCase() : "";
const source = `${narration}\n${brief}`;
const NUM = { 1: "satu", 2: "dua", 3: "tiga", 4: "empat", 5: "lima", 6: "enam", 7: "tujuh", 8: "delapan", 9: "sembilan", 10: "sepuluh" };
const ABSOLUTE = ["dijamin", "jaminan", "garansi", "100%", "gratis", "pasti lulus", "pasti diterima", "terbukti", "resmi", "viral", "rahasia"];
const words = (s) => String(s ?? "").split(/\s+/).filter(Boolean);
console.log(`Thumbnail ${name}: ${variants.length} varian`);
const triggers = new Set();
variants.forEach((v, i) => {
  const tag = `varian ${i + 1}${v.trigger ? ` (${v.trigger})` : ""}`;
  const hw = words(v.headline);
  if (hw.length < 2 || hw.length > 6 || String(v.headline).length > 40) bad(`${tag}: headline ${hw.length} kata / ${String(v.headline ?? "").length} huruf (2-6 kata, maks 40 huruf)`);
  else if (hw.length > 5) warn(`${tag}: headline ${hw.length} kata; 3-5 kata paling terbaca di grid`);
  if (v.kicker && (words(v.kicker).length > 4 || v.kicker.length > 24)) bad(`${tag}: kicker maks 4 kata / 24 huruf`);
  if (v.sub && words(v.sub).length > 9) bad(`${tag}: sub maks 9 kata`);
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  for (const a of [].concat(v.accent ?? []).flatMap(words))
    if (!hw.map(norm).includes(norm(a))) bad(`${tag}: kata aksen "${a}" tidak ada di headline`);
  const all = [v.kicker, v.headline, v.sub].filter(Boolean).join(" ").toLowerCase();
  for (const n of all.match(/\d+(?:[.,]\d+)?%?/g) ?? []) {
    const bare = n.replace(/%$/, "");
    if (!new RegExp(`(^|[^\\d])${bare.replace(".", "\\.")}([^\\d]|$)`).test(narration) && !(NUM[bare] && new RegExp(`\\b${NUM[bare]}\\b`).test(narration)))
      bad(`${tag}: angka "${n}" tidak diucapkan di video (janji sampul harus ditepati video)`);
  }
  for (const w of ABSOLUTE) if (all.includes(w) && !source.includes(w)) bad(`${tag}: klaim "${w}" tidak ada di naskah/brief`);
  if (v.trigger) {
    if (triggers.has(v.trigger)) warn(`${tag}: pemicu sama dengan varian lain; variasikan agar bisa diuji A/B`);
    triggers.add(v.trigger);
  }
});

// --- 2. tema brand (sama dengan kit video) ---
const brand = brandOf(name);
const theme = deepMerge(readJson(path.join(ENGINE, "kit", "html", "theme.default.json"), {}), readJson(path.join(DIRS.brands, brand, "theme.json"), {}));
delete theme._doc;
const corner = board.brand ?? {};
const mark = theme.mark ?? theme.watermark?.parts ?? (corner.right || corner.left ? [[corner.right || corner.left, "accent"]] : []);

// --- 3. visual per varian (potongan frame video hasil, gambar aset, atau polos) ---
const work = path.join(paths.work, "thumb");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
copyFileSync(path.join(ENGINE, "kit", "thumb", "thumb.html"), path.join(work, "thumb.html"));
const isKit = existsSync(path.join(paths.html, "kit-core.js"));
const s1 = timing?.scenes?.[1];
const defaultAt = typeof board.cover?.at === "number" ? board.cover.at : s1 ? s1.startFrame / timing.fps - 0.45 : 1;
const specs = variants.map((v, i) => {
  let visual = null;
  if (v.visual !== false) {
    const vis = v.visual ?? {};
    const out = path.join(work, `v${i + 1}.jpg`);
    if (vis.image) {
      const src = path.resolve(paths.dir, vis.image);
      if (!existsSync(src)) throw new Error(`varian ${i + 1}: gambar tidak ada: ${vis.image}`);
      run("ffmpeg", ["-v", "error", "-y", "-i", src, "-q:v", "2", out]);
    } else {
      if (!existsSync(paths.result)) throw new Error(`Video belum ada (visual diambil dari video): ${path.relative(ROOT, paths.result)}`);
      const [x, y, w, h] = vis.crop ?? (isKit ? [0, 316, 1080, 855] : [0, 0, 1080, 1920]);
      run("ffmpeg", ["-v", "error", "-y", "-ss", Number(vis.at ?? defaultAt).toFixed(2), "-i", paths.result, "-frames:v", "1", "-vf", `crop=${w}:${h}:${x}:${y}`, "-q:v", "2", out]);
    }
    visual = path.basename(out);
  }
  const layout = v.layout ?? (visual && !isKit && !v.visual?.crop ? "tengah" : "atas");
  return { theme, mark, visual, v: { ...v, layout } };
});
writeFileSync(path.join(work, "specs.json"), JSON.stringify(specs));

// --- 4. render + cek tata letak ---
const reports = JSON.parse(execFileSync(PY, [path.join(ENGINE, "scripts", "thumb_render.py"), "--root", work, "--specs", path.join(work, "specs.json"), "--out-dir", work], { encoding: "utf8", maxBuffer: 16e6 }));
const inBand = (b) => !b || (b.x >= 60 && b.x + b.w <= 1020 && b.y >= 300 && b.y + b.h <= 1500);
reports.forEach((r, i) => {
  const tag = `varian ${i + 1}`;
  if (r.errors.length) bad(`${tag}: error halaman: ${r.errors[0]}`);
  if (r.fontSize < 100) bad(`${tag}: headline hanya ${r.fontSize} px (min 100 agar terbaca di grid); persingkat headline`);
  for (const k of ["head", "kicker", "sub"]) if (!inBand(r[k])) bad(`${tag}: ${k} keluar pita aman (x 60-1020, y 300-1500): ${JSON.stringify(r[k])}`);
  const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const sb = r.sticker && { x: r.sticker.x + 15, y: r.sticker.y + 15, w: r.sticker.w - 30, h: r.sticker.h - 30 };
  if ([...r.words, r.kicker, r.sub, r.mark].some((b) => hit(sb, b))) bad(`${tag}: stiker menimpa teks; ganti layout/stiker atau persingkat teks`);
  ok(`${tag}: ${r.layout}, headline ${r.fontSize} px, ${r.lines} baris`);
});

// --- 5. keluaran ---
const jpgs = reports.map((_, i) => {
  const f = path.join(postDir, `thumb-${i + 1}.jpg`);
  run("ffmpeg", ["-v", "error", "-y", "-i", path.join(work, `thumb-${i + 1}.png`), "-q:v", "2", f]);
  return f;
});
const pick = parseInt(opt("pick") ?? spec.pick ?? 1);
if (!(pick >= 1 && pick <= jpgs.length)) throw new Error(`pick ${pick} di luar 1-${jpgs.length}`);
execFileSync(PY, [path.join(ENGINE, "scripts", "board_png.py"), path.join(work, "pilihan.png"), ...jpgs.map((f, i) => `${i + 1 === pick ? "DIPAKAI" : variants[i].trigger ?? "varian"}=${f}`)]);
run("ffmpeg", ["-v", "error", "-y", "-i", path.join(work, "pilihan.png"), "-q:v", "3", path.join(postDir, "thumb-pilihan.jpg")]);
// simulasi grid profil TikTok (3:4, potong tengah) ukuran ubin ±360 px
const tiles = jpgs.flatMap((f) => ["-i", f]);
const fc = jpgs.map((_, i) => `[${i}:v]crop=1080:1440:0:240,scale=360:480,pad=366:480:0:0:color=black[t${i}]`).join(";") + `;${jpgs.map((_, i) => `[t${i}]`).join("")}hstack=inputs=${jpgs.length}[g]`;
run("ffmpeg", ["-v", "error", "-y", ...tiles, "-filter_complex", jpgs.length > 1 ? fc : fc.replace(/;\[t0\]hstack=inputs=1\[g\]$/, "").replace("[t0]", "[g]"), "-map", "[g]", "-q:v", "3", path.join(postDir, "thumb-grid.jpg")]);
mkdirSync(paths.resultDir, { recursive: true });
copyFileSync(jpgs[pick - 1], paths.thumbnail);
run("ffmpeg", ["-v", "error", "-y", "-i", paths.thumbnail, "-vf", "crop=1080:1350:0:285", "-q:v", "2", path.join(postDir, "cover-grid.jpg")]);
console.log(`Thumbnail: varian ${pick} -> ${path.relative(ROOT, paths.thumbnail)}; semua varian di posting/thumb-N.jpg, papan posting/thumb-pilihan.jpg, grid posting/thumb-grid.jpg`);
console.log(fails ? `${fails} pengecekan thumbnail gagal.` : "Thumbnail lolos cek.");
process.exit(fails ? 1 : 0);
