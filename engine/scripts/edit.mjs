// Mesin edit footage berbasis STYLE (bukan brand): footage talking-head -> video sesuai style (mis. ngobrol), kanvas
// edit.json "format" (bawaan 9:16 1080x1920; 16:9 1920x1080 untuk YouTube/video panjang, 4:5, 1:1).
//
//   npm run edit -- <nama> --new --style=ngobrol --input=/path/a.mov[,b.mov] [--brand=<slug>]
//        proyek baru: footage disalin ke Projects/<nama>/assets/raw/, dibuat Projects/<nama>/edit.json
//   npm run edit -- <nama> --analyze [--estimate]   (--estimate: hanya perkiraan menit Speech to Text, gratis)
//        normalisasi (30 fps tetap, HDR->SDR, audio 48 kHz) + transkrip per kata (ElevenLabs Scribe) + analisis wajah,
//        gerak, cahaya, noise -> Projects/<nama>/edit/konteks.md (dibaca agent) + kerangka "sentences" di edit.json
//   (agent mengisi edit.json: keputusan per kalimat -> maksud, buang/A-roll/B-roll, objek visual, alasan)
//   npm run edit -- <nama> --draft      validasi rencana -> potong + grading + audio -> preview tiap kalimat (+ cek)
//   npm run edit -- <nama>              ... + render akhir -> Result/<brand>/<nama>/<nama>.mp4 + cek edit + QA (+ posting)
//   --from=cut|sound|preview|render     mulai dari langkah tertentu (cache langkah sebelumnya dipakai)
//
// Podcast/wawancara (v0.9): --new ... --speakers=2..4 [--multicam [--audio-src=N]] -> transkrip dengan pembicara per kata
// (Scribe diarize; cadangan lokal resemblyzer), posisi tiap orang di frame (YuNet + gerak mulut), sinkron kamera dari
// suara, kamera selalu pada orang yang bicara (tahan minimal pace.minShotSec), nama pembicara (lower-third).
// Klip pendek dari video panjang: npm run clips (scripts/clips.mjs) membuat proyek edit anak dengan sources[].range.
//
// Rekaman layar & montase (v0.10), jenis dari style ("footage") atau --kind:
//   --kind=layar [--facecam=N] [--idle=cepat|buang] [--narasi=ai]   tutorial: zoom otomatis ke bagian layar yang berubah
//        (tercatat per kalimat, bisa dikoreksi "zoom"), layar diam/loading dipercepat berlabel atau dibuang, kamera wajah
//        di pojok (disinkron dari suara); --narasi=ai = layar bisu + voice over ElevenLabs (script.md -> npm run voice)
//   --kind=montase [--narasi=ai] [--music=lagu.mp3] [--duration=30]  klip dipilih otomatis (tajam, stabil, bergerak)
//        dan dipotong mengikuti ketukan musik ("montage.shots" di edit.json, bisa dikoreksi); --narasi=ai = klip ditata
//        mengikuti voice over
//   --broll=a.mp4,b.mp4 (vlog bicara + B-roll) & --music=<file> (musik latar, di-duck di bawah suara) untuk jenis apa pun
//
// Style: Styles/<slug>/style.json di workspace (hasil analisis referensi pengguna) > Engine/styles/<slug>/ (bawaan plugin).
// Brand (--brand) hanya identitas: brand pojok & kamus; rasa video dari style.
// Format edit.json & tata bahasa visual: Engine/styles/README.md.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DIRS, ENGINE, FORMATS, P, ROOT, archiveResult, bps, deepMerge, duration, encodeFor, listStyles, loadStyle, normFormat, normTokens, readJson, resolveName, run, writeLayout } from "./lib.mjs";
import { activityIn, beatSlots, pickMoments, screenRanges, splitSlots, topWindows, zoomBox, zoomKeys } from "./edit_plan.mjs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const has = (k) => args.includes(`--${k}`);
const paths = P(name);
const PY = path.join(ENGINE, ".venv", "bin", "python");
const FPS = 30;
const planFile = path.join(paths.dir, "edit.json");
const edir = path.join(paths.work, "edit");
const pdir = path.join(paths.dir, "edit");
mkdirSync(edir, { recursive: true });
const sha = (x) => createHash("sha1").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex").slice(0, 12);
const say = (m) => console.log(`\n== ${m}`);
const probeJson = (f) => JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=index,codec_type,width,height,r_frame_rate,color_transfer,color_primaries:stream_side_data=rotation:format=duration", "-of", "json", f]));

/** Style edit (kind "edit"): Styles/<slug>/ milik pengguna menimpa bawaan Engine/styles/<slug>/; nama lama (alias) dikenali. */
const editStyle = (name) => {
  const st = loadStyle(name);
  if (st.kind !== "edit") throw new Error(`Style "${st.slug}" adalah style animasi (jalur ${st.jalur ?? "html"}), bukan style edit footage. Style edit: ${listStyles().filter((x) => x.kind === "edit").map((x) => x.slug).join(", ")}`);
  return st;
};

// ---------------------------------------------------------------- proyek baru
if (has("new")) {
  const est = editStyle(opt("style") ?? "ngobrol"), style = est.slug;
  const inputs = (opt("input") ?? "").split(",").filter(Boolean);
  if (!inputs.length) throw new Error("--input=<footage.mp4>[,<footage2.mov>] wajib");
  const raw = path.join(paths.dir, "assets", "raw");
  mkdirSync(raw, { recursive: true });
  const copyIn = (f, i, dir) => {
    if (!existsSync(f)) throw new Error(`File tidak ada: ${f}`);
    mkdirSync(dir, { recursive: true });
    const dst = path.join(dir, `${String(i + 1).padStart(2, "0")}-${path.basename(f).replace(/[^\w.-]+/g, "_")}`);
    copyFileSync(f, dst);
    // transkrip sidecar ikut disalin bila ada (<footage>.words.json)
    const side = f.replace(/\.[^./]+$/, ".words.json");
    if (existsSync(side)) copyFileSync(side, dst.replace(/\.[^./]+$/, ".words.json"));
    return { file: path.relative(paths.dir, dst) };
  };
  const sources = inputs.map((f, i) => copyIn(f, i, raw));
  // v0.10: jenis footage (bicara | layar | montase), narasi (rekaman | ai | musik), kamera wajah, B-roll, musik
  const kind = opt("kind") ?? est.footage ?? "bicara";
  if (!["bicara", "layar", "montase"].includes(kind)) throw new Error("--kind=bicara | layar | montase");
  const narasi = opt("narasi") ?? (kind === "montase" ? "musik" : "rekaman");
  if (!["rekaman", "ai", "musik"].includes(narasi) || (narasi === "musik" && kind !== "montase") || (narasi === "rekaman" && kind === "montase") || (narasi === "ai" && kind === "bicara"))
    throw new Error("--narasi: bicara = rekaman, layar = rekaman | ai, montase = musik | ai");
  const fc = opt("facecam") ? Number(opt("facecam")) : null;
  if (fc !== null && (kind !== "layar" || narasi !== "rekaman" || !(fc >= 1 && fc <= sources.length) || sources.length < 2)) throw new Error(`--facecam=N: nomor footage kamera wajah untuk --kind=layar bersuara sendiri (bukan --narasi=ai), dengan minimal 2 footage`);
  const idle = opt("idle");
  if (idle && !["cepat", "buang", "utuh"].includes(idle)) throw new Error("--idle=cepat | buang | utuh");
  const broll = (opt("broll") ?? "").split(",").filter(Boolean).map((f, i) => copyIn(f, i, path.join(paths.dir, "assets", "broll")));
  const music = opt("music") ? { file: copyIn(opt("music"), 0, path.join(paths.dir, "assets", "music")).file } : null;
  const extra = { ...(kind !== "bicara" ? { kind } : {}), ...(narasi !== "rekaman" ? { narasi } : {}), ...(kind === "layar" ? { screen: fc === 1 ? 2 : 1 } : {}),
    ...(fc ? { facecam: { src: fc } } : {}), ...(idle ? { idle } : {}), ...(broll.length ? { broll } : {}), ...(music ? { music } : {}),
    ...(opt("duration") ? { duration: [Math.max(5, Number(opt("duration")) - 5), Number(opt("duration")) + 5] } : {}) };
  if (existsSync(planFile) && !has("force")) throw new Error(`${path.relative(ROOT, planFile)} sudah ada (--force untuk menimpa)`);
  const brandSlug = opt("brand");
  // kanvas: --format, atau bawaan style (Siniar = 16:9), atau 9:16
  const format = normFormat(opt("format") ?? (est.canvas?.width > est.canvas?.height ? "16:9" : "9:16"));
  // podcast/wawancara: jumlah pembicara (2-4) dan kamera dari sesi yang sama (multicam: disinkron dari suara)
  const nSpk = Number(opt("speakers") ?? 0);
  if (nSpk && !(nSpk >= 2 && nSpk <= 4)) throw new Error("--speakers=2..4 (podcast/wawancara, maksimal 4 orang)");
  const multicam = has("multicam");
  if (multicam && sources.length < 2) throw new Error("--multicam butuh minimal 2 footage (kamera dari sesi rekaman yang sama)");
  const audioSrc = Number(opt("audio-src") ?? 1);
  if (multicam && !(audioSrc >= 1 && audioSrc <= sources.length)) throw new Error(`--audio-src=1..${sources.length} (footage yang suaranya dipakai)`);
  writeFileSync(planFile, JSON.stringify({ style, ...(format !== "9:16" ? { format } : {}), ...(brandSlug ? { profile: brandSlug } : {}), brand: { left: "", right: "" },
    ...(nSpk ? { speakers: Array.from({ length: nSpk }, (_, k) => ({ id: "ABCD"[k], name: "", title: "" })) } : {}),
    ...(multicam ? { multicam: true, audio: audioSrc } : {}), ...extra, sources, glossary: {}, sentences: [] }, null, 2) + "\n");
  const kindTxt = kind === "layar" ? `, rekaman layar${fc ? ` + kamera wajah src${fc}` : ""}` : kind === "montase" ? ", montase" : "";
  console.log(`Proyek edit: ${path.relative(ROOT, paths.dir)}/ (style ${style}, ${sources.length} footage${kindTxt}${narasi === "ai" ? ", voice over AI" : ""}${broll.length ? `, ${broll.length} B-roll` : ""}${music ? ", musik dari file" : ""}${nSpk ? `, ${nSpk} pembicara` : ""}${multicam ? `, multikamera (suara src${audioSrc})` : ""}).`);
  console.log(narasi === "ai" ? `Lanjut: npm run edit -- ${name} --analyze, lalu tulis Projects/${name}/script.md (satu ## per langkah) dan npm run voice -- ${name}` : `Lanjut: npm run edit -- ${name} --analyze`);
  process.exit(0);
}

const plan = readJson(planFile, null);
if (!plan) throw new Error(`Belum ada ${path.relative(ROOT, planFile)}: npm run edit -- ${name} --new --style=<style> --input=<footage>`);
const S = editStyle(plan.style ?? "ngobrol");
// kanvas (v0.8): edit.json "format"; 9:16 = perilaku lama persis
const CV = FORMATS[normFormat(plan.format)], CW = CV.w, CH = CV.h, ASP = CW / CH, LAND = CW > CH, V916 = CV.format === "9:16";
const SUB_Y0 = V916 ? S.type?.subtitle?.zoneY?.[0] ?? 1244 : CV.safe.b - (LAND ? 150 : 170);
const pace = S.pace ?? {};
// podcast (v0.9): pembicara, multikamera, sumber suara (nomor footage 1..n di edit.json, indeks 0.. di sini)
const NSPK = plan.speakers?.length ?? 0, DIAR = NSPK >= 2;
const MC = !!plan.multicam && plan.sources.length > 1;
const AUD = MC ? Math.max(0, (plan.audio ?? 1) - 1) : -1;
const PODPY = path.join(ENGINE, "scripts", "edit_podcast.py");
// v0.10: jenis footage & narasi; layar = sumber rekaman layar (indeks), FC = kamera wajah (indeks) atau -1
const KIND = plan.kind ?? S.footage ?? "bicara", LAYAR = KIND === "layar", MONTASE = KIND === "montase";
const NARASI = plan.narasi ?? (MONTASE ? "musik" : "rekaman"), VO = NARASI === "ai", MUSIK = NARASI === "musik";
const SCR = LAYAR ? (plan.screen ?? 1) - 1 : -1;
const FC = LAYAR && plan.facecam?.src ? plan.facecam.src - 1 : -1;
// sumber suara (waktu acuan): multikamera "audio"; layar = "audio" atau rekaman layar
const AUDI = MC ? AUD : LAYAR ? (plan.audio ?? SCR + 1) - 1 : -1;
const SYNCED = MC || (LAYAR && FC >= 0);
const offOf = (i) => (SYNCED ? plan.sources[i]?.offset ?? 0 : 0);
const MEDIA = path.join(ENGINE, "scripts", "edit_media.py");
const SC = S.screen ?? {}, MT = S.montage ?? {};

// ---------------------------------------------------------------- 1. normalisasi + analisis
const ffFilters = (() => { try { return run("ffmpeg", ["-hide_banner", "-filters"]); } catch { return ""; } })();
const hasFilter = (f) => new RegExp(`\\s${f}\\s`).test(ffFilters);
const srcInfo = (i) => path.join(edir, `src${i + 1}.json`);
const srcNorm = (i) => path.join(edir, `src${i + 1}.mp4`);
const srcWav = (i) => path.join(edir, `src${i + 1}.wav`);

const normalize = (i) => {
  const src = path.join(paths.dir, plan.sources[i].file);
  if (!existsSync(src)) throw new Error(`Footage hilang: ${plan.sources[i].file}`);
  const st = statSync(src);
  const R = plan.sources[i].range; // klip dari proyek induk: hanya rentang [a, b] detik
  const isScr = i === SCR;
  const key0 = [src, st.size, st.mtimeMs, 2, ...(V916 ? [] : [CV.format]), ...(R ? [R] : []), ...(DIAR ? ["keep"] : []), ...(isScr ? ["layar"] : [])];
  const key = sha(key0);
  const info = readJson(srcInfo(i), {});
  if (info.key === key && existsSync(srcNorm(i)) && existsSync(srcWav(i))) return info;
  const pr = probeJson(src);
  const v = pr.streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`${plan.sources[i].file}: tidak ada video`);
  const rot = Math.abs(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0) % 180 === 90;
  const [w, h] = rot ? [v.height, v.width] : [v.width, v.height];
  const hdr = ["smpte2084", "arib-std-b67"].includes(v.color_transfer);
  // "vertical" = sumber sudah sebentuk kanvas (9:16: tinggi/lebar > 1,6; format lain: rasio selisih < 4%)
  const vertical = V916 ? h / w > 1.6 : Math.abs(w / h - ASP) / ASP < 0.04;
  // ukuran kerja: sebentuk kanvas -> ukuran kanvas (isi penuh); lainnya -> tinggi 1920 bila sumber >= 1440, selain itu 1080
  // podcast: sumber sebentuk kanvas yang lebih tajam dari kanvas disimpan tajam (maks 2160p) agar potongan dekat ke satu
  // orang dari rekaman lebar tetap jernih
  const keepRes = DIAR && vertical && h > CH;
  // rekaman layar (v0.10): resolusi asli (maks lebar 3840) tanpa dipotong, agar tulisan tetap tajam saat di-zoom
  const sw = Math.min(w, 3840), sh = Math.round((h * sw) / w);
  let outH = keepRes ? Math.min(h, 2160) - (Math.min(h, 2160) % 2) : vertical ? CH : h >= 1440 ? 1920 : 1080;
  let outW = keepRes ? Math.round((outH * ASP) / 2) * 2 : vertical ? CW : Math.round((w * outH) / h / 2) * 2;
  if (isScr) { outW = sw - (sw % 2); outH = sh - (sh % 2); }
  const pre = R ? ["-ss", String(R[0]), "-to", String(R[1])] : [];
  const vf = [];
  let hdrHow = "";
  if (hdr) {
    if (hasFilter("zscale")) {
      vf.push("zscale=t=linear:npl=100", "format=gbrpf32le", "zscale=p=bt709", "tonemap=hable:desat=0", "zscale=t=bt709:m=bt709:r=tv", "format=yuv420p");
      hdrHow = "zscale+tonemap";
    } else if (process.platform === "darwin" && hasFilter("scale_vt")) {
      pre.push("-hwaccel", "videotoolbox", "-hwaccel_output_format", "videotoolbox_vld");
      vf.push("scale_vt=color_matrix=bt709:color_primaries=bt709:color_transfer=bt709", "hwdownload", "format=p010le");
      hdrHow = "VideoToolbox";
    } else {
      console.warn(`! ${plan.sources[i].file} HDR, tetapi ffmpeg tanpa zscale/scale_vt: warna bisa pucat (ekspor SDR dari kamera, atau jalankan ulang setup)`);
      hdrHow = "tanpa tone mapping";
    }
  }
  vf.push(`fps=${FPS}`, vertical && !isScr ? `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}` : `scale=${outW}:${outH}`, "setsar=1", "format=yuv420p");
  process.stdout.write(`  normalisasi ${plan.sources[i].file} (${w}x${h}${hdr ? `, HDR -> SDR lewat ${hdrHow}` : ""}) ... `);
  run("ffmpeg", ["-v", "error", "-y", ...pre, "-i", src, "-map", "0:v:0", "-vf", vf.join(","), "-c:v", "libx264", "-preset", "veryfast", "-crf", isScr ? "12" : "14", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-an", srcNorm(i)]);
  // footage tanpa suara (rekaman layar bisu, klip montase): wav hening sepanjang videonya
  const hasAudio = pr.streams.some((x) => x.codec_type === "audio");
  if (hasAudio) run("ffmpeg", ["-v", "error", "-y", ...(R ? ["-ss", String(R[0]), "-to", String(R[1])] : []), "-i", src, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", srcWav(i)]);
  else run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", duration(srcNorm(i)).toFixed(3), "-c:a", "pcm_s16le", srcWav(i)]);
  console.log("OK");
  const out = { key, file: plan.sources[i].file, w: outW, h: outH, srcW: w, srcH: h, hdr, hdrHow, vertical: isScr ? false : vertical, ...(isScr ? { screen: true } : {}), audio: hasAudio, duration: duration(srcNorm(i)), ...(R ? { range: R } : {}) };
  writeFileSync(srcInfo(i), JSON.stringify(out, null, 2));
  return out;
};

const FILLER = new Set((pace.dropFillers ?? ["eh", "em", "emm", "anu", "hmm"]).map((x) => x.toLowerCase()));
const norm = (w) => normTokens(w).join("");
const glossary = Object.fromEntries(Object.entries(plan.glossary ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
/** Terapkan glosarium (koreksi salah dengar dari konteks), pertahankan tanda baca. */
const fix = (w) => {
  const m = w.match(/^([^\p{L}\p{N}]*)([\p{L}\p{N}][\p{L}\p{N}'-]*)([^\p{L}\p{N}]*)$/u);
  if (!m) return w;
  const g = glossary[m[2].toLowerCase()];
  return g ? m[1] + g + m[3] : w;
};

/** Label pembicara mentah (speaker_0, S1, ...) -> A, B, C, D menurut kemunculan pertama; label A-Z dibiarkan (proyek induk/sidecar). */
const relabel = (words) => {
  const map = new Map();
  for (const w of words) if (w.spk && !/^[A-Z]$/.test(w.spk) && !map.has(w.spk)) map.set(w.spk, null);
  const used = new Set(words.map((w) => w.spk).filter((x) => /^[A-Z]$/.test(x ?? "")));
  let k = 0;
  for (const raw of map.keys()) { while (used.has("ABCDEFGHIJKLMNOPQRSTUVWXYZ"[k])) k++; map.set(raw, "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[k]); used.add(map.get(raw)); }
  return words.map((w) => (w.spk && map.has(w.spk) ? { ...w, spk: map.get(w.spk) } : w));
};

/**
 * Pasangkan pembicara dengan tampilan kamera dari gerak mulut: skor = rata-rata gerak mulut di kursi itu saat pembicara bicara
 * dikurangi saat orang lain bicara. Kamera dekat (multikamera, satu wajah) dulu, lalu kursi di rekaman lebar.
 */
const assignViews = (analysisArr, wordsArr) => {
  const score = (i, j, id) => {
    const a = analysisArr[i], m = a?.seatMouth?.[j];
    if (!m?.length) return 0;
    const off = MC ? plan.sources[i].offset ?? 0 : 0;
    const ws = MC ? wordsArr[AUD] : wordsArr[i];
    let on = 0, nOn = 0, oth = 0, nOth = 0;
    for (const w of ws) {
      if (!w.spk) continue;
      for (let t = w.s; t < w.e; t += 0.1) {
        const k = Math.round((t - off) * a.fps);
        if (k < 0 || k >= m.length) continue;
        if (w.spk === id) (on += m[k]), nOn++;
        else (oth += m[k]), nOth++;
      }
    }
    return nOn ? on / nOn - (nOth ? oth / nOth : 0) : 0;
  };
  // pasangan terbaik (brute force, <= 4 pembicara): tiap slot paling banyak satu pembicara
  const best = (ids, slots) => {
    let top = { sum: -1e9, pick: [] };
    const rec = (k, used, sum, pick) => {
      if (k === ids.length) { if (sum > top.sum) top = { sum, pick: [...pick] }; return; }
      rec(k + 1, used, sum, [...pick, null]);
      slots.forEach((sl, q) => { if (!used.has(q)) { const sc = score(sl.i, sl.j, ids[k]); if (sc > 0.3) rec(k + 1, new Set([...used, q]), sum + sc, [...pick, { ...sl, sc }]); } });
    };
    rec(0, new Set(), 0, []);
    return top.pick;
  };
  const ids = plan.speakers.map((x) => x.id);
  const close = MC ? analysisArr.map((a, i) => ({ i, j: 0, n: a?.seats?.length ?? 0 })).filter((x) => x.n === 1) : [];
  const wideIdx = plan.wide ? plan.wide - 1 : analysisArr.map((a, i) => ({ i, n: a?.seats?.length ?? 0 })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n)[0]?.i;
  const pc = best(ids, close);
  const pw = wideIdx !== undefined ? best(ids, (analysisArr[wideIdx]?.seats ?? []).map((_, j) => ({ i: wideIdx, j }))) : [];
  plan.speakers.forEach((sp, k) => {
    sp.auto = { cam: pc[k] ? pc[k].i + 1 : null, wide: pw[k] ? wideIdx + 1 : null, seat: pw[k] ? pw[k].j + 1 : null,
      skor: { cam: pc[k] ? +pc[k].sc.toFixed(2) : null, seat: pw[k] ? +pw[k].sc.toFixed(2) : null } };
  });
};

const analyze = async () => {
  say("1/2 Normalisasi + transkrip + analisis footage");
  const { transcribe } = await import("./eleven.mjs");
  const infos = [];
  for (let i = 0; i < plan.sources.length; i++) {
    const info = normalize(i);
    const wf = path.join(edir, `src${i + 1}.words.json`);
    // transkrip sidecar (mis. dari editor lain / selftest): <footage>.words.json berisi [{w, s, e, spk?}] -> tanpa kredit
    const side = path.join(paths.dir, plan.sources[i].file).replace(/\.[^./]+$/, ".words.json");
    const from = plan.sources[i].from; // klip: transkrip diambil dari proyek induk (tanpa kredit)
    const wkey = DIAR || from ? sha([info.key, NSPK, from ?? null]) : info.key;
    if (!existsSync(wf) || readJson(wf, {}).key !== wkey) {
      // tanpa transkrip: kamera tambahan (multikamera / kamera wajah rekaman layar), voice over AI, montase musik
      const extraCam = (MC && i !== AUD) || (LAYAR && i !== AUDI) || VO || MUSIK;
      const viaSide = !from && existsSync(side);
      process.stdout.write(`  transkrip src${i + 1} (${extraCam ? (VO ? "voice over AI: kata dari npm run voice" : MUSIK ? "montase musik: tanpa narasi" : `kamera tambahan: suara memakai src${AUDI + 1}`) : from ? `dari proyek ${from.project}` : viaSide ? `file ${path.basename(side)}` : `Speech to Text ElevenLabs, ${(info.duration / 60).toFixed(1)} menit audio${DIAR ? `, ${NSPK} pembicara` : ""}`}) ... `);
      let words, diar = null;
      if (extraCam) words = [];
      else if (from) {
        const R = plan.sources[i].range;
        const pw = readJson(path.join(P(from.project).work, "edit", `src${from.src + 1}.words.json`), null);
        if (!pw) throw new Error(`Transkrip proyek induk ${from.project} tidak ada: jalankan npm run edit -- ${from.project} --analyze`);
        words = pw.words.filter((w) => w.s >= R[0] && w.e <= R[1]).map((w) => ({ ...w, s: +(w.s - R[0]).toFixed(3), e: +(w.e - R[0]).toFixed(3) }));
        diar = pw.diar ?? null;
      } else if (viaSide) words = readJson(side).map((w) => ({ w: w.w, s: w.s, e: w.e, p: w.p ?? 1, ...(w.spk ? { spk: String(w.spk) } : {}) }));
      else {
        // audio panjang dikirim terkompresi (unggah lebih cepat; ditagih per durasi, bukan ukuran)
        let f = srcWav(i);
        if (info.duration > 120) {
          f = srcWav(i).replace(/\.wav$/, ".stt.m4a");
          run("ffmpeg", ["-v", "error", "-y", "-i", srcWav(i), "-c:a", "aac", "-b:a", "64k", f]);
        }
        words = await transcribe(f, plan.language ?? "id", { diarize: DIAR, speakers: DIAR ? NSPK : undefined });
        if (DIAR && words.some((w) => w.spk)) diar = "scribe";
      }
      if (DIAR && words.length && words.some((w) => !w.spk)) {
        // cadangan lokal: sidik suara (resemblyzer) dikelompokkan jadi NSPK pembicara
        const tmp = path.join(edir, `src${i + 1}.diar.json`);
        writeFileSync(tmp, JSON.stringify(words));
        execFileSync(PY, [PODPY, "diarize", "--audio", srcWav(i), "--words", tmp, "--n", String(NSPK), "--out", tmp], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        words = readJson(tmp);
        diar = "lokal";
      }
      if (DIAR) words = relabel(words);
      writeFileSync(wf, JSON.stringify({ key: wkey, words, ...(diar ? { diar } : {}) }));
      console.log(`${words.length} kata${diar ? ` · pembicara: ${diar === "lokal" ? "dikenali lokal (resemblyzer)" : diar}` : ""}`);
    }
    const af = path.join(edir, `src${i + 1}.analysis.json`);
    const seatsN = DIAR ? NSPK : 0, centers = plan.sources[i].seatCenters ?? null;
    const akey = seatsN || centers ? sha([info.key, seatsN, centers]) : info.key;
    if (!existsSync(af) || readJson(af, {}).key !== akey) {
      process.stdout.write(`  analisis wajah/gerak/warna/suara src${i + 1} ... `);
      const r = JSON.parse(execFileSync(PY, [path.join(ENGINE, "scripts", "edit_analyze.py"), "--src", srcNorm(i), "--audio", srcWav(i), "--out", af,
        ...(i === SCR ? ["--fps", "2"] : info.duration > 900 ? ["--fps", "5"] : []), ...(seatsN ? ["--seats", String(seatsN)] : []), ...(centers ? ["--centers", JSON.stringify(centers)] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }));
      const a = readJson(af);
      writeFileSync(af, JSON.stringify({ key: akey, ...a }));
      console.log(`wajah ${Math.round(r.faceRate * 100)}% sampel${seatsN ? ` · ${r.seats.length} posisi orang` : ""}`);
    }
    // rekaman layar: bagian yang berubah per sampel (zoom otomatis, layar diam/loading); montase: mutu momen per klip
    const media = (kind, f, out, k) => {
      if (existsSync(out) && readJson(out, {}).key === k) return;
      process.stdout.write(`  ${kind === "activity" ? "aktivitas layar" : "momen terbaik"} ${path.basename(f)} ... `);
      const r = JSON.parse(execFileSync(PY, [MEDIA, kind, "--src", f, "--out", out], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }));
      writeFileSync(out, JSON.stringify({ key: k, ...readJson(out) }));
      console.log(kind === "activity" ? `${r.active}/${r.samples} sampel berubah${r.noise ? `, ${r.noise} sel derau diabaikan` : ""}` : "OK");
    };
    if (i === SCR) media("activity", srcNorm(i), path.join(edir, `src${i + 1}.activity.json`), info.key);
    if (MONTASE) media("moments", srcNorm(i), path.join(edir, `src${i + 1}.moments.json`), info.key);
    // lembar kontak (maks ±24 baris x 8 frame) untuk dilihat agent
    const sheet = path.join(pdir, `kontak-src${i + 1}.jpg`);
    mkdirSync(pdir, { recursive: true });
    const every = Math.max(2, Math.ceil(info.duration / 192));
    if (!existsSync(sheet) || statSync(sheet).mtimeMs < statSync(srcNorm(i)).mtimeMs)
      run("ffmpeg", ["-v", "error", "-y", "-i", srcNorm(i), "-vf", `fps=1/${every},scale=180:-2,tile=8x${Math.max(1, Math.ceil(info.duration / every / 8))}`, "-frames:v", "1", "-q:v", "4", sheet]);
    infos.push(info);
  }
  // B-roll (vlog bicara + B-roll): momen terbaik per klip untuk konteks
  for (const [k, b] of (plan.broll ?? []).entries()) {
    const f = path.join(paths.dir, b.file), out = path.join(edir, `broll${k + 1}.moments.json`);
    if (!existsSync(f)) throw new Error(`B-roll hilang: ${b.file}`);
    const st = statSync(f), key = sha([f, st.size, st.mtimeMs]);
    if (!existsSync(out) || readJson(out, {}).key !== key) {
      process.stdout.write(`  momen terbaik B-roll ${path.basename(f)} ... `);
      execFileSync(PY, [MEDIA, "moments", "--src", f, "--out", out], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 });
      writeFileSync(out, JSON.stringify({ key, ...readJson(out) }));
      console.log("OK");
    }
  }
  // multikamera / kamera wajah rekaman layar: geser waktu tiap kamera terhadap sumber suara (korelasi suara); disimpan di
  // edit.json, boleh dikoreksi. Waktu kamera = waktu suara - offset.
  if (SYNCED)
    for (let i = 0; i < plan.sources.length; i++) {
      if (i === AUDI) { delete plan.sources[i].offset; continue; }
      if (LAYAR && i !== SCR && i !== FC) continue;
      const src = plan.sources[i];
      if (src.offset !== undefined && !has("resync")) continue;
      if (infos[i].audio === false || infos[AUDI].audio === false) {
        Object.assign(src, { offset: 0, syncScore: 0 });
        console.log(`  ! src${i + 1}: ${infos[i].audio ? `src${AUDI + 1}` : "footage ini"} tanpa suara, sinkron otomatis tidak bisa: dianggap mulai bersamaan (isi "offset" manual bila perlu)`);
        continue;
      }
      const r = JSON.parse(execFileSync(PY, [PODPY, "sync", "--ref", srcWav(AUDI), "--other", srcWav(i)], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
      Object.assign(src, { offset: r.offset, syncScore: r.score });
      console.log(`  sinkron src${i + 1} ke suara src${AUDI + 1}: geser ${r.offset.toFixed(3)} dtk (keyakinan ${r.score})${r.score < 0.3 ? "  ! rendah: cek apakah rekaman dari sesi yang sama, atau isi offset manual" : ""}`);
    }
  const allWords = plan.sources.map((_, i) => readJson(path.join(edir, `src${i + 1}.words.json`)).words.map((w) => ({ ...w, w: fix(w.w) })));
  // kalimat: dari tanda baca Scribe, jeda > 0,6 dtk, 22 kata, atau pergantian pembicara
  const sentences = [];
  const major = (ws) => { const c = {}; for (const w of ws) if (w.spk) c[w.spk] = (c[w.spk] ?? 0) + (w.e - w.s); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; };
  plan.sources.forEach((_, i) => {
    const words = allWords[i];
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      sentences.push({ src: i, t: [+cur[0].s.toFixed(2), +cur.at(-1).e.toFixed(2)], text: cur.map((w) => w.w).join(" "), ...(DIAR ? { spk: major(cur) } : {}) });
      cur = [];
    };
    words.forEach((w) => {
      if (cur.length && (w.s - cur.at(-1).e > 0.6 || cur.length >= 22 || (DIAR && w.spk !== cur.at(-1).spk))) flush();
      cur.push(w);
      if (/[.!?]$/.test(w.w) || (/,$/.test(w.w) && cur.length >= 10)) flush();
    });
    flush();
  });
  // potongan sangat pendek (< 3 kata) digabung ke kalimat sebelumnya bila sambung (sumber & pembicara sama, jeda < 0,6 dtk)
  for (let k = sentences.length - 1; k > 0; k--) {
    const a = sentences[k], b = sentences[k - 1];
    if (a.src === b.src && a.spk === b.spk && a.text.split(/\s+/).length < 3 && a.t[0] - b.t[1] < 0.6 && !/[.!?]$/.test(b.text)) {
      b.t[1] = a.t[1];
      b.text += " " + a.text;
      sentences.splice(k, 1);
    }
  }
  // tandai ambil ulang: kalimat (pembicara sama) yang sangat mirip dengan 1-3 kalimat sesudahnya (yang terakhir biasanya yang benar)
  const toks = sentences.map((s) => new Set(normTokens(s.text)));
  sentences.forEach((s, k) => {
    s.flags = [];
    for (let j = k + 1; j <= k + 3 && j < sentences.length; j++) {
      if (sentences[j].spk !== s.spk) continue;
      const a = toks[k], b = toks[j];
      const inter = [...a].filter((x) => b.has(x)).length;
      if (a.size >= 3 && inter / Math.min(a.size, b.size) >= 0.6) s.flags.push(`mirip kalimat berikut (ambil ulang?)`);
    }
    const next = sentences[k + 1];
    if ((!next || next.src !== s.src) && !/[.!?]$/.test(s.text) && s.text.split(/\s+/).length < 4) s.flags.push("terpotong di akhir footage");
    const fillers = s.text.split(/\s+/).filter((w) => FILLER.has(norm(w))).length;
    if (fillers) s.flags.push(`${fillers} kata pengisi`);
  });
  // gabungkan dengan keputusan agent yang sudah ada (dicocokkan lewat src + waktu)
  const old = plan.sentences ?? [];
  plan.sentences = sentences.map((s, k) => {
    const prev = old.find((o) => o.src === s.src && Math.abs(o.t[0] - s.t[0]) < 0.3);
    return { id: prev?.id ?? `s${k + 1}`, src: s.src, t: s.t, text: s.text, ...(s.spk ? { spk: s.spk } : {}), ...(prev?.speaker ? { speaker: prev.speaker } : {}), flags: s.flags,
      keep: prev?.keep ?? !s.flags.some((f) => f.startsWith("mirip") || f.startsWith("terpotong")), intent: prev?.intent ?? null, mode: prev?.mode ?? "aroll",
      ...(prev?.punch ? { punch: prev.punch } : {}), ...(prev?.chapter ? { chapter: prev.chapter } : {}), objects: prev?.objects ?? [], why: prev?.why ?? "" };
  });
  // pembicara: daftar (nama diisi agent dari konteks/brief) + tampilan kamera otomatis
  const analysisArr = plan.sources.map((_, i) => readJson(path.join(edir, `src${i + 1}.analysis.json`)));
  const talk = {};
  if (DIAR) {
    for (const ws of allWords) for (const w of ws) if (w.spk) talk[w.spk] = (talk[w.spk] ?? 0) + (w.e - w.s);
    const found = Object.keys(talk).sort();
    const have = new Map(plan.speakers.map((x) => [x.id, x]));
    for (const id of found) if (!have.has(id)) have.set(id, { id, name: "", title: "" });
    plan.speakers = [...have.values()].sort((a, b) => a.id.localeCompare(b.id));
    if (found.length !== NSPK) console.log(`  ! terdeteksi ${found.length} pembicara (${found.join(", ")}), rencana ${NSPK}: periksa konteks.md`);
    assignViews(analysisArr, allWords);
  }
  writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n");
  // ringkasan konteks untuk agent
  const lines = [`# Konteks footage: ${name}`, "", `Style: **${plan.style}** · ${plan.sources.length} footage${DIAR ? ` · ${plan.speakers.length} pembicara` : ""}${MC ? ` · multikamera, suara dari src${AUD + 1}` : ""}`, ""];
  infos.forEach((inf, i) => {
    const a = analysisArr[i];
    const c = a.color, au = a.audio ?? {};
    lines.push(`## src${i + 1}: ${inf.file}`,
      `- ${inf.srcW}x${inf.srcH}${inf.vertical ? (V916 ? " vertikal" : ` sebentuk ${CV.format}`) : ` -> perlu dipotong ke ${CV.format} mengikuti wajah`} · ${inf.duration.toFixed(1)} dtk${inf.range ? ` (rentang ${inf.range[0]}-${inf.range[1]} dtk dari proyek induk)` : ""}${inf.hdr ? ` · HDR (${inf.hdrHow})` : ""}`,
      `- wajah terdeteksi ${Math.round(a.faceRate * 100)}% sampel${a.faceRate < 0.5 ? " (rendah: PiP/anotasi wajah dinonaktifkan otomatis)" : ""}`,
      ...(a.seats ? [`- posisi orang di frame: ${a.seats.length ? a.seats.map((x, j) => `kursi ${j + 1} (x ${Math.round(x.cx * 100)}%, wajah tampak ${Math.round(x.rate * 100)}%)`).join(" · ") : "tidak ada wajah terdeteksi"}`] : []),
      ...(MC ? [i === AUD ? "- sumber suara & transkrip (waktu acuan)" : `- kamera tambahan: geser ${plan.sources[i].offset?.toFixed(3)} dtk terhadap src${AUD + 1} (keyakinan ${plan.sources[i].syncScore ?? "manual"})`] : []),
      `- cahaya: luma p1 ${c.lumaP1} · p50 ${c.lumaP50} · p99 ${c.lumaP99} · saturasi ${c.sat} · putih Lab ${JSON.stringify(c.whiteLab)} · kulit [L, chroma, hue] ${JSON.stringify(c.skin)}`,
      `- suara: noise floor ${au.noiseFloorDb} dBFS, bicara ${au.speechDb} dBFS${au.noiseFloorDb > -50 ? " (berisik: pembersih noise aktif)" : ""}`,
      `- lembar kontak: edit/kontak-src${i + 1}.jpg`);
    if (i === SCR) {
      const act = readJson(path.join(edir, `src${i + 1}.activity.json`));
      const spans = [];
      act.cells.forEach((c, k) => {
        const on = c === "F" || c.length > 0, t = k / act.fps, last = spans.at(-1);
        if (on && last && t - last[1] <= 1.5) last[1] = t + 1 / act.fps;
        else if (on) spans.push([t, t + 1 / act.fps]);
      });
      lines.push(`- rekaman layar ${inf.w}x${inf.h}: layar berubah di ${spans.length ? spans.slice(0, 40).map(([a, b]) => `${a.toFixed(1)}-${b.toFixed(1)}`).join(", ") : "(tidak ada)"} dtk${spans.length > 40 ? " ..." : ""}`);
    }
    if (i === FC) lines.push(`- kamera wajah: tampil di pojok, geser ${plan.sources[i].offset?.toFixed(3) ?? 0} dtk terhadap suara src${AUDI + 1}`);
    if (MONTASE) {
      const m = readJson(path.join(edir, `src${i + 1}.moments.json`));
      lines.push(`- momen terbaik (tajam, stabil, bergerak): ${topWindows(m, inf.duration).map((w) => `${w.a.toFixed(1)}-${w.b.toFixed(1)} (${w.score})`).join(", ") || "tidak ada yang menonjol"}`);
    }
    lines.push("");
  });
  if ((plan.broll ?? []).length) {
    lines.push("## B-roll", "", "Pakai sebagai objek `clip` di kalimat: `{\"type\": \"clip\", \"file\": \"<file>\", \"from\": <detik>, \"at\": \"kata\", \"fit\": \"full\"}` (sisipan B-roll menutup A-roll, suara tetap).", "");
    plan.broll.forEach((b, k) => {
      const f = path.join(paths.dir, b.file), m = readJson(path.join(edir, `broll${k + 1}.moments.json`));
      lines.push(`- \`${b.file}\` · ${m.dur.toFixed(1)} dtk · momen terbaik: ${topWindows(m, m.dur).map((w) => `from ${w.a.toFixed(1)} (${w.score})`).join(", ") || "-"}`);
    });
    lines.push("");
  }
  if (LAYAR) lines.push("## Rekaman layar", "",
    `- Zoom otomatis ke bagian layar yang berubah di tiap kalimat; koreksi per kalimat: \`"zoom": [x, y, w, h]\` (0-1 bingkai layar) atau \`"zoom": "penuh"\`.`,
    `- Jeda antar-kalimat saat layar berubah (loading, ketikan panjang): ${(plan.idle ?? SC.idle?.mode ?? "cepat") === "cepat" ? "dipercepat dengan label" : plan.idle === "utuh" ? "dibiarkan utuh" : "dibuang"} (edit.json \`"idle"\`: cepat | buang | utuh; per kalimat \`"after"\`).`,
    ...(VO ? ["- Voice over AI: tiap scene naskah mendapat rentang layar otomatis (berurutan, bagian yang aktif); koreksi per kalimat dengan `\"screen\": [detikAwal, detikAkhir]` setelah npm run voice."] : []), "");
  if (MONTASE) lines.push("## Montase", "",
    `- ${MUSIK ? "Potongan mengikuti ketukan musik" : "Potongan 1,5-3 dtk per kalimat voice over"}; klip & momen dipilih otomatis lalu disimpan di edit.json \`montage.shots\` (src, from). Koreksi: ubah src/from lalu set \`"auto": false\`. Urutan klip: \`"order"\` = \`urut\` (kronologis, bawaan ${MT.order ?? "urut"}) atau \`selang\` (bergiliran antar-klip).`,
    MUSIK ? `- Musik: ${plan.music?.file ? `file pengguna ${plan.music.file}` : "npm run music -- <nama> --sec=<detik> --prompt=... --yes (ElevenLabs), atau tanpa itu musik sintetis"}; durasi target \`duration\` (bawaan ${MT.durationSec ?? 30} dtk). Judul opsional: \`"titles": [{"t": [a, b], "text": "..."}]\`.` : "- Batasi klip per kalimat: `\"clips\": [nomor footage]`.", "");
  if (DIAR) {
    lines.push(`## Pembicara`, "", "Isi `name` (+ `title`, mis. jabatan) di edit.json `speakers` dari brief/perkenalan di transkrip; nama tampil sebagai lower-third saat orang itu pertama kali muncul.",
      "Tampilan: kamera dekat (`cam`: nomor footage) > kursi di rekaman lebar (`seat`: nomor kursi, `wide`: nomor footage) > `box` [x, y, w, h] 0-1 manual. Kolom otomatis di bawah boleh ditimpa; koreksi pembicara satu kalimat dengan `\"speaker\": \"B\"`.", "",
      "| id | nama | bicara | kamera dekat (skor) | kursi rekaman lebar (skor) |", "|---|---|---|---|---|");
    for (const sp of plan.speakers) {
      const au = sp.auto ?? {};
      lines.push(`| ${sp.id} | ${sp.name || "(isi)"} | ${Math.round(talk[sp.id] ?? 0)} dtk | ${au.cam ? `src${au.cam} (${au.skor.cam})` : "-"} | ${au.seat ? `src${au.wide} kursi ${au.seat} (${au.skor.seat})` : "-"} |`);
    }
    if (plan.speakers.every((sp) => !sp.auto?.cam && !sp.auto?.seat)) lines.push("", "Tidak ada pasangan wajah-pembicara yang yakin (wajah tidak terdeteksi atau mulut tertutup): isi `cam`/`seat`/`box` manual dari lembar kontak.");
    lines.push("");
  }
  lines.push("## Kalimat", "", `| id | src | waktu |${DIAR ? " pembicara |" : ""} teks | tanda |`, `|---|---|---|${DIAR ? "---|" : ""}---|---|`);
  for (const s of plan.sentences) lines.push(`| ${s.id} | ${s.src + 1} | ${s.t[0].toFixed(1)}-${s.t[1].toFixed(1)} |${DIAR ? ` ${s.speaker ?? s.spk ?? "-"} |` : ""} ${s.text.replace(/\|/g, "/")} | ${s.flags.join("; ")} |`);
  writeFileSync(path.join(pdir, "konteks.md"), lines.join("\n") + "\n");
  const nextTip = VO ? `Tulis Projects/${name}/script.md (satu ## per langkah/kalimat), npm run voice -- ${name}, lalu: npm run edit -- ${name} --draft (kalimat v1.. + rentang layar otomatis "screenAuto" terisi di edit.json; koreksi "screen"/"zoom" bila perlu, lalu render)`
    : MUSIK ? `Lalu: npm run edit -- ${name} --draft (momen dipilih otomatis; periksa preview/board.png)`
    : `Isi keputusan per kalimat${DIAR ? " + nama pembicara" : ""} di edit.json, lalu: npm run edit -- ${name} --draft`;
  console.log(`\nKonteks: ${path.relative(ROOT, path.join(pdir, "konteks.md"))} (${VO || MUSIK ? `${plan.sources.length} footage` : `${plan.sentences.length} kalimat`}${DIAR ? `, ${plan.speakers.length} pembicara` : ""}). ${nextTip}`);
};

if (has("analyze") && has("estimate")) {
  // perkiraan kuota Speech to Text sebelum analisis (gratis): menit audio yang akan dikirim ke ElevenLabs
  let total = 0;
  plan.sources.forEach((src, i) => {
    const f = path.join(paths.dir, src.file);
    const side = f.replace(/\.[^./]+$/, ".words.json");
    const cached = existsSync(path.join(edir, `src${i + 1}.words.json`));
    const how = MC && i !== AUD ? "kamera tambahan (suara dari footage audio)" : src.from ? `dari proyek ${src.from.project}` : existsSync(side) ? "file transkrip sidecar" : cached ? "sudah ada (cache; dikirim ulang hanya bila footage/jumlah pembicara berubah)" : null;
    const d = src.range ? src.range[1] - src.range[0] : existsSync(f) ? duration(f) : 0;
    if (!how) total += d;
    console.log(`  src${i + 1} ${path.basename(src.file)} · ${(d / 60).toFixed(1)} mnt · ${how ?? `Speech to Text ElevenLabs${DIAR ? ` + ${NSPK} pembicara` : ""}`}`);
  });
  console.log(`\nPerkiraan Speech to Text: ${(total / 60).toFixed(1)} menit audio (kuota STT ElevenLabs dihitung per durasi; sisa paket: npm run akun).`);
  process.exit(0);
}
if (has("analyze")) {
  await analyze();
  process.exit(0);
}

// ---------------------------------------------------------------- 2. validasi rencana
const TYPES = ["keyword", "big", "chips", "annotate", "brackets", "doc", "chat", "prompt", "file", "card", "phone", "image", "clip"];
const infos = plan.sources.map((_, i) => readJson(srcInfo(i), null));
if (infos.some((x) => !x) || (!VO && !MUSIK && !plan.sentences?.length)) throw new Error(`Jalankan dulu: npm run edit -- ${name} --analyze`);
const fr = (t) => Math.round(t * FPS);
// voice over AI (v0.10): kalimat = scene naskah dari npm run voice; linimasa = linimasa suara (timing.json tidak ditimpa)
let VT = null;
const voWords = new Map();
if (VO) {
  VT = readJson(paths.timing, null);
  if (!VT || ["footage", "musik"].includes(VT.provider) || !existsSync(paths.voice))
    throw new Error(`Voice over belum ada: tulis Projects/${name}/script.md (satu ## per langkah) lalu npm run voice -- ${name}`);
  const old = plan.sentences ?? [];
  plan.sentences = VT.scenes.map((sc, k) => {
    const id = `v${k + 1}`, prev = old.find((o) => o.id === id);
    const words = (sc.words ?? []).map((w) => ({ w: w.w, s: (sc.startFrame + w.f) / FPS, e: (sc.startFrame + w.e) / FPS }));
    voWords.set(id, words);
    const t = [+(sc.startFrame / FPS).toFixed(2), +((sc.startFrame + sc.durationFrames) / FPS).toFixed(2)];
    const same = prev && prev.text === sc.text;
    return { id, src: LAYAR ? SCR : 0, t, text: sc.text, keep: true, intent: prev?.intent ?? null, mode: prev?.mode ?? "aroll",
      ...(same && prev.screen ? { screen: prev.screen } : {}), ...(same && prev.zoom !== undefined ? { zoom: prev.zoom } : {}), ...(prev?.clips ? { clips: prev.clips } : {}),
      ...(prev?.chapter ? { chapter: prev.chapter } : {}), objects: same ? prev.objects ?? [] : [], why: prev?.why ?? "" };
  });
  if (LAYAR) {
    const auto = screenRanges(readJson(path.join(edir, `src${SCR + 1}.activity.json`), null), infos[SCR].duration, plan.sentences.map((x) => ({ d: x.t[1] - x.t[0] })));
    plan.sentences.forEach((x, k) => { x.screenAuto = auto[k]; });
  }
  writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n");
}
const srcWords = plan.sources.map((_, i) => (readJson(path.join(edir, `src${i + 1}.words.json`), null)?.words ?? []).map((w) => ({ ...w, w: fix(w.w) })));
const analysis = plan.sources.map((_, i) => readJson(path.join(edir, `src${i + 1}.analysis.json`)));
let errors = 0;
let warns = 0;
const err = (m) => (errors++, console.log(`  ERROR  ${m}`));
const warn = (m) => (warns++, console.log(`  !      ${m}`));

say("2 Validasi rencana edit");
const kept = MUSIK ? [] : VO ? plan.sentences : plan.sentences.filter((s) => s.keep !== false);
if (!kept.length && !MUSIK) throw new Error("Semua kalimat dibuang (keep:false)");
const wordsOf = (s) => (VO ? voWords.get(s.id) ?? [] : srcWords[s.src].filter((w) => w.s >= s.t[0] - 0.05 && w.e <= s.t[1] + 0.05));
const spokenSet = (s) => new Set(wordsOf(s).flatMap((w) => normTokens(w.w)));
for (const s of kept) {
  if (!s.intent && !LAYAR && !MONTASE) warn(`${s.id}: maksud (intent) belum diisi`);
  if (s.zoom !== undefined && s.zoom !== "penuh" && s.zoom !== "auto" && !(Array.isArray(s.zoom) && s.zoom.length === 4 && s.zoom.every((v) => v >= 0 && v <= 1))) err(`${s.id}: zoom harus [x, y, w, h] 0-1, "penuh", atau "auto"`);
  if (s.screen && !(Array.isArray(s.screen) && s.screen.length === 2 && s.screen[0] >= 0 && s.screen[1] > s.screen[0] && s.screen[1] <= infos[SCR]?.duration + 0.5)) err(`${s.id}: screen harus [detikAwal, detikAkhir] di dalam rekaman layar (0-${infos[SCR]?.duration.toFixed(1)})`);
  if (s.after && !["cepat", "buang", "utuh"].includes(s.after)) err(`${s.id}: after harus cepat | buang | utuh`);
  if (s.clips && !(Array.isArray(s.clips) && s.clips.every((n) => n >= 1 && n <= plan.sources.length))) err(`${s.id}: clips harus daftar nomor footage 1-${plan.sources.length}`);
  if (!["aroll", "broll", "dim"].includes(s.mode ?? "aroll")) err(`${s.id}: mode "${s.mode}" tidak dikenal (aroll | broll | dim)`);
  const spoken = spokenSet(s);
  const words = wordsOf(s);
  const findWord = (ref) => {
    const r = typeof ref === "string" ? { word: ref, n: 1 } : ref;
    const t = norm(r.word);
    const hits = words.filter((w) => norm(w.w).startsWith(t) || (t.length > 3 && norm(w.w).includes(t)));
    return hits[(r.n ?? 1) - 1];
  };
  for (const [k, o] of (s.objects ?? []).entries()) {
    const tag = `${s.id} objek ${k + 1} (${o.type})`;
    if (!TYPES.includes(o.type)) { err(`${tag}: jenis tidak dikenal (${TYPES.join(", ")})`); continue; }
    const refs = [o.at, o.until, ...(o.items ?? []).map((x) => x.at), ...(o.rows ?? []).map((x) => x.at), ...(o.bubbles ?? []).map((x) => x.at)]
      .filter((x) => x !== undefined && x !== null && typeof x !== "number" && x !== "end" && x !== "start");
    for (const r of refs) if (!findWord(r)) err(`${tag}: kata "${typeof r === "string" ? r : r.word}" tidak diucapkan di kalimat ini`);
    // layar = ucapan: teks penekanan harus diucapkan (kicker/label UI boleh, diberi peringatan bila tidak)
    const must = [o.keyword, o.big, o.text && o.type === "big" ? o.text : null, ...(o.type === "chips" || o.type === "annotate" ? (o.items ?? []).map((x) => x.text) : [])].filter(Boolean);
    for (const t of must) {
      const miss = String(t).split(/\s+/).flatMap(normTokens).filter((x) => !spoken.has(x));
      if (miss.length && !o.label) err(`${tag}: "${t}" tidak diucapkan (${miss.join(", ")}); teks layar = kata yang diucapkan (atau beri "label": true)`);
    }
    if (o.type === "annotate" && (analysis[s.src].faceRate ?? 0) < 0.5) warn(`${tag}: wajah jarang terdeteksi, anotasi mungkin meleset`);
    if (o.type === "image" && !existsSync(path.resolve(paths.dir, o.file ?? ""))) err(`${tag}: gambar tidak ada: ${o.file}`);
    if (o.type === "clip") {
      if (!existsSync(path.resolve(paths.dir, o.file ?? ""))) err(`${tag}: klip tidak ada: ${o.file} (buat dengan npm run gen, atau taruh di assets/)`);
      if (o.fit && !["full", "card"].includes(o.fit)) err(`${tag}: fit harus full | card`);
    }
  }
}

// podcast: pembicara per kalimat ("speaker" dari agent > "spk" hasil analisis) + tampilan kamera per pembicara
const spkOf = (s) => (DIAR ? s.speaker ?? s.spk ?? plan.speakers[0]?.id : null);
const spById = new Map((plan.speakers ?? []).map((x) => [x.id, x]));
const seatsOf = (i) => analysis[i]?.seats ?? [];
if (DIAR) {
  for (const sp of plan.speakers) {
    if (!sp.name) warn(`pembicara ${sp.id}: nama belum diisi (lower-third tidak tampil)`);
    for (const k of ["cam", "wide", "boxSrc"]) if (sp[k] !== undefined && sp[k] !== null && !(sp[k] >= 1 && sp[k] <= plan.sources.length)) err(`pembicara ${sp.id}: ${k} ${sp[k]} bukan nomor footage (1-${plan.sources.length})`);
    if (sp.box && !(Array.isArray(sp.box) && sp.box.length === 4 && sp.box.every((v) => v >= 0 && v <= 1))) err(`pembicara ${sp.id}: box harus [x, y, w, h] bernilai 0-1`);
  }
  for (const s of kept) if (s.speaker && !spById.has(s.speaker)) err(`${s.id}: speaker "${s.speaker}" tidak ada di speakers`);
  if (MC) for (const [i, src] of plan.sources.entries()) if (i !== AUD && typeof src.offset !== "number") err(`src${i + 1}: offset multikamera belum ada (jalankan --analyze)`);
}
/** Tampilan per pembicara: {cam: indeks footage, seat?: indeks kursi, box?: [x,y,w,h]} | {cam: null} (bingkai bawaan). */
const viewOf = (id) => {
  const sp = spById.get(id);
  if (!sp) return null;
  const wideOf = (w) => (w ?? plan.wide ?? sp.auto?.wide ?? (MC ? AUD + 1 : 1)) - 1;
  let v = { cam: null };
  if (sp.box) v = { cam: wideOf(sp.boxSrc), box: sp.box };
  else if (sp.cam) v = { cam: sp.cam - 1 };
  else if (sp.seat) v = { cam: wideOf(sp.wide), seat: sp.seat - 1 };
  else if (sp.auto?.cam) v = { cam: sp.auto.cam - 1 };
  else if (sp.auto?.seat) v = { cam: sp.auto.wide - 1, seat: sp.auto.seat - 1 };
  if (v.seat !== undefined && v.seat >= seatsOf(v.cam).length) { err(`pembicara ${id}: kursi ${v.seat + 1} tidak ada di src${v.cam + 1} (${seatsOf(v.cam).length} kursi)`); v = { cam: null }; }
  return { ...v, spk: id };
};
const VIEWS = new Map(DIAR ? plan.speakers.map((sp) => [sp.id, viewOf(sp.id)]) : []);
for (const [id, v] of VIEWS) if (v.cam === null) warn(`pembicara ${id}: belum ada kamera/kursi (bingkai mengikuti wajah terbesar); isi cam/seat/box di edit.json bila perlu`);

// ---------------------------------------------------------------- 3. potong (rentang tiap kata) + peta waktu
const snap = (t) => Math.round(t * FPS) / FPS;
const maxGap = pace.maxGapSec ?? 0.15;
const keepGap = (pace.keepGapSec ?? [0.04, 0.08])[1];
// potongan: {src (sumber suara, -1 = tanpa), in, out (detik sumber suara; out-in = durasi tampil), outStart, cam, vin (detik
// video kamera)}; v0.10: vdur (detik video yang dipakai), speed (dipercepat/diperlambat), hold (frame terakhir ditahan), mute
const segs = [];
const wordMap = []; // per kalimat: {s, words: [{w, s, e}] di linimasa baru, start?, end?}
const speedLabels = []; // rekaman layar: bagian yang dipercepat
const units = []; // rekaman layar: unit zoom {f0, f1, t0, t1 (detik rekaman layar), s?}
let cursor = 0;
const order = kept;
// podcast: kamera selalu pada SATU orang (yang bicara); pindah bila giliran pembicara baru >= minTurnSec (sahutan pendek
// "iya", "betul" tidak memindah kamera) dan bidikan sekarang sudah >= minShotSec, atau giliran baru itu sendiri panjang
// (>= minShotSec: orang yang bicara lama selalu tampil, bidikan sebelumnya minimal minTurnSec)
const viewFor = new Map();
if (DIAR) {
  const minShot = pace.minShotSec ?? 2.5, minTurn = pace.minTurnSec ?? 1.0;
  let cur = null, held = 0;
  order.forEach((s, k) => {
    const want = VIEWS.get(spkOf(s)) ?? { cam: null, spk: spkOf(s) };
    let run = 0;
    for (let j = k; j < order.length && spkOf(order[j]) === want.spk; j++) run += order[j].t[1] - order[j].t[0];
    if (!cur || (want.spk !== cur.spk && run >= minTurn && (held >= minShot || (run >= minShot && held >= minTurn)))) { cur = want; held = 0; }
    viewFor.set(s, cur);
    held += s.t[1] - s.t[0];
  });
}
const turnGap = pace.sentenceGapSec ?? 0;
let camMiss = 0;
const IDLE = { minGapSec: 1.2, maxOutSec: 2.5, minSpeed: 2, maxSpeed: 12, ...(SC.idle ?? {}) };
const ACT = LAYAR ? readJson(path.join(edir, `src${SCR + 1}.activity.json`), null) : null;
let prevEnd = null; // rekaman layar: akhir kalimat sebelumnya {s, src, t} (detik sumber suara)
if (!VO && !MUSIK) for (const s of order) {
  const ws = wordsOf(s).filter((w) => !(FILLER.has(norm(w.w)) && s.keepFillers !== true));
  if (!ws.length) continue;
  const ranges = [];
  for (const w of ws) {
    const a = w.s - keepGap / 2;
    const b = w.e + keepGap / 2;
    if (ranges.length && a - ranges.at(-1)[1] <= maxGap) ranges.at(-1)[1] = b;
    else ranges.push([a, b]);
  }
  // jeda antar-kalimat alami (podcast): sisakan hening sebelum kalimat, maks sentenceGapSec
  if (turnGap > 0) {
    const all = srcWords[s.src], k0 = all.indexOf(ws[0]);
    const prevE = k0 > 0 ? all[k0 - 1].e : 0;
    ranges[0][0] -= Math.max(0, Math.min(turnGap, ws[0].s - keepGap / 2 - prevE - keepGap / 2));
  }
  // kamera kalimat ini: multikamera = footage lain pada waktu yang sama (digeser offset); rekaman layar = layar (suara dari
  // sumber suara); selain itu footage kalimat itu
  const vw = viewFor.get(s);
  let cam = s.src, seat = null, box = null;
  if (vw && vw.cam !== null && (MC || vw.cam === s.src)) ({ cam, seat = null, box = null } = vw);
  if (LAYAR) cam = SCR;
  const off = SYNCED ? offOf(cam) - offOf(s.src) : 0;
  // jeda napas khusus (punchline): "pause": detik
  if (s.pause) ranges.at(-1)[1] += s.pause;
  // rekaman layar: jeda antar-kalimat saat layar berubah (loading, ketikan panjang) dipercepat berlabel / utuh / dibuang
  if (LAYAR && prevEnd && prevEnd.src === s.src) {
    const g0 = prevEnd.t, g1 = snap(Math.max(0, ranges[0][0])), g = g1 - g0;
    const how = prevEnd.s.after ?? plan.idle ?? IDLE.mode ?? "cepat";
    if (g >= IDLE.minGapSec && how !== "buang") {
      const act = activityIn(ACT, g0 - off, g1 - off);
      if (how === "utuh") {
        segs.push({ src: s.src, in: g0, out: g1, outStart: cursor, cam, vin: +Math.max(0, g0 - off).toFixed(4), seat: null, box: null, vk: `jeda-${s.id}`, on: null });
        units.push({ f0: fr(cursor), f1: fr(cursor + g), t0: g0 - off, t1: g1 - off });
        cursor += g;
      } else if (act.active + act.full >= 2) {
        const sp0 = Math.min(IDLE.maxSpeed, Math.max(IDLE.minSpeed, g / IDLE.maxOutSec));
        const d = Math.max(2 / FPS, snap(g / sp0));
        segs.push({ src: s.src, in: g0, out: g0 + d, outStart: cursor, cam, vin: +Math.max(0, g0 - off).toFixed(4), vdur: +g.toFixed(4), speed: +(g / d).toFixed(4), mute: true, seat: null, box: null, vk: `cepat-${s.id}`, on: null });
        speedLabels.push({ f0: fr(cursor), f1: fr(cursor + d), x: Math.round(g / d) });
        units.push({ f0: fr(cursor), f1: fr(cursor + d), t0: g0 - off, t1: g1 - off });
        cursor += d;
      }
    }
  }
  const sentStart = cursor;
  const mapped = [];
  // rentang waktu master yang terekam kamera pilihan; di luarnya (kamera mulai belakangan / berhenti duluan) bagian itu
  // memakai kamera sumber suara, sisanya tetap kamera pilihan
  const lo = cam !== s.src && !LAYAR ? off : -Infinity, hi = cam !== s.src && !LAYAR ? off + infos[cam].duration - 0.05 : Infinity;
  for (const [a0, b0] of ranges) {
    const a = snap(Math.max(0, a0)), b = snap(Math.min(infos[s.src].duration, b0));
    if (b - a < 1 / FPS) continue;
    const parts = cam === s.src || (a >= lo && b <= hi) ? [[a, b, true]]
      : [[a, Math.min(b, snap(lo)), false], [Math.max(a, snap(lo)), Math.min(b, snap(hi)), true], [Math.max(a, snap(hi)), b, false]].filter(([x, y]) => y - x >= 1 / FPS);
    for (const [pa, pb, inCam] of parts) {
      const c = inCam ? cam : s.src, vin = inCam ? +Math.max(0, pa - off).toFixed(4) : pa, st = inCam ? seat : null, bx = inCam ? box : null;
      if (!inCam) camMiss++;
      const vk = JSON.stringify([c, st, bx]);
      const last = segs.at(-1);
      if (last && last.src === s.src && last.vk === vk && Math.abs(last.out - pa) < 1e-6) last.out = pb;
      else segs.push({ src: s.src, in: pa, out: pb, outStart: cursor + (pa - a), cam: c, vin, seat: st, box: bx, vk, on: inCam ? vw?.spk ?? null : null });
    }
    for (const w of ws) if (w.s >= a0 - 1e-6 && w.e <= b0 + 1e-6) mapped.push({ w: w.w, s: cursor + (w.s - a), e: cursor + (w.e - a) });
    cursor += b - a;
  }
  if (LAYAR && cursor > sentStart) units.push({ f0: fr(sentStart), f1: fr(cursor), t0: ranges[0][0] - off, t1: ranges.at(-1)[1] - off, s });
  prevEnd = { s, src: s.src, t: snap(Math.min(infos[s.src].duration, ranges.at(-1)[1])) };
  wordMap.push({ s, words: mapped });
}
if (camMiss) warn(`${camMiss} potongan di luar rekaman kamera pilihan (multikamera): memakai kamera sumber suara`);

// voice over AI (layar bisu / montase): linimasa = suara; layar per scene = rentang "screen" (otomatis "screenAuto"),
// diputar pas durasi scene (dipercepat bila panjang; bila pendek diperlambat sampai 0,75x lalu frame terakhir ditahan)
if (VO) {
  VT.scenes.forEach((sc, k) => {
    const s = plan.sentences[k], st = sc.startFrame / FPS, en = (sc.startFrame + sc.durationFrames) / FPS;
    wordMap.push({ s, words: voWords.get(s.id) ?? [], start: st, end: en });
    if (!LAYAR) return;
    const [a, b] = s.screen ?? s.screenAuto, d = en - st, len = Math.max(0.2, Math.min(infos[SCR].duration, b) - a);
    const speed = len / d >= 0.75 ? len / d : 0.75, used = Math.min(d, len / speed);
    segs.push({ src: -1, in: st, out: en, outStart: st, cam: SCR, vin: a, vdur: +len.toFixed(4), speed: +speed.toFixed(4), ...(d - used > 0.02 ? { hold: +(d - used).toFixed(3) } : {}), mute: true, seat: null, box: null, vk: s.id, on: null });
    if (speed >= 1.5) speedLabels.push({ f0: fr(st), f1: fr(st + used), x: Math.round(speed) });
    units.push({ f0: fr(st), f1: fr(en), t0: a, t1: a + len, s });
  });
  cursor = VT.totalFrames / FPS;
}

// musik dari file pengguna (edit.json "music": {file, start}) -> work/<nama>/music.wav 44,1 kHz (dipakai sound.py);
// tanpa file: work/<nama>/music.wav dari npm run music (ElevenLabs) bila ada, selain itu musik sintetis 100 BPM
const musicWav = path.join(paths.work, "music.wav");
if (plan.music?.file) {
  const f = path.join(paths.dir, plan.music.file);
  if (!existsSync(f)) throw new Error(`Musik hilang: ${plan.music.file}`);
  const st = statSync(f), mk = sha([f, st.size, st.mtimeMs, plan.music.start ?? 0]), mj = path.join(edir, "music.json");
  if (readJson(mj, {}).key !== mk || !existsSync(musicWav)) {
    mkdirSync(paths.work, { recursive: true });
    run("ffmpeg", ["-v", "error", "-y", ...(plan.music.start ? ["-ss", String(plan.music.start)] : []), "-i", f, "-vn", "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", musicWav]);
    writeFileSync(mj, JSON.stringify({ key: mk }));
  }
}
const beatsOf = () => {
  if (!existsSync(musicWav)) return null;
  const st = statSync(musicWav), bk = sha([st.size, st.mtimeMs]), bf = path.join(edir, "music.beats.json");
  if (readJson(bf, {}).key !== bk) {
    execFileSync(PY, [MEDIA, "beats", "--audio", musicWav, "--out", bf], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    writeFileSync(bf, JSON.stringify({ key: bk, ...readJson(bf) }));
  }
  return readJson(bf);
};

// montase: slot potongan (ketukan musik, atau 1,5-3 dtk per kalimat voice over) -> momen terbaik tiap klip; rencana
// disimpan di edit.json "montage" (dipilih ulang otomatis bila musik/naskah/footage berubah, kecuali "auto": false)
let montage = null;
if (MONTASE) {
  const bt = beatsOf();
  const srcsM = plan.sources.map((_, i) => ({ src: i, dur: infos[i].duration, m: readJson(path.join(edir, `src${i + 1}.moments.json`), null) }));
  let slots;
  if (MUSIK) {
    const [d0, d1] = plan.duration ?? [];
    slots = beatSlots(bt, { start: 0, targetSec: d0 ? (d0 + d1) / 2 : MT.durationSec ?? 30, beatsPerShot: MT.beatsPerShot ?? [2, 4], shotSec: MT.shotSec ?? [0.6, 3.5], introBeats: MT.introBeats ?? 4 });
    if (slots.length) slots[0].t0 = 0;
  } else slots = wordMap.flatMap(({ s, start, end }) => splitSlots(start, end, bt?.beats ?? [], MT.voShotSec ?? [1.5, 3]).map((x) => ({ ...x, sid: s.id, ...(s.clips ? { allow: s.clips.map((n) => n - 1) } : {}) })));
  if (!slots.length) throw new Error("Montase: tidak ada slot potongan (musik terlalu pendek?)");
  const mkey = sha([slots, srcsM.map((x) => [x.src, +x.dur.toFixed(2), infos[x.src].key]), plan.order ?? MT.order ?? "urut"]);
  const saved = plan.montage;
  if (saved?.shots?.length && (saved.auto === false || saved.key === mkey)) {
    if (saved.auto === false && saved.key !== mkey) warn(`montage.shots dikoreksi manual, tetapi ${MUSIK ? "musik" : "voice over"}/footage sudah berubah: periksa ulang (hapus "montage" agar dipilih ulang otomatis)`);
    montage = saved.shots;
  } else {
    const picks = pickMoments(slots, srcsM, { edge: MT.edgeSec ?? 0.3, order: plan.order ?? MT.order ?? "urut" });
    montage = slots.map((sl, k) => ({ t: [sl.t0, sl.t1], src: picks[k].src + 1, from: picks[k].from, ...(picks[k].hold ? { hold: picks[k].hold } : {}), score: picks[k].score, ...(sl.sid ? { sid: sl.sid } : {}) }));
    plan.montage = { auto: true, key: mkey, tempo: bt?.beats?.length >= 8 ? Math.round(bt.tempo) : "kisi 100 BPM", shots: montage };
    writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n");
  }
  if (MUSIK && montage[0]?.t?.[0] !== 0) err("montage.shots[0]: harus mulai di 0");
  montage.forEach((sh, k) => {
    if (!(sh.src >= 1 && sh.src <= plan.sources.length)) return err(`montage.shots[${k}]: src ${sh.src} bukan nomor footage (1-${plan.sources.length})`);
    if (!(Array.isArray(sh.t) && sh.t[1] > sh.t[0])) return err(`montage.shots[${k}]: t harus [awal, akhir]`);
    if (k && Math.abs(sh.t[0] - montage[k - 1].t[1]) > 0.02) err(`montage.shots[${k}]: tidak bersambung dengan potongan sebelumnya`);
    const i = sh.src - 1, d = sh.t[1] - sh.t[0], from = Math.max(0, Math.min(sh.from ?? 0, infos[i].duration - 0.1)), vdur = Math.min(d, infos[i].duration - from);
    segs.push({ src: -1, in: sh.t[0], out: sh.t[1], outStart: sh.t[0], cam: i, vin: from, vdur: +vdur.toFixed(4), ...(d - vdur > 0.02 ? { hold: +(d - vdur).toFixed(3) } : {}), mute: true, seat: null, box: null, vk: `m${k}`, on: null });
    if (MUSIK) wordMap.push({ s: { id: `k${k + 1}`, objects: [], mode: "aroll" }, words: [], start: sh.t[0], end: sh.t[1] });
  });
  if (MUSIK) cursor = montage.at(-1).t[1];
}
const total = cursor;
const totalFrames = VO ? VT.totalFrames : Math.round(total * FPS);
const rawDur = order.reduce((t, s) => t + (s.t[1] - s.t[0]), 0);
const nWords = wordMap.reduce((t, x) => t + x.words.length, 0);
if (MUSIK) console.log(`  montase ${segs.length} potongan mengikuti ketukan (${plan.montage?.tempo ?? "-"}${typeof plan.montage?.tempo === "number" ? " BPM" : ""}) · durasi ${total.toFixed(1)} dtk`);
else console.log(`  ${order.length} kalimat${VO ? " voice over" : ` dipakai dari ${plan.sentences.length}`} · ${segs.length} potongan${speedLabels.length ? ` (${speedLabels.length} dipercepat)` : ""} · durasi ${total.toFixed(1)} dtk · tempo ${(nWords / total).toFixed(2)} kata/dtk (target ${pace.targetWordsPerSec ?? "-"})`);
const [d0, d1] = plan.duration ?? pace.duration ?? [0, 1e9]; // klip pendek: edit.json "duration" (mis. [30, 60])
if (total < d0 || total > d1) warn(`durasi ${total.toFixed(0)} dtk di luar rentang ${d0}-${d1} dtk`);

// rekaman layar: kamera per unit (kalimat / bagian dipercepat) = kotak bagian layar yang berubah, dirangkai jadi keadaan
// tenang (zoomKeys); koreksi per kalimat "zoom": [x, y, w, h] | "penuh" | "auto"
let screenProps = null;
if (LAYAR) {
  const inf = infos[SCR];
  const same = Math.abs(inf.w / inf.h - ASP) / ASP < 0.12;
  // kanvas lebih sempit dari layar (9:16, 4:5, 1:1): layar tampil di area di bawah brand pojok dan di atas subtitle,
  // agar subtitle tidak menutup bagian yang sedang dikerjakan; zoom memakai rasio area itu
  const area = !same && ASP < inf.w / inf.h ? [0, CV.brand.top + CV.brand.h + 24, CW, SUB_Y0 - 24 - (CV.brand.top + CV.brand.h + 24)] : null;
  const Z = { srcW: inf.w, srcH: inf.h, cw: area ? area[2] : CW, ch: area ? area[3] : CH, maxZoom: SC.zoom?.max ?? 2, pad: SC.zoom?.pad ?? 0.08 };
  const autoZoom = (plan.zoom ?? SC.zoom?.auto ?? true) !== false;
  const zu = units.map((u) => {
    const z = u.s?.zoom;
    let box;
    if (Array.isArray(z)) box = zoomBox(z, { ...Z, pad: 0, fullFrac: 2 });
    else if (z === "penuh") box = [0, 0, 1, 1];
    else box = autoZoom ? zoomBox(activityIn(ACT, u.t0 - 0.5, u.t1).box, Z) : null;
    return { f0: u.f0, f1: u.f1, box };
  });
  screenProps = { w: inf.w, h: inf.h, ...(area ? { area } : {}), ease: Math.round((SC.zoom?.easeSec ?? 0.6) * FPS), bg: S.palette?.bg ?? "#0b0f14",
    keys: zoomKeys(zu, { holdF: Math.round((SC.zoom?.holdSec ?? 2) * FPS), keepWhenNull: !same }) };
}

// timing.json (kompatibel dengan QA, sound, posting): satu scene per kalimat (montase musik: per potongan, tanpa kata)
const LEAD = 0.12;
const scenes = wordMap.map(({ s, words, start, end }, k) => {
  const st = start ?? (k === 0 ? 0 : Math.max(wordMap[k - 1].words.at(-1)?.e ?? 0, words[0].s - LEAD));
  return { s, words, start: st, end: words.length ? words.at(-1).e : end ?? st + 1 };
});
// bab opsional (v0.8): kalimat ber-"chapter": "Judul"; bab pada kalimat yang dibuang pindah ke kalimat terpakai berikutnya
const chapterOf = new Map();
{ let pending = null; const used = new Set(wordMap.map((x) => x.s)); for (const s of plan.sentences) { if (s.chapter) pending = s.chapter; if (pending && used.has(s)) { chapterOf.set(s, pending); pending = null; } } }
const BAB = chapterOf.size ? plan.bab ?? "tanpa" : "tanpa";
const timing = VO ? VT : {
  fps: FPS, totalFrames, audio: `audio/${name}.wav`, provider: MUSIK ? "musik" : "footage", external: MUSIK ? "musik" : "footage", ...(MUSIK ? { noVoice: true } : {}), style: plan.style, ...(chapterOf.size ? { bab: BAB } : {}),
  scenes: scenes.map(({ s, words, start }, k) => {
    const sf = Math.round(start * FPS);
    const ef = k < scenes.length - 1 ? Math.round(scenes[k + 1].start * FPS) : totalFrames;
    return { index: k, id: s.id, text: words.map((w) => w.w).join(" "), style: "normal", startFrame: sf, durationFrames: Math.max(1, ef - sf), ...(chapterOf.has(s) ? { chapter: chapterOf.get(s) } : {}), ...(DIAR ? { spk: spkOf(s) } : {}),
      words: words.map((w) => ({ w: w.w, f: Math.round(w.s * FPS) - sf, e: Math.round(w.e * FPS) - sf })) };
  }),
};

// ---------------------------------------------------------------- 4. grading terkalibrasi per sumber
const G = S.grade?.targets ?? {};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
/** Rantai filter grading dari parameter: kurva (titik hitam/median/putih sumber -> keluaran), saturasi, WB, vignette. */
const buildChain = (q) => {
  const pts = [[0, Math.max(0, q.out[0] - q.src[0] * 0.6)], [q.src[0], q.out[0]], [q.src[1], q.out[1]], [q.src[2], q.out[2]], [1, Math.min(1, q.out[2] + (1 - q.src[2]) * 0.5 + 0.02)]];
  const curve = pts.filter((p, k) => k === 0 || p[0] > pts[k - 1][0] + 0.01).map(([x, y]) => `${x.toFixed(3)}/${clamp(y, 0, 1).toFixed(3)}`).join(" ");
  const parts = [`curves=all='${curve}'`, `eq=saturation=${q.sat.toFixed(3)}`];
  if (q.wb) parts.push(`colorchannelmixer=rr=${q.wb[0].toFixed(3)}:bb=${q.wb[1].toFixed(3)}`);
  if (q.vig) parts.push(`vignette=angle=${q.vig.toFixed(3)}`);
  return parts.join(",");
};
/**
 * Kalibrasi berulang per sumber: terapkan rantai ke frame contoh (bagian yang dipakai), ukur, koreksi titik kurva &
 * saturasi menuju target style (luma p1/p50/p99, chroma kulit), maks 4 putaran. Cahaya/kamera tiap footage berbeda,
 * jadi koreksinya juga berbeda, tapi hasil akhirnya seragam.
 */
const calibrate = (i) => {
  if (S.grade?.applyTo === "none") return { chain: "null", measured: null, iters: 0 };
  const c = analysis[i].color;
  const tb = G.lumaP1 ?? 0.075, tm = G.lumaP50 ?? 0.3, tw = G.lumaP99 ?? 0.64;
  const mine = segs.filter((s) => s.cam === i);
  if (!mine.length) return { chain: "null", measured: null, iters: 0 }; // footage tidak dipakai di potongan mana pun
  const all = mine.map((s) => s.vin + (s.out - s.in) / 2);
  const times = all.length <= 6 ? all : Array.from({ length: 6 }, (_, k) => all[Math.round((k * (all.length - 1)) / 5)]);
  const faces = times.map((t) => { const f = faceAt(i, t); return f ? [f[1], f[2], f[3], f[4]] : null; });
  const inf = infos[i];
  const cr = mine.length ? cropFor(mine[Math.floor(mine.length / 2)]) : null;
  const sb = clamp(c.lumaP1, 0, 0.2), sm = clamp(c.lumaP50, sb + 0.05, 0.85), sw = clamp(c.lumaP99, sm + 0.05, 1);
  const q = { src: [sb, sm, sw], out: [tb, tm, tw], sat: G.saturationScale ?? 0.72, wb: null, vig: G.vignette ? (Math.PI / 4) * clamp(G.vignette / 0.2, 0.3, 1.2) : 0 };
  const wl = c.whiteLab;
  if (wl && ["neutral", "warm"].includes(G.whiteBalance ?? "neutral") && (Math.abs(wl[1]) > 1.5 || Math.abs(wl[2] - 1.5) > 3))
    q.wb = [clamp(1 - wl[1] * 0.006 - wl[2] * 0.003, 0.92, 1.08), clamp(1 + (wl[2] - 1.5) * 0.007, 0.92, 1.08)];
  // "warm" (mis. Kilas): netralkan dulu, lalu hangatkan sedikit (merah naik, biru turun)
  if (G.whiteBalance === "warm") q.wb = [clamp((q.wb?.[0] ?? 1) * 1.03, 0.92, 1.1), clamp((q.wb?.[1] ?? 1) * 0.95, 0.88, 1.08)];
  const satTarget = (c.sat ?? 0.3) * (G.saturationScale ?? 0.72);
  let m = null;
  let it = 0;
  for (; it < 4; it++) {
    const a = ["--src", srcNorm(i), "--chain", buildChain(q), "--times", times.map((t) => t.toFixed(3)).join(","), "--faces", JSON.stringify(faces)];
    if (cr) a.push("--window", `${cr.x},${cr.w}`);
    m = JSON.parse(execFileSync(PY, [path.join(ENGINE, "scripts", "edit_grade.py"), ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    const eL = [tb - m.lumaP1, tm - m.lumaP50, tw - m.lumaP99];
    const skinOk = !G.skinChroma || !m.skinChroma || Math.abs(m.skinChroma - G.skinChroma) < 2.5;
    if (eL.every((e, k) => Math.abs(e) < [0.012, 0.015, 0.03][k]) && skinOk) break;
    q.out = q.out.map((o, k) => clamp(o + eL[k] * 0.9, k ? q.out[k - 1] + 0.03 : 0, 1));
    const sr = G.skinChroma && m.skinChroma ? G.skinChroma / Math.max(2, m.skinChroma) : satTarget / Math.max(0.02, m.sat);
    q.sat = clamp(q.sat * Math.pow(sr, 0.85), 0.4, 1.3);
  }
  return { chain: buildChain(q), measured: m, iters: it + 1 };
};

const cutKey = sha([segs, plan.sources, infos.map((x) => x.key), S.grade, analysis.map((a) => a.color), FPS, KIND, NARASI, FC, 4]);
const facecamFile = path.join(edir, "facecam.mp4");
const arollFile = path.join(edir, "aroll.mp4");
const voiceRaw = path.join(edir, "voice-raw.wav");
const from = opt("from");
const STEPS = ["cut", "sound", "preview", "render"];
const startAt = from ? STEPS.indexOf(from) : 0;
if (from && startAt < 0) throw new Error(`--from=${from} tidak dikenal (${STEPS.join(", ")})`);

/** Jendela potong sebentuk kanvas per potongan: mengikuti wajah (sumber tidak sebentuk kanvas). */
const faceAt = (i, t) => {
  const f = analysis[i].face;
  if (!f?.length) return null;
  const k = clamp(Math.round(t * analysis[i].fps), 0, f.length - 1);
  return f[k];
};
/** Wajah orang di kursi j footage i pada detik t (podcast). */
const seatAt = (i, j, t) => {
  const f = analysis[i].seatFace?.[j];
  if (!f?.length) return null;
  return f[clamp(Math.round(t * analysis[i].fps), 0, f.length - 1)];
};
/** Potongan dekat ke satu orang (kursi atau box manual) dari rekaman lebar; zoom maks ±2,4x (kanvas mendatar). */
const tightCrop = (seg) => {
  const inf = infos[seg.cam];
  const minH = inf.h * (LAND ? 0.42 : 0.9);
  let cx, cy, ch;
  if (seg.box) {
    const [x, y, w, h] = seg.box;
    cx = x + w / 2; cy = y + h / 2;
    ch = clamp(Math.max(h * inf.h, (w * inf.w) / ASP), minH, inf.h);
  } else {
    const fs = [];
    for (let t = seg.vin; t < seg.vin + (seg.out - seg.in); t += 0.2) { const f = seatAt(seg.cam, seg.seat, t); if (f) fs.push(f); }
    const st = seatsOf(seg.cam)[seg.seat];
    const med = (g, d) => (fs.length ? fs.map(g).sort((a, b) => a - b)[fs.length >> 1] : d);
    cx = med((f) => f[1] + f[3] / 2, st.cx); const fcy = med((f) => f[2] + f[4] / 2, st.cy), fh = med((f) => f[4], st.h || 0.2);
    ch = clamp(fh * inf.h * (LAND ? 3.4 : 2.6), minH, inf.h);
    cy = fcy + (ch / inf.h) * 0.1; // wajah di ±40% tinggi bingkai
  }
  let cw = ch * ASP;
  if (cw > inf.w) { cw = inf.w; ch = cw / ASP; }
  cw = Math.round(cw / 2) * 2; ch = Math.round(ch / 2) * 2;
  return { w: cw, h: ch, x: clamp(Math.round(cx * inf.w - cw / 2), 0, inf.w - cw), y: clamp(Math.round(cy * inf.h - ch / 2), 0, inf.h - ch), srcW: inf.w };
};
const cropFor = (seg) => {
  const inf = infos[seg.cam];
  if (inf.screen) return null; // rekaman layar: utuh, zoom diatur komposisi
  if (seg.box || (seg.seat !== null && seg.seat !== undefined)) return tightCrop(seg);
  if (inf.vertical) return null;
  const fs = [];
  for (let t = seg.vin; t < seg.vin + (seg.out - seg.in); t += 0.2) { const f = faceAt(seg.cam, t); if (f) fs.push(f); }
  const med = (g, d) => (fs.length ? fs.map(g).sort((a, b) => a - b)[fs.length >> 1] : d);
  if (inf.w / inf.h >= ASP) {
    // sumber lebih lebar dari kanvas: potong kiri-kanan, wajah di tengah
    const cw = Math.min(inf.w, Math.round((inf.h * ASP) / 2) * 2), cx = med((f) => f[1] + f[3] / 2, 0.5);
    return { w: cw, h: inf.h, x: clamp(Math.round(cx * inf.w - cw / 2), 0, inf.w - cw), y: 0, srcW: inf.w };
  }
  // sumber lebih tinggi dari kanvas (mis. vertikal -> 16:9): potong atas-bawah, wajah di ±40% tinggi
  const ch = Math.min(inf.h, Math.round(inf.w / ASP / 2) * 2), cy = med((f) => f[2] + f[4] / 2, 0.4);
  return { w: inf.w, h: ch, x: 0, y: clamp(Math.round(cy * inf.h - ch * 0.42), 0, inf.h - ch), srcW: inf.w };
};

if (errors) {
  console.log(`\n${errors} error di rencana edit; perbaiki edit.json lalu jalankan lagi.`);
  process.exit(1);
}

if (startAt <= 0 && (readJson(path.join(edir, "cut.json"), {}).key !== cutKey || !existsSync(arollFile) || (FC >= 0 && !existsSync(facecamFile)) || (MUSIK && !existsSync(paths.voice)))) {
  say(`3 Potong ${segs.length} bagian + grading terkalibrasi`);
  const cal = plan.sources.map((_, i) => calibrate(i));
  const chains = cal.map((x) => x.chain);
  cal.forEach((x, i) => console.log(`  grading src${i + 1} (${x.iters} putaran): ${x.chain}\n    terukur: luma ${x.measured?.lumaP1}/${x.measured?.lumaP50}/${x.measured?.lumaP99} · kulit chroma ${x.measured?.skinChroma} (target ${G.lumaP1}/${G.lumaP50}/${G.lumaP99} · ${G.skinChroma})`));
  // dikerjakan per kelompok 30 potongan (tiap potongan = input dengan seek akurat), lalu disambung tanpa encode ulang
  const parts = [];
  for (let g = 0; g < segs.length; g += 30) {
    const group = segs.slice(g, g + 30);
    // v0.10: vdur = detik video yang dipakai, speed = dipercepat/diperlambat, hold = frame terakhir ditahan (tpad)
    const vdOf = (s) => s.vdur ?? (s.out - s.in) * (s.speed ?? 1);
    const inV = group.flatMap((s) => ["-ss", Math.max(0, s.vin).toFixed(4), "-t", (vdOf(s) + (s.speed || s.hold ? 0.05 : 0)).toFixed(4), "-i", srcNorm(s.cam)]);
    const fc = group.map((s, k) => {
      const cr = cropFor(s), inf = infos[s.cam];
      const geo = cr ? `crop=${cr.w}:${cr.h}:${cr.x}:${cr.y},scale=${CW}:${CH},` : inf.screen ? "" : inf.w !== CW || inf.h !== CH ? `scale=${CW}:${CH},` : "";
      const pts = s.speed && s.speed !== 1 ? `setpts=(PTS-STARTPTS)/${s.speed},` : "";
      const pad = s.hold || s.speed ? `tpad=stop_mode=clone:stop_duration=${((s.hold ?? 0) + 0.2).toFixed(3)},` : "";
      return `[${k}:v]${geo}${chains[s.cam]},setsar=1,${pts}fps=${FPS},${pad}trim=end_frame=${Math.round((s.out - s.in) * FPS)},setpts=PTS-STARTPTS[v${k}]`;
    });
    fc.push(`${group.map((_, k) => `[v${k}]`).join("")}concat=n=${group.length}:v=1:a=0[v]`);
    const part = path.join(edir, `aroll-${g / 30}.mp4`);
    run("ffmpeg", ["-v", "error", "-y", ...inV, "-filter_complex", fc.join(";"), "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", LAYAR ? "12" : "14", "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", String(FPS), part]);
    parts.push(part);
    // kamera wajah (rekaman layar): potongan yang sama dari kamera wajah, persegi di sekitar wajah, 480x480
    if (FC >= 0) {
      const fi = infos[FC], fs = (analysis[FC].face ?? []).filter(Boolean);
      const med = (g, d) => (fs.length ? fs.map(g).sort((a, b) => a - b)[fs.length >> 1] : d);
      const side = Math.round(Math.min(fi.w, fi.h, Math.max(fi.h * 0.35, med((f) => f[4], 0.5) * fi.h * 2.2)) / 2) * 2;
      const cx = med((f) => f[1] + f[3] / 2, 0.5) * fi.w, cy = med((f) => f[2] + f[4] / 2, 0.45) * fi.h;
      const crop = `crop=${side}:${side}:${Math.round(clamp(cx - side / 2, 0, fi.w - side))}:${Math.round(clamp(cy - side * 0.45, 0, fi.h - side))},scale=480:480`;
      const shift = offOf(SCR) - offOf(FC);
      const inF = group.flatMap((s) => ["-ss", clamp(s.vin + shift, 0, Math.max(0, fi.duration - 0.2)).toFixed(4), "-t", (vdOf(s) + 0.05).toFixed(4), "-i", srcNorm(FC)]);
      const ff = group.map((s, k) => `[${k}:v]${crop},setsar=1,${s.speed && s.speed !== 1 ? `setpts=(PTS-STARTPTS)/${s.speed},` : ""}fps=${FPS},tpad=stop_mode=clone:stop_duration=${((s.hold ?? 0) + 0.3).toFixed(3)},trim=end_frame=${Math.round((s.out - s.in) * FPS)},setpts=PTS-STARTPTS[v${k}]`);
      ff.push(`${group.map((_, k) => `[v${k}]`).join("")}concat=n=${group.length}:v=1:a=0[v]`);
      run("ffmpeg", ["-v", "error", "-y", ...inF, "-filter_complex", ff.join(";"), "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), part.replace(/\.mp4$/, ".cam.mp4")]);
    }
    if (VO || MUSIK) continue; // suara dari voice over (npm run voice) / tanpa narasi
    // audio kelompok yang sama: potongan + fade 8 ms (tanpa klik); bagian bisu (dipercepat) = hening
    const inA = group.flatMap((s) => (s.mute || s.src < 0 ? ["-f", "lavfi", "-t", (s.out - s.in + 0.05).toFixed(4), "-i", "anullsrc=r=48000:cl=mono"] : ["-ss", s.in.toFixed(4), "-t", (s.out - s.in).toFixed(4), "-i", srcWav(s.src)]));
    const fa = group.map((s, k) => { const d = s.out - s.in; return `[${k}:a]atrim=0:${d.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=${Math.max(0, d - 0.008).toFixed(4)}:d=0.008,apad=whole_dur=${d.toFixed(4)}[a${k}]`; });
    fa.push(`${group.map((_, k) => `[a${k}]`).join("")}concat=n=${group.length}:v=0:a=1[a]`);
    run("ffmpeg", ["-v", "error", "-y", ...inA, "-filter_complex", fa.join(";"), "-map", "[a]", "-ar", "48000", "-ac", "1", part.replace(/\.mp4$/, ".wav")]);
  }
  const list = path.join(edir, "aroll.txt");
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", arollFile]);
  if (FC >= 0) {
    const clist = path.join(edir, "facecam.txt");
    writeFileSync(clist, parts.map((p) => `file '${p.replace(/\.mp4$/, ".cam.mp4")}'`).join("\n"));
    run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", clist, "-c", "copy", facecamFile]);
  }
  if (VO || MUSIK) {
    // voice over AI: suara = Projects/<nama>/voice.wav dari npm run voice; montase musik: narasi hening sepanjang video
    if (MUSIK) run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", (totalFrames / FPS).toFixed(3), "-c:a", "pcm_s16le", paths.voice]);
    const vd = duration(arollFile);
    console.log(`  A-roll ${vd.toFixed(2)} dtk · ${MUSIK ? "tanpa narasi (musik)" : `voice over ${duration(paths.voice).toFixed(2)} dtk`}`);
    if (Math.abs(vd - totalFrames / FPS) > 0.1) warn(`durasi A-roll ${vd.toFixed(2)} ≠ linimasa ${(totalFrames / FPS).toFixed(2)}`);
    writeFileSync(path.join(edir, "cut.json"), JSON.stringify({ key: cutKey, chains, calibration: cal.map((x) => x.measured) }, null, 2));
  } else {
  const alist = path.join(edir, "voice.txt");
  writeFileSync(alist, parts.map((p) => `file '${p.replace(/\.mp4$/, ".wav")}'`).join("\n"));
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", alist, "-c", "copy", voiceRaw]);
  // suara: bersihkan sesuai noise footage, de-ess, kompresi ringan, loudness linear ke target style (2 tahap)
  const floor = Math.max(...analysis.map((a) => a.audio?.noiseFloorDb ?? -70));
  const A = S.audio ?? {};
  const chain = ["highpass=f=80"];
  if (floor > -52) chain.push(`afftdn=nr=${floor > -40 ? 14 : 9}:nf=${clamp(Math.round(floor), -80, -20)}`);
  if ((A.voice ?? []).includes("deess")) chain.push("deesser=i=0.35");
  chain.push("acompressor=threshold=0.125:ratio=2.5:attack=8:release=120:makeup=1.4");
  const pre = chain.join(",");
  const meas = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${voiceRaw}" -af "${pre},loudnorm=I=${A.lufs ?? -15}:TP=${A.truePeak ?? -1.5}:LRA=7:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p'`], { encoding: "utf8" });
  const m = JSON.parse(meas);
  run("ffmpeg", ["-v", "error", "-y", "-i", voiceRaw, "-af", `${pre},loudnorm=I=${A.lufs ?? -15}:TP=${A.truePeak ?? -1.5}:LRA=7:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`, "-ar", "44100", "-ac", "1", paths.voice]);
  const vd = duration(arollFile), ad = duration(paths.voice);
  console.log(`  A-roll ${vd.toFixed(2)} dtk · suara ${ad.toFixed(2)} dtk (selisih ${Math.abs(vd - ad).toFixed(3)}) · pembersih noise ${floor > -52 ? "aktif" : "tidak perlu"} (floor ${floor} dBFS)`);
  if (Math.abs(vd - total) > 0.1) warn(`durasi A-roll ${vd.toFixed(2)} ≠ linimasa ${total.toFixed(2)}`);
  // ukur hasil grading terhadap target
  const gm = JSON.parse(execFileSync(PY, [path.join(ENGINE, "scripts", "edit_analyze.py"), "--src", arollFile, "--out", path.join(edir, "aroll.analysis.json"), "--fps", "2"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  writeFileSync(path.join(edir, "cut.json"), JSON.stringify({ key: cutKey, chains, calibration: cal.map((x) => x.measured), grade: gm.color }, null, 2));
  }
}
if (!VO) writeFileSync(paths.timing, JSON.stringify(timing, null, 2));

// ---------------------------------------------------------------- 5. data visual untuk komposisi Edit
const sceneOf = new Map(scenes.map((x) => [x.s.id, x]));
const resolveAt = (sid, ref, fallback) => {
  const x = sceneOf.get(sid);
  if (ref === undefined || ref === null || ref === "start") return fallback ?? fr(x.start);
  if (ref === "end") return fr(x.end);
  if (typeof ref === "number") return fr(x.start + ref);
  const r = typeof ref === "string" ? { word: ref, n: 1 } : ref;
  const t = norm(r.word);
  const hits = x.words.filter((w) => norm(w.w).startsWith(t) || (t.length > 3 && norm(w.w).includes(t)));
  const w = hits[(r.n ?? 1) - 1];
  return w ? fr(Math.max(x.start, w.s - LEAD)) : fr(x.start);
};
// wajah di linimasa baru (koordinat kanvas, setelah dipotong sebentuk kanvas), tiap 2 frame
const faceTrack = [];
const cropCache = new Map();
let segP = 0;
for (let f = 0; f < totalFrames; f += 2) {
  const t = f / FPS;
  while (segP < segs.length - 1 && t >= segs[segP].outStart + (segs[segP].out - segs[segP].in) - 1e-6) segP++;
  const seg = segs[segP];
  const st = seg.vin + Math.min((t - seg.outStart) * (seg.speed ?? 1), (seg.vdur ?? 1e9) - 0.05);
  const ff = LAYAR ? null : seg.box ? null : seg.seat !== null && seg.seat !== undefined ? seatAt(seg.cam, seg.seat, st) : faceAt(seg.cam, st);
  if (!ff) { faceTrack.push(null); continue; }
  const inf = infos[seg.cam];
  if (!cropCache.has(seg)) cropCache.set(seg, cropFor(seg));
  const cr = cropCache.get(seg);
  const X = (x) => (cr ? ((x * inf.w - cr.x) / cr.w) * CW : x * CW);
  const Y = (y) => (cr ? ((y * inf.h - cr.y) / cr.h) * CH : y * CH);
  const Wd = (w) => (cr ? ((w * inf.w) / cr.w) * CW : w * CW);
  const Hd = (h) => (cr ? ((h * inf.h) / cr.h) * CH : h * CH);
  faceTrack.push([Math.round(X(ff[1])), Math.round(Y(ff[2])), Math.round(Wd(ff[3])), Math.round(Hd(ff[4])), Math.round(X(ff[5])), Math.round(Y(ff[6])), Math.round(X(ff[7])), Math.round(Y(ff[8]))]);
}
const faceMid = (f0, f1) => {
  const xs = faceTrack.slice(Math.floor(f0 / 2), Math.ceil(f1 / 2) + 1).filter(Boolean);
  if (!xs.length) return null;
  const med = (k) => xs.map((x) => x[k]).sort((a, b) => a - b)[xs.length >> 1];
  return { x: med(0), y: med(1), w: med(2), h: med(3), cx: med(0) + med(2) / 2, cy: med(1) + med(3) / 2 };
};
// gerak tangan per sisi (sumber) dalam rentang waktu
const motionSide = (sid) => {
  const x = sceneOf.get(sid);
  const seg = segs.find((s) => x.start >= s.outStart - 1e-6 && x.start < s.outStart + (s.out - s.in));
  if (!seg) return 0;
  const m = analysis[seg.cam].motion;
  const t0 = Math.floor(seg.vin), t1 = Math.ceil(seg.vin + (x.end - x.start));
  let l = 0, r = 0;
  for (let t = t0; t <= t1 && t < m.sec.length; t++) for (let row = 2; row < m.rows; row++) { l += m.sec[t][row * m.cols] + m.sec[t][row * m.cols + 1]; r += m.sec[t][row * m.cols + 2] + m.sec[t][row * m.cols + 3]; }
  return l - r; // > 0: kiri lebih ramai
};

// potongan visual (punch-in): skala bergantian di tiap potongan, diperkuat pada kalimat ber-"punch": "strong"
const scales = S.aroll?.punchIn?.scales ?? [1, 1.18, 1.28];
const cuts = [];
segs.forEach((s, k) => {
  const f0 = fr(s.outStart), f1 = fr(s.outStart + (s.out - s.in));
  const sc = scenes.find((x) => s.outStart + 1e-6 >= x.start && s.outStart < x.end + 0.5);
  const punch = LAYAR || MONTASE ? "none" : sc?.s.punch ?? "auto";
  let scale = punch === "none" ? 1 : punch === "strong" ? scales[2] ?? 1.28 : scales[k % 2 ? 1 : 0] ?? 1;
  const fm = faceMid(f0, f1);
  // montase: Ken Burns pelan bergantian maju/mundur (style montage.kenBurns, mis. 1.06)
  const kb = MONTASE ? MT.kenBurns ?? 0 : 0;
  cuts.push({ f0, f1, scale, ox: fm ? fm.cx : CW / 2, oy: fm ? fm.cy : Math.round(CH * 0.4), ...(kb > 1 ? { zoom: k % 2 ? [kb, 1] : [1, kb] } : {}) });
});

// podcast: bidikan per orang yang tampil + nama (lower-third) saat pertama tampil di bidikan >= 2 dtk
const shots = [];
for (const sg of segs) {
  const f0 = fr(sg.outStart), f1 = fr(sg.outStart + (sg.out - sg.in)), last = shots.at(-1);
  if (last && last.on === sg.on && last.cam === sg.cam) last.f1 = f1;
  else shots.push({ f0, f1, on: sg.on, cam: sg.cam });
}
const names = [];
if (DIAR && S.names !== false && plan.names !== false) {
  const seen = new Set();
  for (const sh of shots) {
    if (!sh.on || seen.has(sh.on) || sh.f1 - sh.f0 < 60) continue;
    seen.add(sh.on);
    const sp = spById.get(sh.on);
    if (sp?.name && sp.lowerThird !== false) names.push({ f0: sh.f0 + 9, f1: Math.min(sh.f1 - 6, sh.f0 + 9 + 135), name: sp.name, title: sp.title ?? "" });
  }
}

// objek visual -> frame
const visuals = [];
const objects = [];
for (const { s, start, end } of scenes) {
  const f0 = fr(start), f1 = fr(end + 0.15);
  const mode = s.mode ?? "aroll";
  if (mode !== "aroll") visuals.push({ id: s.id, mode, f0, f1 });
  const fm = faceMid(f0, f1);
  const side = fm ? (fm.cx > CW / 2 + 20 ? "left" : fm.cx < CW / 2 - 20 ? "right" : motionSide(s.id) > 0 ? "right" : "left") : "left";
  (s.objects ?? []).forEach((o, k) => {
    const at = resolveAt(s.id, o.at, f0);
    const until = o.until ? resolveAt(s.id, o.until) : o.hold ? fr(start + o.hold) : f1;
    const sub = (arr) => (arr ?? []).map((x) => ({ ...x, at: resolveAt(s.id, x.at, at) }));
    // gambar milik proyek (assets/...) disalin ke public/ agar bisa disajikan ke komposisi
    let src = o.src;
    let end = Math.max(until, at + 12);
    if (o.type === "image" && o.file) {
      const dst = path.join(ENGINE, "public", "media", "edit", `${name}-${s.id}-${k}${path.extname(o.file)}`);
      mkdirSync(path.dirname(dst), { recursive: true });
      copyFileSync(path.resolve(paths.dir, o.file), dst);
      src = `media/edit/${path.basename(dst)}`;
    }
    // klip (mis. B-roll AI dari npm run gen): diseragamkan 30 fps tanpa suara; full = seukuran kanvas (cover), card = lebar 832 (lebar: 760)
    if (o.type === "clip" && o.file) {
      const srcFile = path.resolve(paths.dir, o.file);
      const dst = path.join(ENGINE, "public", "media", "edit", `${name}-${s.id}-${k}.mp4`);
      mkdirSync(path.dirname(dst), { recursive: true });
      const vf = (o.fit ?? "full") === "full" ? `scale=${CW}:${CH}:force_original_aspect_ratio=increase,crop=${CW}:${CH}` : `scale=${LAND ? 760 : 832}:-2`;
      run("ffmpeg", ["-v", "error", "-y", "-ss", String(o.from ?? 0), "-i", srcFile, "-an", "-vf", `${vf},fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-crf", "16", "-preset", "veryfast", dst]);
      src = `media/edit/${path.basename(dst)}`;
      const len = Math.floor(duration(dst) * FPS);
      if (end - at > len) {
        warn(`${s.id}: klip ${o.file} hanya ${(len / FPS).toFixed(1)} dtk, tampil dipendekkan dari ${((end - at) / FPS).toFixed(1)} dtk`);
        end = at + len;
      }
    }
    objects.push({ ...o, ...(src ? { src } : {}), sid: s.id, mode, k, at, until: end, side: o.side ?? side, face: fm,
      ...(o.items ? { items: sub(o.items) } : {}), ...(o.rows ? { rows: sub(o.rows) } : {}), ...(o.bubbles ? { bubbles: sub(o.bubbles) } : {}),
      ...(o.titleAt ? { titleAt: resolveAt(s.id, o.titleAt, at) } : {}) });
  });
}
// subtitle karaoke: potongan 2-5 kata, putus di tanda baca / jeda
const [cw0, cw1] = S.type?.subtitle?.wordsPerChunk ?? [2, 5];
const subs = [];
for (const { words } of scenes) {
  let cur = [];
  const flush = () => { if (cur.length) subs.push({ f0: fr(cur[0].s), f1: fr(cur.at(-1).e + 0.1), words: cur.map((w) => ({ w: w.w, f0: fr(w.s), f1: fr(w.e) })) }); cur = []; };
  words.forEach((w) => {
    const len = cur.map((x) => x.w).join(" ").length + w.w.length;
    if (cur.length >= cw1 || (cur.length >= cw0 && len > (LAND ? 40 : 26)) || (cur.length && w.s - cur.at(-1).e > 0.35)) flush();
    cur.push(w);
    if (/[.!?,]$/.test(w.w) && cur.length >= cw0) flush();
  });
  flush();
}
subs.forEach((c, k) => { if (subs[k + 1]) c.f1 = Math.min(c.f1, subs[k + 1].f0); });
// subtitle ditanam atau tidak: edit.json "subtitle" > style type.subtitle.burn (episode podcast: SRT saja)
if ((plan.subtitle ?? S.type?.subtitle?.burn ?? true) === false) subs.length = 0;

// judul montase opsional: edit.json "titles": [{"t": [a, b], "text": "..."}]
const texts = (plan.titles ?? []).map((x, k) => {
  if (!(Array.isArray(x.t) && x.t[1] > x.t[0] && x.text)) { err(`titles[${k}]: butuh "t": [awal, akhir] dan "text"`); return null; }
  return { f0: fr(x.t[0]), f1: Math.min(totalFrames, fr(x.t[1])), text: String(x.text) };
}).filter(Boolean);
const FC_SIZE = S.facecam?.size;
const editProps = {
  video: `media/edit/${name}.mp4`, totalFrames, cuts, face: faceTrack, visuals, objects, subs, names, shots: shots.map(({ f0, f1, on, cam }) => ({ f0, f1, on, cam })),
  ...(screenProps ? { screen: screenProps } : {}), ...(speedLabels.length ? { speedLabels } : {}), ...(texts.length ? { texts } : {}),
  ...(FC >= 0 && plan.facecam?.show !== false ? { facecam: { src: `media/edit/${name}-cam.mp4`, ...(plan.facecam?.size ?? FC_SIZE ? { size: plan.facecam?.size ?? FC_SIZE } : {}), ...(S.facecam?.ring ? { ring: S.facecam.ring } : {}) } } : {}),
  canvas: { format: CV.format, w: CW, h: CH, safe: CV.safe, ui: CV.ui, brand: CV.brand, subY: SUB_Y0 },
  bab: BAB, chapters: scenes.filter((x) => chapterOf.has(x.s)).map((x) => ({ f0: fr(x.start), title: chapterOf.get(x.s) })),
  style: { palette: S.palette, type: S.type, broll: S.broll, aroll: S.aroll },
  brand: plan.brand ?? {},
};
writeFileSync(path.join(edir, "props.json"), JSON.stringify(editProps));

// storyboard (untuk sound.py & QA): tanpa musik (style), pop halus saat objek muncul bila style mengizinkan
const pop = S.audio?.sfx?.objectPop;
const board = {
  composition: "Edit", style: plan.style, ...(V916 ? {} : { format: CV.format }), brand: plan.brand ?? {},
  scenes: scenes.map(({ s }) => ({ music: MUSIK ? "full" : plan.music || (MONTASE && VO) || S.audio?.music ? "pad" : "off",
    sfx: pop ? (s.objects ?? []).filter((o) => typeof o.at === "string" || o.at?.word).slice(0, 3).map((o) => ({ cue: typeof o.at === "string" ? o.at : o.at.word, type: "pop", gain: 0.5 })) : [] })),
};
writeFileSync(paths.storyboard, JSON.stringify(board, null, 2));

// ---------------------------------------------------------------- 6. cek rencana terhadap style
say("4 Cek ritme & porsi style");
const brollF = visuals.filter((v) => v.mode === "broll").reduce((t, v) => t + (v.f1 - v.f0), 0);
const share = brollF / totalFrames;
const [b0, b1] = S.broll?.share ?? [0, 1];
console.log(`  B-roll ${Math.round(share * 100)}% (style ${Math.round(b0 * 100)}-${Math.round(b1 * 100)}%) · ${cuts.length} potongan · ${objects.length} objek visual`);
if (share < b0 - 0.05 || share > b1 + 0.05) warn(`porsi B-roll ${Math.round(share * 100)}% di luar style`);
const [l0, l1] = S.broll?.lengthSec ?? [0, 99];
for (const v of visuals.filter((x) => x.mode === "broll")) {
  const d = (v.f1 - v.f0) / FPS;
  if (d < l0 - 0.3 || d > l1 + 0.5) warn(`${v.id}: B-roll ${d.toFixed(1)} dtk (style ${l0}-${l1})`);
}
// layar diam: rentang > 2 dtk tanpa potongan, objek baru, atau pergantian visual
const typing = objects.filter((o) => o.type === "prompt").flatMap((o) => Array.from({ length: Math.max(0, Math.floor((o.until - o.at) / FPS)) }, (_, i) => o.at + i * FPS));
const events = [...typing, ...cuts.map((c) => c.f0), ...objects.map((o) => o.at), ...objects.filter((o) => o.type === "clip").flatMap((o) => Array.from({ length: Math.floor((o.until - o.at) / FPS) }, (_, i) => o.at + (i + 1) * FPS)), ...objects.flatMap((o) => [...(o.items ?? []), ...(o.rows ?? []), ...(o.bubbles ?? [])].map((x) => x.at)), ...visuals.map((v) => v.f0)].sort((a, b) => a - b);
let lastEv = 0;
const still = pace.maxStillSec ?? 2.2;
const zoomEv = (screenProps?.keys ?? []).map((k) => k.f0), speedEv = speedLabels.flatMap((x) => Array.from({ length: Math.max(1, Math.floor((x.f1 - x.f0) / FPS)) }, (_, i) => x.f0 + i * FPS));
for (const e of [...events, ...shots.map((x) => x.f0), ...zoomEv, ...speedEv, totalFrames].sort((a, b) => a - b)) { if (e - lastEv > still * FPS) warn(`layar tanpa perubahan ${((e - lastEv) / FPS).toFixed(1)} dtk (${(lastEv / FPS).toFixed(1)}-${(e / FPS).toFixed(1)})`); lastEv = Math.max(lastEv, e); }

// ---------------------------------------------------------------- 7. audio (SFX) -> mix
if (startAt <= 1) {
  say("5 Audio (suara bersih + SFX style)");
  const r = spawnSync(path.join(ENGINE, ".venv", "bin", "python"), [path.join(ENGINE, "scripts", "sound.py"), name], { cwd: ENGINE, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`sound.py gagal: ${(r.stderr || r.stdout).split("\n").filter(Boolean).slice(-3).join(" | ")}`);
  console.log("  " + r.stdout.trim().split("\n").at(-1));
}

// ---------------------------------------------------------------- 8. preview / render (Remotion, komposisi Edit)
const { bundle } = await import("@remotion/bundler");
const { ensureBrowser, renderMedia, renderStill, selectComposition } = await import("@remotion/renderer");
mkdirSync(path.join(ENGINE, "public", "media", "edit"), { recursive: true });
mkdirSync(path.join(ENGINE, "public", "audio"), { recursive: true });
copyFileSync(arollFile, path.join(ENGINE, "public", "media", "edit", `${name}.mp4`));
if (FC >= 0) copyFileSync(facecamFile, path.join(ENGINE, "public", "media", "edit", `${name}-cam.mp4`));
const mixSrc = existsSync(paths.mix) && statSync(paths.mix).mtimeMs >= statSync(paths.voice).mtimeMs ? paths.mix : paths.voice;
copyFileSync(mixSrc, path.join(ENGINE, "public", "audio", `${name}.wav`));
await ensureBrowser();
process.stdout.write("\nBundling ... ");
const serveUrl = await bundle({ entryPoint: path.join(ENGINE, "src", "index.ts"), publicDir: path.join(ENGINE, "public") });
console.log("OK");
const draft = has("draft");
const inputBase = { name, timing, edit: editProps, brand: plan.brand ?? {} };

if (startAt <= 2) {
  say("6 Preview tiap kalimat + cek tata letak + objek vs wajah");
  const inputProps = { ...inputBase, layoutCheck: true };
  const composition = await selectComposition({ serveUrl, id: "Edit", inputProps });
  mkdirSync(paths.preview, { recursive: true });
  const layout = [];
  const shots = [];
  for (const { s, start, end } of scenes) {
    // frame saat objek terakhir kalimat ini sudah muncul (atau tengah kalimat)
    const objs = objects.filter((o) => o.sid === s.id);
    const lastAt = Math.max(fr(start + (end - start) * 0.6), ...objs.map((o) => Math.max(o.at, ...[...(o.items ?? []), ...(o.rows ?? []), ...(o.bubbles ?? [])].map((x) => x.at))) .map((x) => x + 10));
    const frame = Math.max(0, Math.min(lastAt, fr(end) - 1, totalFrames - 1));
    const out = path.join(paths.preview, `scene-${String(shots.length + 1).padStart(2, "0")}.png`);
    let rep = null, ed = null;
    await renderStill({ composition, serveUrl, inputProps, frame, output: out, onBrowserLog: (l) => {
      const m = l.text.match(/^LAYOUT_PROBE (.*)$/s); if (m) rep = JSON.parse(m[1]);
      const e = l.text.match(/^EDIT_PROBE (.*)$/s); if (e) ed = JSON.parse(e[1]);
    } });
    if (rep) {
      // objek (bukan subtitle) tidak boleh menutup wajah di A-roll
      if (ed?.face && ed.mode === "aroll") {
        const fa = ed.face;
        for (const b of ed.boxes) {
          const ix = Math.max(0, Math.min(b.x + b.w, fa.x + fa.w) - Math.max(b.x, fa.x)), iy = Math.max(0, Math.min(b.y + b.h, fa.y + fa.h) - Math.max(b.y, fa.y));
          if (ix * iy > 0.12 * fa.w * fa.h) rep.errors.push(`objek "${b.label}" menutup wajah (${Math.round((ix * iy * 100) / (fa.w * fa.h))}%)`);
        }
      }
      // objek tidak boleh masuk zona subtitle saat subtitle tampil
      const zy0 = SUB_Y0;
      if (ed?.sub) for (const b of ed.boxes) if (b.y + b.h > zy0 + 10 && b.label !== "phone") rep.errors.push(`objek "${b.label}" menabrak zona subtitle (bawah y ${Math.round(b.y + b.h)} > ${zy0})`);
      layout.push({ label: `${s.id} (${(frame / FPS).toFixed(1)} dtk)`, frame, ...rep });
    }
    shots.push(`${s.id}=${out}`);
  }
  const { errors: le } = writeLayout(paths.preview, layout);
  // papan ringkas semua preview
  execFileSync(PY, [path.join(ENGINE, "scripts", "board_png.py"), path.join(paths.preview, "board.png"), ...shots.slice(0, MONTASE ? 48 : 24)]);
  console.log(`Preview: ${path.relative(ROOT, paths.preview)}/scene-NN.png + board.png`);
  if (le) errors += le;
}

if (draft || errors) {
  console.log(errors ? `\n${errors} error: perbaiki lalu jalankan lagi.` : `\nDraft selesai (${warns} peringatan). Periksa preview/board.png, lalu: npm run edit -- ${name}`);
  process.exit(errors ? 1 : 0);
}

if (startAt <= 3) {
  say("7 Render akhir");
  const inputProps = { ...inputBase, layoutCheck: false };
  const composition = await selectComposition({ serveUrl, id: "Edit", inputProps });
  const e = encodeFor(name);
  mkdirSync(paths.resultDir, { recursive: true });
  archiveResult(name);
  let last = -1;
  // Memori: A-roll + klip B-roll didekode compositor (OffthreadVideo). Cache bawaan Remotion bisa memakan separuh RAM dan
  // tiap tab Chromium ±300-500 MB, jadi di mesin kecil (< 7 GB, mis. VPS 4 GB) konkurensi & cache dibatasi agar tidak SIGKILL.
  const memGB = os.totalmem() / 2 ** 30;
  const memOpts = { offthreadVideoCacheSizeInBytes: Math.round(Math.min(1024, (memGB * 1024) / 8)) * 2 ** 20,
    ...(memGB < 7 ? { concurrency: memGB < 5 ? 1 : 2 } : {}) };
  await renderMedia({ composition, serveUrl, inputProps, ...memOpts, codec: "h264", crf: e.crf, x264Preset: e.preset,
    ...(e.maxrate ? { encodingMaxRate: String(e.maxrate), encodingBufferSize: String(e.bufsize) } : {}),
    pixelFormat: "yuv420p", audioCodec: "aac", audioBitrate: String(e.audioBitrate), outputLocation: paths.result,
    onProgress: ({ progress }) => { const p = Math.floor(progress * 10) * 10; if (p !== last) { last = p; process.stdout.write(`\rRender ${p}%`); } } });
  console.log(`\nSelesai: ${path.relative(ROOT, paths.result)} (${(totalFrames / FPS).toFixed(1)} dtk)`);
  // grading tercapai? (diukur pada A-roll sebelum grafis)
  const gm = (readJson(path.join(edir, "cut.json"), {}).calibration ?? [])[0];
  if (gm && G.lumaP50) {
    const d = (a, b) => Math.abs(a - b).toFixed(3);
    console.log(`  grading: luma p1 ${gm.lumaP1} (target ${G.lumaP1}, selisih ${d(gm.lumaP1, G.lumaP1)}) · p50 ${gm.lumaP50} (${G.lumaP50}) · p99 ${gm.lumaP99} (${G.lumaP99}) · kulit chroma ${gm.skinChroma} (target ${G.skinChroma})`);
    if (Math.abs(gm.lumaP50 - G.lumaP50) > 0.08 || Math.abs(gm.lumaP1 - G.lumaP1) > 0.05) warn("grading belum mencapai target luma (cek footage sangat gelap/terang)");
  }
  const qa = spawnSync("npm", ["run", "-s", "qa", "--", name], { cwd: ENGINE, encoding: "utf8" });
  qa.stdout.split("\n").filter((l) => /GAGAL|pengecekan|lolos/.test(l)).forEach((l) => console.log(`  QA ${l.trim()}`));
  if (existsSync(path.join(paths.dir, "posting", "caption.md"))) {
    const po = spawnSync("npm", ["run", "-s", "posting", "--", name], { cwd: ENGINE, encoding: "utf8" });
    po.stdout.split("\n").filter((l) => /OK|GAGAL|Hasil siap/.test(l)).forEach((l) => console.log(`  POST ${l.trim()}`));
  } else console.log("  POST dilewati: tulis Projects/<nama>/posting/caption.md (+ thumbnail.json) lalu npm run posting");
  console.log(`\n${warns} peringatan.`);
}
