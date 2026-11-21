// Jalur C · HTML motion (skill motion-graphics-skills: launch-video, vox-explainer, apple-launch-film, animated-chart,
// milestone-reveal, motion-effects, title-sequence-3d, newsletter-promo, ...) -> MP4, tersambung ke pipeline project.
//
// Pemakaian: npm run html -- <nama> [--preview] [--draft]
//   (tanpa opsi)  render video: Projects/<nama>/html/index.html + suara/mix -> Result/<nama>.mp4 (brand pojok ditempel)
//   --preview     1 PNG per scene (di akhir scene) -> Projects/<nama>/preview/
//   --draft       pakai timing PERKIRAAN dari naskah (tanpa suara, tanpa kredit): contoh frame gaya -> preview/draft/
//   --workers=4   render video paralel (bawaan 4 browser) · --no-gpu  rasterisasi perangkat lunak (frame persis versi lama)
//   --subframes=N motion blur (bawaan: storyboard "motionBlur", lalu halaman: kit kamera 16, lainnya 1 = mati)
// Storyboard: Projects/<nama>/storyboard.json {"composition":"html","skill":"launch-video","brand":{...},
//             "brandOverlay": true, "scenes":[{"music":"full","sfx":[...]}]}   (sfx/music dipakai `npm run sound`)
// Kontrak halaman: window.seek(seconds) menggambar frame tepat (fungsi murni dari waktu), menunggu seek bila URL ?render.
// Data yang disisipkan: window.__TIMING__ = {fps, total, bab, scenes:[{start, end, text, chapter?, words:[{w, s, e}]}]} (detik),
//                       window.__BRAND__ = brand storyboard, window.__CANVAS__ = {format, w, h, safe:{l,r,t,b}, ui}
//                       (storyboard "format": 9:16 | 16:9 | 4:5 | 1:1). Pustaka lokal: /vendor/<paket npm>/... (mis. three).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, ROOT, archiveResult, canvasOf, draftTiming, encodeFor, findLogo, parseScript, readJson, resolveName, run, writeLayout, x264Args } from "./lib.mjs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const preview = args.includes("--preview");
const draft = args.includes("--draft");
const paths = P(name);
const PY = path.join(ENGINE, ".venv", "bin", "python");

const page = path.join(paths.html, "index.html");
if (!existsSync(page)) throw new Error(`Halaman belum ada: ${path.relative(ROOT, page)} (tulis dengan skill motion-graphics-skills)`);
const board = readJson(paths.storyboard, {});
if (board.composition && board.composition !== "html") throw new Error(`Storyboard ${name} bukan "composition": "html".`);
const timing = draft ? draftTiming(name) : readJson(paths.timing);
if (!timing) throw new Error(`Timing belum ada. Jalankan dulu: npm run voice -- ${name} (atau pakai --draft)`);
if (!preview && draft) throw new Error("--draft hanya untuk --preview (video akhir butuh voice over).");

const fps = timing.fps;
const sec = (f) => Math.round((f / fps) * 1000) / 1000;
const T = {
  fps,
  total: sec(timing.totalFrames),
  draft: !!timing.draft,
  scenes: timing.scenes.map((s, i) => ({
    index: i,
    start: sec(s.startFrame),
    end: sec(i < timing.scenes.length - 1 ? timing.scenes[i + 1].startFrame : timing.totalFrames),
    text: s.text,
    words: (s.words ?? []).map((w) => ({ w: w.w, s: sec(s.startFrame + w.f), e: sec(s.startFrame + w.e) })),
  })),
};
const parsed = existsSync(paths.script) ? parseScript(readFileSync(paths.script, "utf8")) : { meta: {}, scenes: [] };
const meta = parsed.meta;
// bab (opsional): "> bab: Judul" di naskah -> T.scenes[i].chapter; tampilan diatur storyboard "bab": "tanpa" | "label" | "kartu"
T.scenes.forEach((s, i) => { if (parsed.scenes[i]?.chapter) s.chapter = parsed.scenes[i].chapter; });
T.bab = board.bab ?? "tanpa";
const canvas = canvasOf(name);
const brand = { ...(board.brand ?? readJson(path.join(ENGINE, "brand.json"), {})) };
for (const k of ["logoLeft", "logoRight"]) if (brand[k]) brand[k] = findLogo(brand[k], meta.profile) ?? brand[k];

mkdirSync(paths.work, { recursive: true });
const inject = path.join(paths.work, "html-inject.json");
writeFileSync(inject, JSON.stringify({ timing: T, brand: board.brand ?? {}, canvas }));

const py = (a) => {
  const r = spawnSync(PY, [path.join(ENGINE, "scripts", "html_render.py"), "--root", paths.html, "--inject", inject, ...a], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (r.status !== 0) throw new Error(`html_render gagal (exit ${r.status})\n${r.stdout ?? ""}`);
  const { errors, layout } = JSON.parse(r.stdout.trim().split("\n").at(-1));
  if (errors.length) console.warn(`! ${errors.length} error di halaman:\n  ${errors.join("\n  ")}`);
  return { errors, layout };
};

const overlay = board.brandOverlay !== false && (brand.left || brand.right || brand.logoLeft || brand.logoRight);
const brandPng = path.join(paths.work, "brand.png");
if (overlay) execFileSync(PY, [path.join(ENGINE, "scripts", "brand_png.py"), JSON.stringify(brand), brandPng, JSON.stringify(canvas)]);

if (preview) {
  const dir = path.join(paths.preview, ...(draft ? ["draft"] : []));
  // akhir scene (elemen sudah masuk), sedikit sebelum transisi keluar
  const stills = T.scenes.map((s) => Math.max(s.start, s.end - 0.45).toFixed(3)).join(",");
  const { layout } = py(["--stills", stills, "--png-dir", dir]);
  // kartu bab: satu frame per kartu (0,8 dtk setelah bab mulai) -> preview/bab-NN.png, ikut dicek tata letaknya
  const cards = T.bab === "kartu" ? T.scenes.filter((s) => s.chapter && s.start > 0.5) : [];
  if (cards.length) {
    const bd = path.join(dir, "bab");
    mkdirSync(bd, { recursive: true });
    const r = py(["--stills", cards.map((s) => (s.start + 0.8).toFixed(3)).join(","), "--png-dir", bd]);
    r.layout.forEach((l, i) => {
      const f = `bab-${String(i + 1).padStart(2, "0")}.png`;
      renameSync(path.join(bd, `scene-${String(i + 1).padStart(2, "0")}.png`), path.join(dir, f));
      layout.push({ ...l, label: `kartu bab ${i + 1}` });
    });
    rmSync(bd, { recursive: true, force: true });
  }
  if (overlay)
    T.scenes.forEach((_, i) => {
      const f = path.join(dir, `scene-${String(i + 1).padStart(2, "0")}.png`);
      run("ffmpeg", ["-v", "error", "-y", "-i", f, "-i", brandPng, "-filter_complex", "[0:v][1:v]overlay=0:0", f.replace(/\.png$/, ".b.png")]);
      run("mv", [f.replace(/\.png$/, ".b.png"), f]);
    });
  console.log(`Preview: ${path.relative(process.cwd(), dir)}/ (${T.scenes.length} scene${draft ? ", timing perkiraan" : ""})`);
  writeLayout(dir, layout, draft);
} else {
  const audio = existsSync(paths.mix) && statSync(paths.mix).mtimeMs >= statSync(paths.voice).mtimeMs ? paths.mix : paths.voice;
  const raw = path.join(paths.work, "html-raw.mp4");
  console.log(`Render HTML ${canvas.w}x${canvas.h} (${canvas.format}) ${T.total} dtk @ ${fps} fps, audio ${path.basename(audio)} ...`);
  const workers = args.find((a) => a.startsWith("--workers="))?.split("=")[1] ?? "4";
  // motion blur: storyboard "motionBlur" (jumlah sub-frame; 1 = mati) menimpa bawaan halaman (kit kamera 16, lainnya 1)
  const mb = args.find((a) => a.startsWith("--subframes="))?.split("=")[1] ?? board.motionBlur;
  const { errors } = py(["--fps", String(fps), "--duration", String(T.total), "--out", raw, "--audio", audio, "--workers", workers,
    ...(args.includes("--no-gpu") ? ["--no-gpu"] : []), ...(mb != null ? ["--subframes", String(mb)] : [])]);
  // html-raw.mp4 = perantara kualitas tinggi; kompresi final (capped CRF) hanya sekali di sini
  const enc = x264Args(encodeFor(name));
  mkdirSync(path.dirname(paths.result), { recursive: true });
  archiveResult(name);
  if (overlay) run("ffmpeg", ["-v", "error", "-y", "-i", raw, "-i", brandPng, "-filter_complex", "[0:v][1:v]overlay=0:0[v]", "-map", "[v]", "-map", "0:a", ...enc, paths.result]);
  else run("ffmpeg", ["-v", "error", "-y", "-i", raw, "-map", "0", ...enc, paths.result]);
  console.log(`Selesai: ${path.relative(process.cwd(), paths.result)}${overlay ? " (dengan brand pojok)" : ""}`);
  if (errors.length) process.exit(2);
}
