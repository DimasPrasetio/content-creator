// Render video dengan skill motion-graphics-v4 (.claude/skills/motion-graphics-v4), tersambung ke pipeline project.
//
// Pemakaian: npm run mg4 -- <nama> [--only=4,6] [--finish] | --draft --style=a,b (contoh frame gaya, lihat di bawah)
//   --only=4,6  render ulang scene itu saja (revisi), scene lain memakai klip terakhir
//   --finish    tanpa render: tempel ulang brand ke versi terakhir lalu salin ke Result/ (mis. setelah brand diganti)
// Masukan : Projects/<nama>/storyboard.json  {"composition":"mg4","style":"kinetic-type","palette":{},"brand":{...},
//                                      "scenes":[{"lines":["..."],"key":"...","layout":null,"icon":null,"sfx":[...],"music":"full"}]}
//           Engine/work/<nama>/timing.json (dari `npm run voice`), Projects/<nama>/voice.wav atau work/<nama>/mix.wav (`npm run sound`)
// Proses  : scenes.json dibuat ulang dari timing suara (start/end per scene, sentence = narasi scene), divalidasi,
//           dirender (Chromium), dicek otomatis (selfcheck + contact sheet), lalu brand pojok atas ditempel.
// Keluaran: Engine/work/<nama>/mg4/<nama>_vN.mp4 (versi), Projects/<nama>/preview/checks_vN/ + contact_vN.png, Result/<nama>.mp4
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, ROOT, archiveResult, brandProfile, draftTiming, encodeFor, findLogo, mg4Skill, parseScript, readJson, resolveName, run, x264Args } from "./lib.mjs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const finishOnly = args.includes("--finish");
const PY = path.join(ENGINE, ".venv", "bin", "python");
const SKILL = mg4Skill();
if (!SKILL) throw new Error("Skill motion-graphics-v4 (Anthropic) tidak ditemukan di komputer ini, jadi jalur B tidak tersedia. Pasang skill itu (mis. ke ~/.claude/skills/motion-graphics-v4) atau set MG4_SKILL, atau pakai jalur A/C.");
const S = (f) => path.join(SKILL, "scripts", f);
const FPS = 30;
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const paths = P(name);
const scriptMeta = existsSync(paths.script) ? parseScript(readFileSync(paths.script, "utf8")).meta : {};
// logo brand: nama file dicari di Brands/<profil>/logo/ lalu Engine/public/brand/ (path absolut untuk brand_png.py)
const withLogos = (b) => {
  const out = { ...b };
  for (const k of ["logoLeft", "logoRight"]) if (out[k]) out[k] = findLogo(out[k], scriptMeta.profile) ?? out[k];
  return out;
};

// --- Contoh frame gaya (draft): dari NASKAH saja, tanpa suara, tanpa kredit ElevenLabs ---
//   npm run mg4 -- <nama> --draft --style=kinetic-type,clay-pop [--scenes=1,2] [--palette='{"accent":"#FF5A1F"}'] [--brand='{"left":"X"}']
//   -> Projects/<nama>/preview/draft/gaya-<style>.png (frame scene terpilih berdampingan, brand pojok ikut ditempel)
if (args.includes("--draft")) {
  const md = readJson(paths.storyboard, {});
  const t = draftTiming(name);
  const pick = (opt("scenes") ?? "1,2").split(",").map((x) => parseInt(x) - 1).filter((i) => t.scenes[i]);
  const styles = (opt("style") ?? md.style ?? "kinetic-type,clay-pop,chrome-y2k,crt-terminal,blueprint-lab").split(",");
  const prof = brandProfile(scriptMeta.profile) ?? {};
  const palette = opt("palette") ? JSON.parse(opt("palette")) : md.palette ?? prof.visual?.palette ?? {};
  const brand = opt("brand") ? JSON.parse(opt("brand")) : md.brand ?? prof.brand ?? {};
  // baris layar: dari storyboard mg4 bila sudah ada (paling akurat), kalau tidak otomatis (≤ 6 kata pertama, 3 kata per baris)
  const auto = (text) => {
    const w = text.split(/\s+/).filter(Boolean).slice(0, 6);
    const lines = [];
    for (let i = 0; i < w.length; i += 3) lines.push(w.slice(i, i + 3).join(" "));
    const key = [...w].sort((a, b) => b.replace(/\W/g, "").length - a.replace(/\W/g, "").length)[0];
    return { lines, key: key.replace(/[^\p{L}\p{N}-]/gu, "") };
  };
  const outRoot = path.join(paths.preview, "draft");
  mkdirSync(outRoot, { recursive: true });
  const png = path.join(outRoot, "_brand.png");
  execFileSync(PY, [path.join(ENGINE, "scripts", "brand_png.py"), JSON.stringify(withLogos(brand)), png]);
  const made = [];
  for (const style of styles) {
    let at = 0;
    const scenes = pick.map((i, k) => {
      const sc = t.scenes[i];
      const sb = md.composition === "mg4" && md.scenes?.[i]?.lines?.length ? md.scenes[i] : auto(sc.text);
      const d = sc.durationFrames / FPS;
      const s = { id: k + 1, start: Math.round(at * 1000) / 1000, end: Math.round((at + d) * 1000) / 1000, sentence: sc.text, lines: sb.lines, key: sb.key, layout: sb.layout ?? null, icon: sb.icon ?? null };
      at += d;
      return s;
    });
    const dir = path.join(paths.work, "mg4-draft", style);
    mkdirSync(dir, { recursive: true });
    const sp = path.join(dir, "scenes.json");
    writeFileSync(sp, JSON.stringify({ project: "draft", style, format: "9:16", palette, audio: null, scenes }, null, 2));
    process.stdout.write(`${style}: `);
    const r = spawnSync(PY, [S("render.py"), sp, "--out", dir], { encoding: "utf8" });
    if (r.status !== 0) {
      console.log(`GAGAL\n${(r.stderr || r.stdout).slice(-600)}`);
      continue;
    }
    const res = JSON.parse(r.stdout.trim().split("\n").at(-1));
    const frames = scenes.map((s, k) => {
      const f = path.join(dir, `f${k + 1}.png`);
      const at = s.start + (s.end - s.start) * 0.7; // sesudah elemen masuk, sebelum transisi keluar
      run("ffmpeg", ["-v", "error", "-y", "-ss", at.toFixed(2), "-i", res.final, "-i", png, "-filter_complex", "[0:v][1:v]overlay=0:0,scale=540:-1", "-frames:v", "1", f]);
      return f;
    });
    const out = path.join(outRoot, `gaya-${style}.png`);
    if (frames.length > 1) run("ffmpeg", ["-v", "error", "-y", ...frames.flatMap((f) => ["-i", f]), "-filter_complex", `hstack=${frames.length}`, out]);
    else run("ffmpeg", ["-v", "error", "-y", "-i", frames[0], out]);
    console.log(path.relative(process.cwd(), out));
    made.push([style, out]);
  }
  if (made.length > 1) {
    const board = path.join(outRoot, "pilihan-gaya.png");
    execFileSync(PY, [path.join(ENGINE, "scripts", "board_png.py"), board, ...made.map(([l, f]) => `${l}=${f}`)]);
    console.log(`Papan perbandingan: ${path.relative(process.cwd(), board)}`);
  }
  process.exit(0);
}

const board = readJson(paths.storyboard);
if (!board) throw new Error(`Storyboard belum ada: ${path.relative(ROOT, paths.storyboard)}`);
if (board.composition !== "mg4") throw new Error(`Storyboard ${name} bukan "composition": "mg4" (pakai npm run render untuk Video/Pop).`);
const timing = readJson(paths.timing);
if (!timing) throw new Error(`Timing belum ada. Jalankan dulu: npm run voice -- ${name}`);
if ((board.scenes ?? []).length !== timing.scenes.length)
  throw new Error(`Jumlah scene storyboard (${board.scenes?.length ?? 0}) ≠ jumlah scene suara (${timing.scenes.length}).`);

const voice = paths.voice;
const mix = paths.mix;
const audio = existsSync(mix) && statSync(mix).mtimeMs >= statSync(voice).mtimeMs ? mix : voice;

const dir = paths.mg4;
mkdirSync(paths.preview, { recursive: true });
mkdirSync(dir, { recursive: true });
const r3 = (x) => Math.round(x * 1000) / 1000;
const cfg = {
  project: name,
  style: board.style,
  format: board.format ?? "9:16",
  palette: board.palette ?? {},
  audio,
  scenes: timing.scenes.map((t, i) => {
    const sb = board.scenes[i];
    const end = i < timing.scenes.length - 1 ? timing.scenes[i + 1].startFrame : timing.totalFrames;
    return {
      id: i + 1,
      start: r3(t.startFrame / FPS),
      end: r3(end / FPS),
      sentence: t.text,
      lines: sb.lines ?? [],
      key: sb.key ?? "",
      layout: sb.layout ?? null,
      icon: sb.icon ?? null,
    };
  }),
};
const scenesPath = path.join(dir, "scenes.json");
writeFileSync(scenesPath, JSON.stringify(cfg, null, 2));
console.log(`scenes.json: ${cfg.scenes.length} scene, gaya ${cfg.style}, audio ${path.basename(audio)}`);

const py = (script, a, opt = {}) => {
  const r = spawnSync(PY, [S(script), ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opt });
  if (r.status !== 0) {
    process.stdout.write(r.stdout ?? "");
    throw new Error(`${script} gagal (exit ${r.status})`);
  }
  return r.stdout;
};

let res;
let checkOk = true;
if (finishOnly) {
  const vs = readdirSync(dir).map((f) => f.match(new RegExp(`^${name}_v(\\d+)\\.mp4$`))?.[1]).filter(Boolean).map(Number);
  if (!vs.length) throw new Error("Belum ada versi render. Jalankan tanpa --finish dulu.");
  const v = Math.max(...vs);
  res = { version: v, final: path.join(dir, `${name}_v${v}.mp4`) };
  console.log(`--finish: memakai versi v${v}`);
} else {
  py("validate_scenes.py", [scenesPath]);
  console.log("Render motion-graphics-v4 (±5-15 dtk per detik video)...");
  const out = py("render.py", [scenesPath, "--out", dir, ...(only ? ["--only", only] : [])]);
  res = JSON.parse(out.trim().split("\n").at(-1));
  console.log(`Versi v${res.version} (${res.backend}): ${path.relative(ROOT, res.final)}`);
  try {
    process.stdout.write(py("selfcheck.py", [scenesPath, "--video", res.final, "--out", path.join(paths.preview, `checks_v${res.version}`)]));
  } catch (e) {
    checkOk = false;
    console.warn(`! selfcheck: ${e.message}`);
  }
  py("contact_sheet.py", [scenesPath, res.final, path.join(paths.preview, `contact_v${res.version}.png`)]);
}
const checks = path.join(paths.preview, `checks_v${res.version}`);

// brand pojok atas + kemas ulang (h264 yuv420p, aac) ke Result/
const brand = withLogos(board.brand ?? readJson(path.join(ENGINE, "brand.json"), {}));
archiveResult(name);
const final = paths.result;
mkdirSync(paths.resultDir, { recursive: true });
const hasBrand = !!(brand.left || brand.right || brand.logoLeft || brand.logoRight);
const enc = x264Args(encodeFor(name));
if (hasBrand) {
  const png = path.join(dir, "brand.png");
  execFileSync(PY, [path.join(ENGINE, "scripts", "brand_png.py"), JSON.stringify(brand), png]);
  run("ffmpeg", ["-v", "error", "-y", "-i", res.final, "-i", png, "-filter_complex", "[0:v][1:v]overlay=0:0[v]", "-map", "[v]", "-map", "0:a", ...enc, final]);
} else {
  run("ffmpeg", ["-v", "error", "-y", "-i", res.final, "-map", "0", ...enc, final]);
}
console.log(`\nSelesai: ${path.relative(process.cwd(), final)}${hasBrand ? " (dengan brand pojok)" : ""}`);
console.log(`Lihat frame tengah tiap scene di ${path.relative(process.cwd(), checks)}/ dan contact sheet di ${path.relative(process.cwd(), dir)}/`);
if (!checkOk) process.exit(2);
