// QA otomatis untuk satu video: format, loudness, konsistensi suara, bisikan, dan sinkron kata.
// Pemakaian: npm run qa -- <nama> [--asr=auto|whisper|eleven|off]
//   --asr: cara memeriksa kejelasan kata [5]. auto (bawaan) = whisper bila modelnya dipasang, selain itu dilewati;
//          eleven = Speech to Text ElevenLabs (Scribe, memakai kuota STT); off = dilewati.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, alignTokens, bps, canvasOf, config, encodeFor, normTokens, resolveName, run, whisperReady } from "./lib.mjs";

const name = resolveName(process.argv.slice(2).find((a) => !a.startsWith("--")));
const cfg = config();
const PY = path.join(ENGINE, ".venv", "bin", "python");
const TOOLS = path.join(ENGINE, "scripts", "audio_tools.py");
const paths = P(name);
const mp4 = paths.result;
const wav = paths.voice;
if (!existsSync(paths.timing)) throw new Error(`Timing belum ada: ${paths.timing} (jalankan npm run voice -- ${name})`);
const timing = JSON.parse(readFileSync(paths.timing, "utf8"));
const fps = timing.fps;
let fails = 0;
const ok = (m) => console.log(`  OK    ${m}`);
const bad = (m) => {
  fails++;
  console.log(`  GAGAL ${m}`);
};
const check = (cond, m) => (cond ? ok(m) : bad(m));

if (!existsSync(mp4)) throw new Error(`Video belum ada: ${mp4}`);

console.log("\n[1] Format video");
const probe = JSON.parse(
  run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height,r_frame_rate:format=duration", "-of", "json", mp4]),
);
const v = probe.streams.find((s) => s.codec_type === "video");
const a = probe.streams.find((s) => s.codec_type === "audio");
const CV = canvasOf(name);
check(v && v.width === CV.w && v.height === CV.h, `resolusi ${v?.width}x${v?.height} (target ${CV.w}x${CV.h}, ${CV.format})`);
check(v?.codec_name === "h264" && v?.r_frame_rate === "30/1", `video ${v?.codec_name} ${v?.r_frame_rate} fps`);
check(a?.codec_name === "aac", `audio ${a?.codec_name}`);
const dur = parseFloat(probe.format.duration);
check(Math.abs(dur - timing.totalFrames / fps) < 0.2, `durasi ${dur.toFixed(2)} dtk sesuai timing`);
// ukuran file: bitrate video dibatasi setelan encode (capped CRF); di atasnya hanya memperberat unggahan & Drive
const enc = encodeFor(name);
const vRate = parseFloat(JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=bit_rate", "-of", "json", mp4])).streams[0]?.bit_rate ?? probe.format.bit_rate);
const capRate = enc.maxrate ? bps(enc.maxrate) * 1.15 : 12e6;
const sizeMb = statSync(mp4).size / 1048576;
check(vRate <= capRate, `ukuran ${sizeMb.toFixed(1)} MB, video ${(vRate / 1e6).toFixed(1)} Mbps (maks ${(capRate / 1e6).toFixed(1)})${vRate > capRate ? ` -> npm run compress -- ${name}` : ""}`);

console.log("\n[2] Loudness (standar Reels/TikTok sekitar -14 s.d. -16 LUFS, puncak < -1 dBTP)");
const ebur = execFileSync("sh", ["-c", `ffmpeg -hide_banner -i "${mp4}" -vn -af ebur128=peak=true -f null - 2>&1 | tail -14`], {
  encoding: "utf8",
});
const lufs = parseFloat(ebur.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
const peak = parseFloat(ebur.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
check(lufs <= -13 && lufs >= -18, `integrated ${lufs} LUFS`);
check(peak <= -0.5, `true peak ${peak} dBFS`);

const ranges = timing.scenes.map((s) => `${(s.startFrame / fps).toFixed(2)}:${((s.startFrame + s.durationFrames) / fps).toFixed(2)}`);
const py = (args) => JSON.parse(execFileSync(PY, [TOOLS, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));

// montase musik (v0.10): tanpa narasi, pemeriksaan suara [3]-[7] tidak berlaku
if (timing.noVoice) console.log("\n[3-7] Suara & sinkron kata: dilewati (montase musik tanpa narasi)");
else {
console.log("\n[3] Konsistensi suara (kemiripan pembicara per scene vs jangkar voice ElevenLabs >= 0.86, narator VoiceStudio >= 0.80)");
// ElevenLabs: dibandingkan dengan jangkar suara voice itu (pemakaian pertama voice+model), per scene.
// Audio dari luar (voice --audio=...) memang bukan narator referensi: cek kemiripan dilewati.
const anchorRef = timing.voiceAnchor && existsSync(path.join(ENGINE, timing.voiceAnchor.path)) ? path.join(ENGINE, timing.voiceAnchor.path) : null;
const narRef = path.join(ENGINE, cfg.narrator?.ref ?? "");
const ref = anchorRef ?? (timing.external || !existsSync(narRef) ? null : narRef);
const sim = ref ? py(["speaker", ref, wav, ...ranges]) : [];
// voice sama ≈ 0,91; voice ElevenLabs lain bisa 0,72-0,83 → ambang jangkar lebih ketat dari narator VoiceStudio
const simMin = anchorRef ? (cfg.elevenlabs?.anchorMin ?? 0.86) : 0.8;
const pitch = py(["pitch", wav, ...ranges]);
if (anchorRef) console.log(`  -     ${timing.external}, jangkar ${timing.voiceAnchor.path} (dari ${timing.voiceAnchor.from})`);
if (!ref) ok(timing.external ? `audio luar (${timing.external}), satu suara dari sumbernya; tidak dibandingkan dengan narator` : "belum ada jangkar/referensi suara untuk dibandingkan");
else timing.scenes.forEach((s, i) => {
  const style = s.style ?? "normal";
  if (cfg.styles?.[style]?.whisper) return;
  if (sim[i] === null) return console.log(`  -     scene ${i + 1}: terlalu pendek untuk diukur`);
  check(sim[i] >= simMin, `scene ${i + 1}: kemiripan ${sim[i]} (min ${simMin})`);
});

console.log("\n[4] Gaya suara (volume gaya lain tetap terdengar)");
const normal = timing.scenes.map((s, i) => ({ s, i })).filter(({ s }) => (s.style ?? "normal") === "normal");
const narrDb = normal.reduce((t, { i }) => t + pitch[i].rms_db, 0) / Math.max(1, normal.length);
const others = timing.scenes.filter((s) => (s.style ?? "normal") !== "normal");
if (!others.length) ok("semua scene gaya normal");
others.forEach((s) => {
  const i = s.index;
  check(narrDb - pitch[i].rms_db <= 6, `scene ${i + 1} (${s.style}): ${pitch[i].rms_db} dB vs narasi ${narrDb.toFixed(1)} dB (selisih <= 6 dB)`);
});

console.log("\n[5] Ekspresi & kejelasan (suara hidup, bukan monoton)");
const asrOpt = (process.argv.find((x) => x.startsWith("--asr="))?.slice(6) || cfg.qa?.asr || "auto").toLowerCase();
const asrMode = asrOpt === "auto" ? (whisperReady() ? "whisper" : "off") : asrOpt;
if (asrMode === "whisper" && !whisperReady()) throw new Error("--asr=whisper butuh model whisper (setup --with-whisper)");
const pr = py(["prosody", wav, "--lang", cfg.language ?? "id", ...(asrMode === "whisper" ? [] : ["--no-asr"])]);
check(pr.pitch_std_st >= 3.0, `variasi nada ${pr.pitch_std_st} semitone (>= 3.0; monoton biasanya < 2.5)`);
const nWords = timing.scenes.reduce((t, s) => t + (s.words ?? []).length, 0);
if (asrMode === "whisper") {
  check(pr.asr_prob_mean >= 0.9, `kejelasan kata rata-rata ${pr.asr_prob_mean} (>= 0.90, whisper)`);
  check(pr.asr_prob_low <= Math.max(2, nWords * 0.02), `${pr.asr_prob_low} dari ${nWords} kata kurang jelas (maks 2%)`);
} else if (asrMode === "eleven") {
  // Scribe mendengarkan ulang audio: kata naskah yang tidak terdengar = terlewat / salah baca
  const { transcribe } = await import("./eleven.mjs");
  const ws = await transcribe(wav, cfg.language ?? "id");
  const toks = timing.scenes.flatMap((s) => (s.words ?? []).flatMap((w) => normTokens(w.w)));
  const { matched, total } = alignTokens(toks, ws);
  const low = ws.filter((w) => w.p < 0.5).length;
  check(matched / total >= 0.9, `${matched}/${total} kata naskah terdengar jelas (>= 90%, Speech to Text ElevenLabs)`);
  check(low <= Math.max(2, nWords * 0.03), `${low} dari ${ws.length} kata kurang yakin (maks 3%)`);
} else if (asrMode === "off") console.log("  -     kejelasan kata tidak dicek (tanpa whisper). Cek dengan mendengarkan, atau qa --asr=eleven (kuota STT)");
else throw new Error(`--asr=${asrOpt} tidak dikenal (auto | whisper | eleven | off)`);

console.log("\n[6] Pelafalan istilah (kamus config.json)");
const toCheck = [];
timing.scenes.forEach((s) =>
  (s.words ?? []).forEach((w) => {
    if (!w.guessed && /(^|[^\p{L}])AI([^\p{L}]|$)/u.test(w.w)) toCheck.push({ w, s });
  }),
);
if (timing.provider === "elevenlabs") ok("ElevenLabs: istilah dibacakan lewat kamus pelafalan; cek dengan mendengarkan");
else if (timing.external) ok("audio luar: pelafalan mengikuti sumbernya, kamus tidak dipakai");
else if (cfg.pronounce?.AI && toCheck.length) {
  const rs = toCheck.map(({ w, s }) => `${((s.startFrame + w.f) / fps).toFixed(2)}:${((s.startFrame + Math.max(w.e, w.f + 6)) / fps).toFixed(2)}`);
  const f = py(["onset", wav, ...rs]);
  const good = f.filter((x) => x && x[1] >= 1450).length;
  check(good / f.length >= 0.8, `"AI" dibaca "${cfg.pronounce.AI}": ${good}/${f.length} kemunculan berawal vokal /e/ (F2 >= 1450 Hz)`);
} else ok("tidak ada istilah yang perlu dicek");

console.log("\n[7] Sinkron teks & suara");
const words = timing.scenes.flatMap((s) => s.words ?? []);
const guessed = words.filter((w) => w.guessed).length;
check(words.length > 0, `${words.length} kata punya waktu`);
check(guessed / words.length <= 0.1, `${guessed} kata ditebak (${Math.round((guessed / words.length) * 100)}%, maks 10%)`);
// kata di awal yang waktunya ditebak (mis. "AI" dibaca "Ei Ai") menggeser batas: +15 frame (±0,5 dtk) per kata tebakan di depannya
const late = timing.scenes.filter((s) => {
  const ws = s.words ?? [], i = ws.findIndex((w) => !w.guessed), first = ws[i];
  return !first || first.f < 0 || first.f > 12 + 15 * i;
});
check(
  !late.length,
  late.length
    ? `scene ${late.map((s) => s.index + 1).join(", ")}: kata pertama tidak dalam 0-12 frame dari awal scene`
    : "setiap scene mulai tepat sebelum kata pertamanya diucapkan (<= 0,4 dtk)",
);

}

console.log("\n[8] Tata letak visual (teks keluar bingkai/terpotong, brand pojok, area UI Reels, tabrakan)");
const board = existsSync(paths.storyboard) ? JSON.parse(readFileSync(paths.storyboard, "utf8")) : {};
const layoutFile = path.join(paths.preview, "layout.json");
if (board.composition === "mg4") ok("motion-graphics-v4: dicek selfcheck bawaan skill saat npm run mg4 (area aman, tumpang tindih, ejaan)");
else if (!existsSync(layoutFile)) bad(`belum ada hasil cek tata letak: jalankan preview (${board.composition === "html" ? "npm run html" : "npm run render"} -- ${name} --preview)`);
else {
  const L = JSON.parse(readFileSync(layoutFile, "utf8"));
  const src = [paths.storyboard, path.join(paths.html, "index.html")].filter(existsSync);
  const stale = src.some((f) => statSync(f).mtimeMs > statSync(layoutFile).mtimeMs);
  if (stale) bad("hasil cek tata letak lebih lama dari storyboard/halaman terakhir: jalankan preview lagi");
  check(L.errors === 0, `${L.errors} error tata letak di ${L.scenes.length} frame${L.errors ? " (lihat preview/layout.json)" : ""}`);
  for (const sc of L.scenes) for (const e of sc.errors.slice(0, 3)) console.log(`        ${sc.label}: ${e}`);
  if (L.warns) console.log(`  -     ${L.warns} peringatan (dekat tepi area aman / teks bertumpuk); periksa di gambar preview`);
}

console.log(fails ? `\n${fails} pengecekan gagal.` : "\nSemua pengecekan lolos.");
process.exit(fails ? 1 : 0);
