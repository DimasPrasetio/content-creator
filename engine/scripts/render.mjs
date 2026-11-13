// Projects/<nama>/voice.wav + storyboard.json -> Result/<brand>/<nama>/<nama>.mp4 (1080x1920, 30 fps)
// Opsi: --preview  render 1 gambar per scene ke Projects/<nama>/preview/ (cepat, untuk cek visual)
//       --frames=120,300  (dengan --preview) render frame tertentu saja, mis. untuk cek momen di tengah scene
//       --draft   (dengan --preview) contoh frame gaya dari NASKAH saja (timing perkiraan, tanpa suara) ke Projects/<nama>/preview/draft/
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { DIRS, ENGINE, P, archiveResult, draftTiming, encodeFor, findLogo, parseScript, readJson, resolveName, run, writeLayout } from "./lib.mjs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const preview = args.includes("--preview");
const frames = args.find((a) => a.startsWith("--frames="))?.slice("--frames=".length).split(",").map(Number);

const draft = args.includes("--draft");
if (draft && !preview) throw new Error("--draft hanya untuk --preview (video akhir butuh voice over).");
const paths = P(name);
const timing = draft ? draftTiming(name) : readJson(paths.timing);
if (!timing) throw new Error(`Belum ada timing. Jalankan dulu: npm run voice -- ${name}`);
const wav = paths.voice;
if (!draft && !existsSync(wav)) throw new Error(`Voice over tidak ada: ${wav}`);
if (draft) console.log("Draft: timing perkiraan dari naskah (±2,5 kata/dtk), tanpa suara.");
const storyboard = readJson(paths.storyboard, { scenes: [] });
if (storyboard.composition === "mg4") throw new Error(`Storyboard ${name} memakai motion-graphics-v4: jalankan npm run mg4 -- ${name}`);
if (storyboard.composition === "html") throw new Error(`Storyboard ${name} memakai jalur HTML (motion-graphics-skills): jalankan npm run html -- ${name}`);
if (!storyboard.scenes.length) console.warn("! Storyboard kosong, semua scene memakai teks kinetik otomatis.");
// brand: default dari brand.json, ditimpa per video lewat "brand" di storyboard (kosong = tidak ditampilkan)
const brand = { ...readJson(path.join(ENGINE, "brand.json"), {}), ...(storyboard.brand ?? {}) };
// logo: Brands/<profil>/logo/<file> atau public/brand/<file>; disalin ke public/brand/ agar ikut tersaji
const slug = existsSync(paths.script) ? parseScript(readFileSync(paths.script, "utf8")).meta.profile : undefined;
for (const k of ["logoLeft", "logoRight"]) {
  if (!brand[k]) continue;
  const src = findLogo(brand[k], slug);
  if (!src) throw new Error(`Logo tidak ditemukan: ${brand[k]} (taruh di Brands/<brand>/logo/ atau Engine/public/brand/)`);
  const dst = path.join(ENGINE, "public", "brand", path.basename(src));
  mkdirSync(path.dirname(dst), { recursive: true });
  if (src !== dst) copyFileSync(src, dst);
  brand[k] = `brand/${path.basename(src)}`;
}

mkdirSync(path.join(ENGINE, "public", "audio"), { recursive: true });
if (draft) {
  const hening = path.join(ENGINE, "public", "audio", "_hening.wav");
  if (!existsSync(hening)) run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "1", hening]);
} else copyFileSync(wav, path.join(ENGINE, "public", "audio", `${name}.wav`));

// storyboard boleh memilih komposisi lain (mis. "Pop") dan audio campuran musik+SFX (data/<nama>.mix.wav).
// Disalin ke public/ SEBELUM bundle agar ikut tersaji.
const compId = storyboard.composition ?? "Video";
const mix = paths.mix;
const hasMix = !draft && existsSync(mix);
if (hasMix) copyFileSync(mix, path.join(ENGINE, "public", "audio", `${name}.mix.wav`));

await ensureBrowser();
console.log("Bundling...");
const serveUrl = await bundle({ entryPoint: path.join(ENGINE, "src", "index.ts"), publicDir: path.join(ENGINE, "public") });
const inputProps = { name, timing: hasMix ? { ...timing, audio: `audio/${name}.mix.wav` } : timing, storyboard, brand, layoutCheck: preview };
if (hasMix) console.log("Audio: narasi + musik/SFX (mix)");
const composition = await selectComposition({ serveUrl, id: compId, inputProps });

if (preview) {
  const dir = path.join(paths.preview, ...(draft ? ["draft"] : []));
  mkdirSync(dir, { recursive: true });
  // cek tata letak otomatis: <LayoutProbe/> di komposisi mengirim hasil ukur lewat log browser
  const layout = [];
  const still = async (frame, output, label) => {
    let rep = null;
    await renderStill({
      composition,
      serveUrl,
      inputProps,
      frame,
      output,
      onBrowserLog: (l) => {
        const m = l.text.match(/^LAYOUT_PROBE (.*)$/s);
        if (m) rep = JSON.parse(m[1]);
      },
    });
    if (rep) layout.push({ label, frame, ...rep });
    console.log("preview:", path.relative(process.cwd(), output), rep ? `| ${rep.errors.length} error, ${rep.warns.length} peringatan` : "");
  };
  for (const frame of frames ?? []) await still(frame, path.join(dir, `frame-${String(frame).padStart(4, "0")}.png`), `frame ${frame}`);
  for (const sc of frames ? [] : timing.scenes) {
    // akhir scene (semua elemen sudah muncul), sebelum overlay transisi komposisi Pop dimulai
    const frame = sc.startFrame + Math.max(0, sc.durationFrames - (compId === "Pop" ? 14 : 2));
    await still(frame, path.join(dir, `scene-${String(sc.index + 1).padStart(2, "0")}.png`), `scene ${sc.index + 1}`);
  }
  writeLayout(dir, layout, draft);
} else {
  mkdirSync(paths.resultDir, { recursive: true });
  archiveResult(name);
  const outputLocation = paths.result;
  let last = -1;
  const e = encodeFor(name); // capped CRF (lib.mjs ENCODE_DEFAULT / config "encode")
  await renderMedia({
    composition,
    serveUrl,
    inputProps,
    codec: "h264",
    crf: e.crf,
    x264Preset: e.preset,
    ...(e.maxrate ? { encodingMaxRate: String(e.maxrate), encodingBufferSize: String(e.bufsize) } : {}),
    pixelFormat: "yuv420p",
    audioCodec: "aac",
    audioBitrate: String(e.audioBitrate),
    outputLocation,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) {
        last = pct;
        process.stdout.write(`\rRender ${pct}%`);
      }
    },
  });
  console.log(`\nSelesai: ${path.relative(process.cwd(), outputLocation)} (${(timing.totalFrames / timing.fps).toFixed(1)} detik)`);
}
