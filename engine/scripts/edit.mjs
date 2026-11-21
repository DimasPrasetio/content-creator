// Mesin edit footage berbasis STYLE (bukan brand): footage talking-head -> video sesuai style (mis. ngobrol), kanvas
// edit.json "format" (bawaan 9:16 1080x1920; 16:9 1920x1080 untuk YouTube/video panjang, 4:5, 1:1).
//
//   npm run edit -- <nama> --new --style=ngobrol --input=/path/a.mov[,b.mov] [--brand=<slug>]
//        proyek baru: footage disalin ke Projects/<nama>/assets/raw/, dibuat Projects/<nama>/edit.json
//   npm run edit -- <nama> --analyze
//        normalisasi (30 fps tetap, HDR->SDR, audio 48 kHz) + transkrip per kata (ElevenLabs Scribe) + analisis wajah,
//        gerak, cahaya, noise -> Projects/<nama>/edit/konteks.md (dibaca agent) + kerangka "sentences" di edit.json
//   (agent mengisi edit.json: keputusan per kalimat -> maksud, buang/A-roll/B-roll, objek visual, alasan)
//   npm run edit -- <nama> --draft      validasi rencana -> potong + grading + audio -> preview tiap kalimat (+ cek)
//   npm run edit -- <nama>              ... + render akhir -> Result/<brand>/<nama>/<nama>.mp4 + cek edit + QA (+ posting)
//   --from=cut|sound|preview|render     mulai dari langkah tertentu (cache langkah sebelumnya dipakai)
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
  const style = editStyle(opt("style") ?? "ngobrol").slug;
  const inputs = (opt("input") ?? "").split(",").filter(Boolean);
  if (!inputs.length) throw new Error("--input=<footage.mp4>[,<footage2.mov>] wajib");
  const raw = path.join(paths.dir, "assets", "raw");
  mkdirSync(raw, { recursive: true });
  const sources = inputs.map((f, i) => {
    if (!existsSync(f)) throw new Error(`Footage tidak ada: ${f}`);
    const dst = path.join(raw, `${String(i + 1).padStart(2, "0")}-${path.basename(f).replace(/[^\w.-]+/g, "_")}`);
    copyFileSync(f, dst);
    // transkrip sidecar ikut disalin bila ada (<footage>.words.json)
    const side = f.replace(/\.[^./]+$/, ".words.json");
    if (existsSync(side)) copyFileSync(side, dst.replace(/\.[^./]+$/, ".words.json"));
    return { file: path.relative(paths.dir, dst) };
  });
  if (existsSync(planFile) && !has("force")) throw new Error(`${path.relative(ROOT, planFile)} sudah ada (--force untuk menimpa)`);
  const brandSlug = opt("brand");
  const format = normFormat(opt("format") ?? "9:16");
  writeFileSync(planFile, JSON.stringify({ style, ...(format !== "9:16" ? { format } : {}), ...(brandSlug ? { profile: brandSlug } : {}), brand: { left: "", right: "" }, sources, glossary: {}, sentences: [] }, null, 2) + "\n");
  console.log(`Proyek edit: ${path.relative(ROOT, paths.dir)}/ (style ${style}, ${sources.length} footage). Lanjut: npm run edit -- ${name} --analyze`);
  process.exit(0);
}

const plan = readJson(planFile, null);
if (!plan) throw new Error(`Belum ada ${path.relative(ROOT, planFile)}: npm run edit -- ${name} --new --style=<style> --input=<footage>`);
const S = editStyle(plan.style ?? "ngobrol");
// kanvas (v0.8): edit.json "format"; 9:16 = perilaku lama persis
const CV = FORMATS[normFormat(plan.format)], CW = CV.w, CH = CV.h, ASP = CW / CH, LAND = CW > CH, V916 = CV.format === "9:16";
const SUB_Y0 = V916 ? S.type?.subtitle?.zoneY?.[0] ?? 1244 : CV.safe.b - (LAND ? 150 : 170);
const pace = S.pace ?? {};

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
  const key = sha([src, st.size, st.mtimeMs, 2, ...(V916 ? [] : [CV.format])]);
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
  const outH = vertical ? CH : h >= 1440 ? 1920 : 1080;
  const outW = vertical ? CW : Math.round((w * outH) / h / 2) * 2;
  const pre = [];
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
  vf.push(`fps=${FPS}`, vertical ? `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}` : `scale=${outW}:${outH}`, "setsar=1", "format=yuv420p");
  process.stdout.write(`  normalisasi ${plan.sources[i].file} (${w}x${h}${hdr ? `, HDR -> SDR lewat ${hdrHow}` : ""}) ... `);
  run("ffmpeg", ["-v", "error", "-y", ...pre, "-i", src, "-map", "0:v:0", "-vf", vf.join(","), "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-an", srcNorm(i)]);
  run("ffmpeg", ["-v", "error", "-y", "-i", src, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", srcWav(i)]);
  console.log("OK");
  const out = { key, file: plan.sources[i].file, w: outW, h: outH, srcW: w, srcH: h, hdr, hdrHow, vertical, duration: duration(srcNorm(i)) };
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

const analyze = async () => {
  say("1/2 Normalisasi + transkrip + analisis footage");
  const { transcribe } = await import("./eleven.mjs");
  const infos = [];
  for (let i = 0; i < plan.sources.length; i++) {
    const info = normalize(i);
    const wf = path.join(edir, `src${i + 1}.words.json`);
    // transkrip sidecar (mis. dari editor lain / selftest): <footage>.words.json berisi [{w, s, e}] -> tanpa kredit
    const side = path.join(paths.dir, plan.sources[i].file).replace(/\.[^./]+$/, ".words.json");
    if (!existsSync(wf) || readJson(wf, {}).key !== info.key) {
      const viaSide = existsSync(side);
      process.stdout.write(`  transkrip src${i + 1} (${viaSide ? `file ${path.basename(side)}` : `Speech to Text ElevenLabs, ${info.duration.toFixed(0)} dtk audio`}) ... `);
      const words = viaSide ? readJson(side).map((w) => ({ w: w.w, s: w.s, e: w.e, p: w.p ?? 1 })) : await transcribe(srcWav(i), plan.language ?? "id");
      writeFileSync(wf, JSON.stringify({ key: info.key, words }));
      console.log(`${words.length} kata`);
    }
    const af = path.join(edir, `src${i + 1}.analysis.json`);
    if (!existsSync(af) || readJson(af, {}).key !== info.key) {
      process.stdout.write(`  analisis wajah/gerak/warna/suara src${i + 1} ... `);
      const r = JSON.parse(execFileSync(PY, [path.join(ENGINE, "scripts", "edit_analyze.py"), "--src", srcNorm(i), "--audio", srcWav(i), "--out", af], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
      const a = readJson(af);
      writeFileSync(af, JSON.stringify({ key: info.key, ...a }));
      console.log(`wajah ${Math.round(r.faceRate * 100)}% sampel`);
    }
    // lembar kontak 1 frame / 2 dtk untuk dilihat agent
    const sheet = path.join(pdir, `kontak-src${i + 1}.jpg`);
    mkdirSync(pdir, { recursive: true });
    if (!existsSync(sheet) || statSync(sheet).mtimeMs < statSync(srcNorm(i)).mtimeMs)
      run("ffmpeg", ["-v", "error", "-y", "-i", srcNorm(i), "-vf", `fps=1/2,scale=180:-2,tile=8x${Math.ceil(info.duration / 16)}`, "-frames:v", "1", "-q:v", "4", sheet]);
    infos.push(info);
  }
  // kalimat: dari tanda baca Scribe, jeda > 0,6 dtk, atau 16 kata
  const sentences = [];
  plan.sources.forEach((_, i) => {
    const words = readJson(path.join(edir, `src${i + 1}.words.json`)).words.map((w) => ({ ...w, w: fix(w.w) }));
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      sentences.push({ src: i, t: [+cur[0].s.toFixed(2), +cur.at(-1).e.toFixed(2)], text: cur.map((w) => w.w).join(" ") });
      cur = [];
    };
    words.forEach((w, k) => {
      if (cur.length && (w.s - cur.at(-1).e > 0.6 || cur.length >= 22)) flush();
      cur.push(w);
      if (/[.!?]$/.test(w.w) || (/,$/.test(w.w) && cur.length >= 10)) flush();
    });
    flush();
  });
  // potongan sangat pendek (< 3 kata) digabung ke kalimat sebelumnya bila sambung (sumber sama, jeda < 0,6 dtk)
  for (let k = sentences.length - 1; k > 0; k--) {
    const a = sentences[k], b = sentences[k - 1];
    if (a.src === b.src && a.text.split(/\s+/).length < 3 && a.t[0] - b.t[1] < 0.6 && !/[.!?]$/.test(b.text)) {
      b.t[1] = a.t[1];
      b.text += " " + a.text;
      sentences.splice(k, 1);
    }
  }
  // tandai ambil ulang: kalimat yang sangat mirip dengan 1-3 kalimat sesudahnya (yang terakhir biasanya yang benar)
  const toks = sentences.map((s) => new Set(normTokens(s.text)));
  sentences.forEach((s, k) => {
    s.flags = [];
    for (let j = k + 1; j <= k + 3 && j < sentences.length; j++) {
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
    return { id: prev?.id ?? `s${k + 1}`, src: s.src, t: s.t, text: s.text, flags: s.flags,
      keep: prev?.keep ?? !s.flags.some((f) => f.startsWith("mirip") || f.startsWith("terpotong")), intent: prev?.intent ?? null, mode: prev?.mode ?? "aroll",
      ...(prev?.punch ? { punch: prev.punch } : {}), objects: prev?.objects ?? [], why: prev?.why ?? "" };
  });
  writeFileSync(planFile, JSON.stringify(plan, null, 2) + "\n");
  // ringkasan konteks untuk agent
  const lines = [`# Konteks footage: ${name}`, "", `Style: **${plan.style}** · ${plan.sources.length} footage`, ""];
  infos.forEach((inf, i) => {
    const a = readJson(path.join(edir, `src${i + 1}.analysis.json`));
    const c = a.color, au = a.audio ?? {};
    lines.push(`## src${i + 1}: ${inf.file}`,
      `- ${inf.srcW}x${inf.srcH}${inf.vertical ? (V916 ? " vertikal" : ` sebentuk ${CV.format}`) : ` -> perlu dipotong ke ${CV.format} mengikuti wajah`} · ${inf.duration.toFixed(1)} dtk${inf.hdr ? ` · HDR (${inf.hdrHow})` : ""}`,
      `- wajah terdeteksi ${Math.round(a.faceRate * 100)}% sampel${a.faceRate < 0.5 ? " (rendah: PiP/anotasi wajah dinonaktifkan otomatis)" : ""}`,
      `- cahaya: luma p1 ${c.lumaP1} · p50 ${c.lumaP50} · p99 ${c.lumaP99} · saturasi ${c.sat} · putih Lab ${JSON.stringify(c.whiteLab)} · kulit [L, chroma, hue] ${JSON.stringify(c.skin)}`,
      `- suara: noise floor ${au.noiseFloorDb} dBFS, bicara ${au.speechDb} dBFS${au.noiseFloorDb > -50 ? " (berisik: pembersih noise aktif)" : ""}`,
      `- lembar kontak: edit/kontak-src${i + 1}.jpg`, "");
  });
  lines.push("## Kalimat", "", "| id | src | waktu | teks | tanda |", "|---|---|---|---|---|");
  for (const s of plan.sentences) lines.push(`| ${s.id} | ${s.src + 1} | ${s.t[0].toFixed(1)}-${s.t[1].toFixed(1)} | ${s.text.replace(/\|/g, "/")} | ${s.flags.join("; ")} |`);
  writeFileSync(path.join(pdir, "konteks.md"), lines.join("\n") + "\n");
  console.log(`\nKonteks: ${path.relative(ROOT, path.join(pdir, "konteks.md"))} (${plan.sentences.length} kalimat). Isi keputusan per kalimat di edit.json, lalu: npm run edit -- ${name} --draft`);
};

if (has("analyze")) {
  await analyze();
  process.exit(0);
}

// ---------------------------------------------------------------- 2. validasi rencana
const TYPES = ["keyword", "big", "chips", "annotate", "brackets", "doc", "chat", "prompt", "file", "card", "phone", "image", "clip"];
const infos = plan.sources.map((_, i) => readJson(srcInfo(i), null));
if (infos.some((x) => !x) || !plan.sentences?.length) throw new Error(`Jalankan dulu: npm run edit -- ${name} --analyze`);
const srcWords = plan.sources.map((_, i) => readJson(path.join(edir, `src${i + 1}.words.json`)).words.map((w) => ({ ...w, w: fix(w.w) })));
const analysis = plan.sources.map((_, i) => readJson(path.join(edir, `src${i + 1}.analysis.json`)));
let errors = 0;
let warns = 0;
const err = (m) => (errors++, console.log(`  ERROR  ${m}`));
const warn = (m) => (warns++, console.log(`  !      ${m}`));

say("2 Validasi rencana edit");
const kept = plan.sentences.filter((s) => s.keep !== false);
if (!kept.length) throw new Error("Semua kalimat dibuang (keep:false)");
const wordsOf = (s) => srcWords[s.src].filter((w) => w.s >= s.t[0] - 0.05 && w.e <= s.t[1] + 0.05);
const spokenSet = (s) => new Set(wordsOf(s).flatMap((w) => normTokens(w.w)));
for (const s of kept) {
  if (!s.intent) warn(`${s.id}: maksud (intent) belum diisi`);
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

// ---------------------------------------------------------------- 3. potong (rentang tiap kata) + peta waktu
const snap = (t) => Math.round(t * FPS) / FPS;
const maxGap = pace.maxGapSec ?? 0.15;
const keepGap = (pace.keepGapSec ?? [0.04, 0.08])[1];
const segs = []; // {src, in, out, outStart}
const wordMap = []; // per kalimat: [{w, s, e}] di linimasa baru
let cursor = 0;
const order = plan.sentences.filter((s) => s.keep !== false);
for (const s of order) {
  const ws = wordsOf(s).filter((w) => !(FILLER.has(norm(w.w)) && s.keepFillers !== true));
  if (!ws.length) continue;
  const ranges = [];
  for (const w of ws) {
    const a = w.s - keepGap / 2;
    const b = w.e + keepGap / 2;
    if (ranges.length && a - ranges.at(-1)[1] <= maxGap) ranges.at(-1)[1] = b;
    else ranges.push([a, b]);
  }
  // jeda napas khusus (punchline): "pause": detik
  if (s.pause) ranges.at(-1)[1] += s.pause;
  const mapped = [];
  for (const [a0, b0] of ranges) {
    const a = snap(Math.max(0, a0)), b = snap(Math.min(infos[s.src].duration, b0));
    if (b - a < 1 / FPS) continue;
    const last = segs.at(-1);
    if (last && last.src === s.src && Math.abs(last.out - a) < 1e-6) last.out = b;
    else segs.push({ src: s.src, in: a, out: b, outStart: cursor });
    for (const w of ws) if (w.s >= a0 - 1e-6 && w.e <= b0 + 1e-6) mapped.push({ w: w.w, s: cursor + (w.s - a), e: cursor + (w.e - a) });
    cursor += b - a;
  }
  wordMap.push({ s, words: mapped });
}
const total = cursor;
const totalFrames = Math.round(total * FPS);
const rawDur = order.reduce((t, s) => t + (s.t[1] - s.t[0]), 0);
const nWords = wordMap.reduce((t, x) => t + x.words.length, 0);
console.log(`  ${order.length} kalimat dipakai dari ${plan.sentences.length} · ${segs.length} potongan · durasi ${total.toFixed(1)} dtk · tempo ${(nWords / total).toFixed(2)} kata/dtk (target ${pace.targetWordsPerSec ?? "-"})`);
const [d0, d1] = pace.duration ?? [0, 1e9];
if (total < d0 || total > d1) warn(`durasi ${total.toFixed(0)} dtk di luar rentang style ${d0}-${d1} dtk`);

// timing.json (kompatibel dengan QA, sound, posting): satu scene per kalimat
const LEAD = 0.12;
const scenes = wordMap.map(({ s, words }, k) => {
  const start = k === 0 ? 0 : Math.max(wordMap[k - 1].words.at(-1).e, words[0].s - LEAD);
  return { s, words, start };
});
// bab opsional (v0.8): kalimat ber-"chapter": "Judul"; bab pada kalimat yang dibuang pindah ke kalimat terpakai berikutnya
const chapterOf = new Map();
{ let pending = null; const used = new Set(wordMap.map((x) => x.s)); for (const s of plan.sentences) { if (s.chapter) pending = s.chapter; if (pending && used.has(s)) { chapterOf.set(s, pending); pending = null; } } }
const BAB = chapterOf.size ? plan.bab ?? "tanpa" : "tanpa";
const timing = {
  fps: FPS, totalFrames, audio: `audio/${name}.wav`, provider: "footage", external: "footage", style: plan.style, ...(chapterOf.size ? { bab: BAB } : {}),
  scenes: scenes.map(({ s, words, start }, k) => {
    const sf = Math.round(start * FPS);
    const ef = k < scenes.length - 1 ? Math.round(scenes[k + 1].start * FPS) : totalFrames;
    return { index: k, id: s.id, text: words.map((w) => w.w).join(" "), style: "normal", startFrame: sf, durationFrames: Math.max(1, ef - sf), ...(chapterOf.has(s) ? { chapter: chapterOf.get(s) } : {}),
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
  const mine = segs.filter((s) => s.src === i);
  const all = mine.map((s) => (s.in + s.out) / 2);
  const times = all.length <= 6 ? all : Array.from({ length: 6 }, (_, k) => all[Math.round((k * (all.length - 1)) / 5)]);
  const faces = times.map((t) => { const f = faceAt(i, t); return f ? [f[1], f[2], f[3], f[4]] : null; });
  const inf = infos[i];
  const cr = mine.length ? cropFor(mine[Math.floor(mine.length / 2)]) : null;
  const sb = clamp(c.lumaP1, 0, 0.2), sm = clamp(c.lumaP50, sb + 0.05, 0.85), sw = clamp(c.lumaP99, sm + 0.05, 1);
  const q = { src: [sb, sm, sw], out: [tb, tm, tw], sat: G.saturationScale ?? 0.72, wb: null, vig: G.vignette ? (Math.PI / 4) * clamp(G.vignette / 0.2, 0.3, 1.2) : 0 };
  const wl = c.whiteLab;
  if (wl && (G.whiteBalance ?? "neutral") === "neutral" && (Math.abs(wl[1]) > 1.5 || Math.abs(wl[2] - 1.5) > 3))
    q.wb = [clamp(1 - wl[1] * 0.006 - wl[2] * 0.003, 0.92, 1.08), clamp(1 + (wl[2] - 1.5) * 0.007, 0.92, 1.08)];
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

const cutKey = sha([segs, plan.sources, infos.map((x) => x.key), S.grade, analysis.map((a) => a.color), FPS, 3]);
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
const cropFor = (seg) => {
  const inf = infos[seg.src];
  if (inf.vertical) return null;
  const fs = [];
  for (let t = seg.in; t < seg.out; t += 0.2) { const f = faceAt(seg.src, t); if (f) fs.push(f); }
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

if (startAt <= 0 && (readJson(path.join(edir, "cut.json"), {}).key !== cutKey || !existsSync(arollFile))) {
  say(`3 Potong ${segs.length} bagian + grading terkalibrasi`);
  const cal = plan.sources.map((_, i) => calibrate(i));
  const chains = cal.map((x) => x.chain);
  cal.forEach((x, i) => console.log(`  grading src${i + 1} (${x.iters} putaran): ${x.chain}\n    terukur: luma ${x.measured?.lumaP1}/${x.measured?.lumaP50}/${x.measured?.lumaP99} · kulit chroma ${x.measured?.skinChroma} (target ${G.lumaP1}/${G.lumaP50}/${G.lumaP99} · ${G.skinChroma})`));
  // dikerjakan per kelompok 30 potongan (tiap potongan = input dengan seek akurat), lalu disambung tanpa encode ulang
  const parts = [];
  for (let g = 0; g < segs.length; g += 30) {
    const group = segs.slice(g, g + 30);
    const inV = group.flatMap((s) => ["-ss", s.in.toFixed(4), "-t", (s.out - s.in).toFixed(4), "-i", srcNorm(s.src)]);
    const fc = group.map((s, k) => {
      const cr = cropFor(s);
      const geo = cr ? `crop=${cr.w}:${cr.h}:${cr.x}:${cr.y},scale=${CW}:${CH},` : "";
      return `[${k}:v]${geo}${chains[s.src]},setsar=1,fps=${FPS},trim=end_frame=${Math.round((s.out - s.in) * FPS)},setpts=PTS-STARTPTS[v${k}]`;
    });
    fc.push(`${group.map((_, k) => `[v${k}]`).join("")}concat=n=${group.length}:v=1:a=0[v]`);
    const part = path.join(edir, `aroll-${g / 30}.mp4`);
    run("ffmpeg", ["-v", "error", "-y", ...inV, "-filter_complex", fc.join(";"), "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", String(FPS), part]);
    parts.push(part);
    // audio kelompok yang sama: potongan + fade 8 ms (tanpa klik)
    const inA = group.flatMap((s) => ["-ss", s.in.toFixed(4), "-t", (s.out - s.in).toFixed(4), "-i", srcWav(s.src)]);
    const fa = group.map((s, k) => { const d = s.out - s.in; return `[${k}:a]atrim=0:${d.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=${Math.max(0, d - 0.008).toFixed(4)}:d=0.008,apad=whole_dur=${d.toFixed(4)}[a${k}]`; });
    fa.push(`${group.map((_, k) => `[a${k}]`).join("")}concat=n=${group.length}:v=0:a=1[a]`);
    run("ffmpeg", ["-v", "error", "-y", ...inA, "-filter_complex", fa.join(";"), "-map", "[a]", "-ar", "48000", "-ac", "1", part.replace(/\.mp4$/, ".wav")]);
  }
  const list = path.join(edir, "aroll.txt");
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", arollFile]);
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
writeFileSync(paths.timing, JSON.stringify(timing, null, 2));

// ---------------------------------------------------------------- 5. data visual untuk komposisi Edit
const fr = (t) => Math.round(t * FPS);
const sceneOf = new Map(scenes.map((x) => [x.s.id, x]));
const resolveAt = (sid, ref, fallback) => {
  const x = sceneOf.get(sid);
  if (ref === undefined || ref === null || ref === "start") return fallback ?? fr(x.start);
  if (ref === "end") return fr(x.words.at(-1).e);
  if (typeof ref === "number") return fr(x.start + ref);
  const r = typeof ref === "string" ? { word: ref, n: 1 } : ref;
  const t = norm(r.word);
  const hits = x.words.filter((w) => norm(w.w).startsWith(t) || (t.length > 3 && norm(w.w).includes(t)));
  const w = hits[(r.n ?? 1) - 1];
  return w ? fr(Math.max(x.start, w.s - LEAD)) : fr(x.start);
};
// wajah di linimasa baru (koordinat kanvas, setelah dipotong sebentuk kanvas), tiap 2 frame
const faceTrack = [];
for (let f = 0; f < totalFrames; f += 2) {
  const t = f / FPS;
  const seg = segs.find((s) => t >= s.outStart - 1e-6 && t < s.outStart + (s.out - s.in) + 1e-6) ?? segs.at(-1);
  const st = seg.in + (t - seg.outStart);
  const ff = faceAt(seg.src, st);
  if (!ff) { faceTrack.push(null); continue; }
  const inf = infos[seg.src];
  const cr = cropFor(seg);
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
  const m = analysis[seg.src].motion;
  const t0 = Math.floor(seg.in), t1 = Math.ceil(seg.in + (x.words.at(-1).e - x.start));
  let l = 0, r = 0;
  for (let t = t0; t <= t1 && t < m.sec.length; t++) for (let row = 2; row < m.rows; row++) { l += m.sec[t][row * m.cols] + m.sec[t][row * m.cols + 1]; r += m.sec[t][row * m.cols + 2] + m.sec[t][row * m.cols + 3]; }
  return l - r; // > 0: kiri lebih ramai
};

// potongan visual (punch-in): skala bergantian di tiap potongan, diperkuat pada kalimat ber-"punch": "strong"
const scales = S.aroll?.punchIn?.scales ?? [1, 1.18, 1.28];
const cuts = [];
segs.forEach((s, k) => {
  const f0 = fr(s.outStart), f1 = fr(s.outStart + (s.out - s.in));
  const sc = scenes.find((x) => s.outStart + 1e-6 >= x.start && s.outStart < (x.words.at(-1).e + 0.5));
  const punch = sc?.s.punch ?? "auto";
  let scale = punch === "none" ? 1 : punch === "strong" ? scales[2] ?? 1.28 : scales[k % 2 ? 1 : 0] ?? 1;
  const fm = faceMid(f0, f1);
  cuts.push({ f0, f1, scale, ox: fm ? fm.cx : CW / 2, oy: fm ? fm.cy : Math.round(CH * 0.4) });
});

// objek visual -> frame
const visuals = [];
const objects = [];
for (const { s, words, start } of scenes) {
  const f0 = fr(start), f1 = fr(words.at(-1).e + 0.15);
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

const editProps = {
  video: `media/edit/${name}.mp4`, totalFrames, cuts, face: faceTrack, visuals, objects, subs,
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
  scenes: scenes.map(({ s }) => ({ music: S.audio?.music ? "pad" : "off",
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
for (const e of [...events, totalFrames]) { if (e - lastEv > 2.2 * FPS) warn(`layar tanpa perubahan ${((e - lastEv) / FPS).toFixed(1)} dtk (${(lastEv / FPS).toFixed(1)}-${(e / FPS).toFixed(1)})`); lastEv = Math.max(lastEv, e); }

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
  for (const { s, words, start } of scenes) {
    // frame saat objek terakhir kalimat ini sudah muncul (atau tengah kalimat)
    const objs = objects.filter((o) => o.sid === s.id);
    const lastAt = Math.max(fr(start + (words.at(-1).e - start) * 0.6), ...objs.map((o) => Math.max(o.at, ...[...(o.items ?? []), ...(o.rows ?? []), ...(o.bubbles ?? [])].map((x) => x.at))) .map((x) => x + 10));
    const frame = Math.min(lastAt, fr(words.at(-1).e) - 1, totalFrames - 1);
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
  execFileSync(PY, [path.join(ENGINE, "scripts", "board_png.py"), path.join(paths.preview, "board.png"), ...shots.slice(0, 24)]);
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
