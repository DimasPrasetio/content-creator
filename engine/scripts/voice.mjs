// Naskah (Projects/<nama>/script.md) -> voice over -> Projects/<nama>/voice.wav + Engine/work/<nama>/timing.json
//
// Provider (config.json "provider", frontmatter "provider:", atau --provider=):
// - elevenlabs (default): Projects/<nama>/script.txt (narasi + tag ekspresi) dibacakan utuh oleh SATU voice ElevenLabs
//   lewat SDK @elevenlabs/elevenlabs-js (key di .env.local), di-cache per hash teks + pengaturan; lalu diseragamkan
//   dan disinkronkan.
//   Voice: --voice=<nama|id> > frontmatter "voice:" > config elevenlabs.voice.
// - voicestudio: kloning lokal (di bawah ini).
//
// - Suara narator dikloning dari Engine/voices/narator.wav (seed tetap) agar konsisten di semua video.
// - Scene berurutan dengan gaya yang sama dibuat dalam SATU panggilan supaya intonasi mengalir alami.
// - Narasi dibagi per paragraf (±15-20 dtk); tiap paragraf dibuat beberapa take, lalu take terbaik dipilih
//   otomatis (kejelasan kata, ekspresi nada, kemiripan suara dengan narator).
// - Kamus pelafalan (config.json "pronounce") hanya mengubah teks yang dibacakan, bukan tulisan di layar.
// - Setelah jadi, audio ditranskripsi per kata dan dicocokkan ke naskah: waktu scene & tiap kata
//   disimpan agar visual muncul tepat saat kata diucapkan.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, NAME_RE, P, alignTokens, brandProfile, config, duration, normTokens, parseScript, resolveName, run } from "./lib.mjs";
import { errText, isPaidPlanError, quota, ttsToFile } from "./eleven.mjs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const force = args.includes("--force");
// --audio=<file>: voice over sudah jadi dari luar; TTS dilewati, hanya diseragamkan lalu diselaraskan.
const userAudio = args.find((a) => a.startsWith("--audio="))?.slice("--audio=".length);
if (userAudio && !existsSync(userAudio)) throw new Error(`Audio tidak ditemukan: ${userAudio}`);
let extAudio = userAudio;
const cfg = config();
const FPS = 30;
const PY = path.join(ENGINE, ".venv", "bin", "python");
const TOOLS = path.join(ENGINE, "scripts", "audio_tools.py");

if (!NAME_RE.test(name)) console.warn(`! Nama "${name}" tidak sesuai format [tanggal]-[count]-[nama].`);
const paths = P(name);
const scriptPath = paths.script;
if (!existsSync(scriptPath)) throw new Error(`Naskah tidak ditemukan: ${scriptPath}`);
const { meta, scenes } = parseScript(readFileSync(scriptPath, "utf8"));
if (!scenes.length) throw new Error("Naskah kosong.");
// Pasangan teks bersih script.txt (narasi + tag ekspresi saja, untuk ditempel ke TTS luar seperti ElevenLabs).
// Dibuat dari naskah bila belum ada; file yang sudah ada (mis. berisi tag [laugh]) tidak ditimpa.
const plainPath = paths.plain;
if (!existsSync(plainPath)) writeFileSync(plainPath, scenes.map((s) => s.text).join("\n\n") + "\n");
if (!existsSync(PY)) throw new Error("Venv analisis belum ada. Lihat Engine/README.md bagian Persiapan.");

const language = meta.language || cfg.language || "id";
const speed = parseFloat(meta.speed || cfg.speed || 1);
const narrator = cfg.narrator;
const refPath = path.join(ENGINE, narrator.ref);
const refText = readFileSync(path.join(ENGINE, narrator.refText), "utf8").trim();
const styles = cfg.styles ?? { normal: { lufs: -16 } };
for (const sc of scenes) {
  if (!styles[sc.style]) throw new Error(`Gaya "${sc.style}" tidak dikenal. Pilihan: ${Object.keys(styles).join(", ")}`);
  if (!/[.!?…]$/.test(sc.text)) sc.text += ".";
}

const cache = paths.cache;
mkdirSync(cache, { recursive: true });

// Penyedia suara: --provider=<x> > frontmatter "provider:" > config.json "provider" (elevenlabs | voicestudio).
const provider = userAudio
  ? "audio"
  : (args.find((a) => a.startsWith("--provider="))?.slice("--provider=".length) || meta.provider || cfg.provider || "voicestudio").toLowerCase();
if (!["audio", "elevenlabs", "voicestudio"].includes(provider)) throw new Error(`Provider "${provider}" tidak dikenal (elevenlabs | voicestudio).`);

if (provider === "voicestudio") try {
  const h = await fetch(`${cfg.ttsUrl}/health`, { signal: AbortSignal.timeout(5000) });
  if (!h.ok) throw new Error(String(h.status));
} catch {
  throw new Error(`VoiceStudio tidak merespons di ${cfg.ttsUrl}. Buka aplikasinya: open -a VoiceStudio`);
}

/** Loudness terintegrasi (LUFS) sebuah file, lewat filter ebur128. */
const measureLufs = (file) => {
  const log = execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostats -i "${file}" -af ebur128 -f null - 2>&1 | grep -E "^\\s+I:" | tail -1`], { encoding: "utf8" });
  return parseFloat(log.match(/(-?[\d.]+) LUFS/)?.[1] ?? "-16");
};

// Profil brand (frontmatter "profile: <slug>" atau --profile=) -> Brands/<slug>/profile.json:
// voice, model, pengaturan, seed, dan kamus pelafalan yang SAMA untuk semua video brand itu.
const profileName = args.find((a) => a.startsWith("--profile="))?.slice("--profile=".length) || meta.profile;
const profile = brandProfile(profileName);
if (profileName && !profile) throw new Error(`Profil tidak ditemukan: Brands/${profileName}/profile.json`);
if (profile) console.log(`Profil brand: ${profileName}`);

// Pelafalan: ganti istilah sesuai kamus (mis. AI -> "E Ai") hanya untuk teks yang dibacakan.
const lexicon = Object.entries({ ...(cfg.pronounce ?? {}), ...(profile?.pronounce ?? {}) }).sort((a, b) => b[0].length - a[0].length);
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const speak = (t) => lexicon.reduce((acc, [k, v]) => acc.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(k)}(?![\\p{L}\\p{N}])`, "gu"), v), t);

// --- ElevenLabs (SDK): seluruh narasi script.txt (dengan tag ekspresi) dibacakan SATU voice ---
const el = { ...(cfg.elevenlabs ?? {}), ...(profile?.voice ?? {}) };
let elLabel = "";
if (provider === "elevenlabs") {
  // voice: --voice=<nama|id> > frontmatter "voice:" > config elevenlabs.voice; nama dicari di elevenlabs.voices
  const want = args.find((a) => a.startsWith("--voice="))?.slice("--voice=".length) || meta.voice || el.voice;
  if (profile?.voice?.voice && String(want).toLowerCase() !== String(profile.voice.voice).toLowerCase())
    console.warn(`! Voice "${want}" berbeda dengan voice profil ${profileName} ("${profile.voice.voice}"): suara brand jadi tidak konsisten.`);
  const voices = el.voices ?? {};
  const hit = Object.keys(voices).find((n) => n.toLowerCase() === String(want).toLowerCase());
  const voiceId = hit ? voices[hit] : /^[A-Za-z0-9]{20}$/.test(want) ? want : null;
  if (!voiceId) throw new Error(`Voice ElevenLabs "${want}" tidak dikenal. Pilihan: ${Object.keys(voices).join(", ")} (atau voice_id 20 karakter).`);
  const model = meta.model || el.model || "eleven_v4";
  const tagModel = /eleven_v[3-9]/.test(model); // model yang memahami tag ekspresi [excited], [sigh], ...
  const usePron = el.pronounce !== false;
  // teks: pasangan .txt (narasi + tag), satu paragraf per ide
  let text = readFileSync(plainPath, "utf8").replace(/\r/g, "").trim();
  if (!tagModel) text = text.replace(/\[[^\]]*\]\s*/g, "");
  if (usePron) text = speak(text);
  const vs = {
    stability: parseFloat(meta.stability ?? el.stability ?? 0.5),
    similarity_boost: parseFloat(el.similarityBoost ?? 0.75),
    ...(el.style !== undefined ? { style: el.style } : {}),
    ...(el.speakerBoost !== undefined ? { use_speaker_boost: el.speakerBoost } : {}),
  };
  const spd = parseFloat(meta.speed ?? el.speed ?? 1);
  if (spd !== 1) vs.speed = spd;
  const v4 = /eleven_v4/.test(model); // v4 hanya memakai stability + similarity (tanpa style/speed)
  const sdkSettings = {
    stability: vs.stability,
    similarityBoost: vs.similarity_boost,
    ...(!v4 && vs.style !== undefined ? { style: vs.style } : {}),
    ...(!v4 && vs.use_speaker_boost !== undefined ? { useSpeakerBoost: vs.use_speaker_boost } : {}),
    ...(!v4 && vs.speed !== undefined ? { speed: vs.speed } : {}),
  };
  if (v4 && (vs.speed !== undefined || vs.style !== undefined)) console.warn("! Eleven v4 mengabaikan speed/style; atur tempo lewat tanda baca dan tag.");
  const fmt = el.outputFormat || "mp3_44100_128";
  // potong per paragraf bila melebihi batas karakter model
  const limit = el.maxChars ?? (/eleven_v3/.test(model) ? 4500 : 9000);
  const parts = [];
  for (const p of text.split(/\n\s*\n/)) {
    if (parts.length && (parts.at(-1) + "\n\n" + p).length <= limit) parts[parts.length - 1] += "\n\n" + p;
    else parts.push(p);
  }
  const files = [];
  let need = 0;
  const jobs = parts.map((p, i) => {
    const h = createHash("sha1").update(JSON.stringify([p, voiceId, model, el.languageCode, vs, fmt, el.seed])).digest("hex").slice(0, 10);
    const f = path.join(cache, `el${i + 1}-${h}.mp3`);
    if (force || !existsSync(f)) need += p.length;
    return { p, f };
  });
  if (need) {
    // cek kuota karakter sebelum memakai kredit
    try {
      const q = await quota();
      console.log(`ElevenLabs: butuh ${need} karakter, sisa kuota ${q.left} (${q.tier}).`);
      if (q.left < need) throw new Error(`Kuota karakter ElevenLabs tidak cukup (butuh ${need}, sisa ${q.left}).`);
    } catch (e) {
      if (/Kuota/.test(e.message)) throw e;
    }
  }
  for (const [i, { p, f }] of jobs.entries()) {
    const label = `ElevenLabs ${hit ?? voiceId} · ${model} · bagian ${i + 1}/${jobs.length}`;
    if (!force && existsSync(f)) {
      console.log(`${label}: dari cache`);
    } else {
      const t0 = Date.now();
      process.stdout.write(`${label} (${p.length} karakter): `);
      const opt = { modelId: model, voiceSettings: sdkSettings, outputFormat: fmt };
      if (el.languageCode) opt.languageCode = el.languageCode;
      if (el.seed !== undefined) opt.seed = el.seed;
      // request stitching: bagian sebelum/sesudah ikut dikirim agar sambungan antarbagian mulus
      if (i > 0) opt.previousText = parts[i - 1].slice(-400);
      if (i < parts.length - 1) opt.nextText = parts[i + 1].slice(0, 400);
      try {
        await ttsToFile(voiceId, p, opt, f);
      } catch (e) {
        if (isPaidPlanError(e))
          throw new Error(`Voice "${hit ?? voiceId}" adalah voice library: paket ElevenLabs free tidak boleh memakainya lewat API. Upgrade paket (min. Starter) atau pilih voice premade, mis. --voice=Sarah.`);
        throw new Error(`ElevenLabs gagal: ${errText(e)}`);
      }
      console.log(`${((Date.now() - t0) / 1000).toFixed(0)} dtk`);
    }
    files.push(f);
  }
  if (files.length === 1) extAudio = files[0];
  else {
    const list = path.join(cache, "el-concat.txt");
    writeFileSync(list, files.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"));
    extAudio = path.join(cache, "el-joined.wav");
    run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", extAudio]);
  }
  elLabel = `ElevenLabs ${hit ?? voiceId} (${model})`;
  Object.assign(el, { voiceName: hit ?? voiceId, voiceId, modelUsed: model });
  el.applied = usePron;
}

// Blok suara: scene berurutan dengan gaya sama, dipotong per ±maxBlockSeconds agar tiap take bisa dinilai.
const maxBlock = cfg.maxBlockSeconds ?? 18;
const estSec = (t) => t.length / 14;
const blocks = [];
for (const [i, sc] of scenes.entries()) {
  const last = blocks.at(-1);
  if (last && last.style === sc.style && last.est + estSec(sc.text) <= maxBlock) {
    last.scenes.push(i);
    last.est += estSec(sc.text);
  } else blocks.push({ style: sc.style, scenes: [i], est: estSec(sc.text) });
}
const tts = cfg.tts ?? {};
const takes = Math.max(1, parseInt(meta.takes ?? tts.takes ?? 2));

const refHash = createHash("sha1").update(readFileSync(refPath)).update(refText).digest("hex").slice(0, 8);
const segs = [];
for (const [bi, b] of (extAudio ? [] : blocks).entries()) {
  const text = speak(b.scenes.map((i) => scenes[i].text).join(" "));
  const st = styles[b.style];
  const label = `Blok ${bi + 1}/${blocks.length} (scene ${b.scenes[0] + 1}-${b.scenes.at(-1) + 1}${b.style !== "normal" ? `, ${b.style}` : ""})`;
  const key = createHash("sha1")
    .update(JSON.stringify([text, refHash, narrator.seed, language, speed, tts, takes]))
    .digest("hex")
    .slice(0, 10);
  const raw = path.join(cache, `b${bi + 1}-${key}.best.wav`);
  const seg = path.join(cache, `b${bi + 1}-${key}.seg.wav`);
  if (force || !existsSync(raw)) {
    let best = null;
    for (let k = 0; k < takes; k++) {
      const seed = narrator.seed + k * 101;
      const t0 = Date.now();
      process.stdout.write(`${label} take ${k + 1}/${takes}: `);
      const form = new FormData();
      form.set("text", text);
      form.set("language", language);
      form.set("speed", String(speed));
      form.set("seed", String(seed));
      form.set("ref_text", refText);
      form.set("ref_audio", new Blob([readFileSync(refPath)], { type: "audio/wav" }), "narator.wav");
      for (const f of ["num_step", "guidance_scale", "class_temperature", "position_temperature", "effect_preset"])
        if (tts[f] !== undefined) form.set(f, String(tts[f]));
      const res = await fetch(`${cfg.ttsUrl}/generate`, {
        method: "POST",
        body: form,
        headers: { "X-OmniVoice-Client-Id": "claude-code" },
        signal: AbortSignal.timeout(30 * 60 * 1000),
      });
      if (!res.ok) throw new Error(`TTS gagal (${res.status}): ${(await res.text()).slice(0, 300)}`);
      const takePath = path.join(cache, `b${bi + 1}-${key}.take${k + 1}.wav`);
      writeFileSync(takePath, Buffer.from(await res.arrayBuffer()));
      const sc = JSON.parse(execFileSync(PY, [TOOLS, "score", refPath, takePath, "--lang", language], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
      console.log(`${((Date.now() - t0) / 1000).toFixed(0)} dtk | jelas ${sc.asr_prob_mean} | ekspresi ${sc.pitch_std_st} st | mirip ${sc.similarity} | skor ${sc.score}`);
      if (!best || sc.score > best.score) best = { ...sc, takePath };
    }
    copyFileSync(best.takePath, raw);
  } else {
    console.log(`${label}: dari cache`);
  }
  const src = raw;
  // Trim hening lembut (sisakan 60 ms) + fade 10 ms di kedua tepi, lalu gain LINEAR ke target loudness.
  // (loudnorm dinamis menimbulkan "pumping": awal blok pelan lalu naik, terdengar tersendat.)
  const trim = "silenceremove=start_periods=1:start_silence=0.06:start_threshold=-50dB";
  const trimmed = seg.replace(/\.seg\.wav$/, ".trim.wav");
  run("ffmpeg", ["-v", "error", "-y", "-i", src, "-af", `${trim},areverse,${trim},areverse,afade=t=in:d=0.01,areverse,afade=t=in:d=0.01,areverse`, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", trimmed]);
  const gain = (st.lufs ?? -16) - measureLufs(trimmed);
  const pad = bi < blocks.length - 1 ? (blocks[bi + 1].style !== b.style ? (cfg.styleGapSeconds ?? 0.6) : (cfg.blockGapSeconds ?? 0.3)) : 0;
  run("ffmpeg", ["-v", "error", "-y", "-i", trimmed, "-af", `volume=${gain.toFixed(2)}dB,apad=pad_dur=${pad}`, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", seg]);
  segs.push(seg);
}

const tail = cfg.tailSeconds ?? 1.0;
const out = paths.voice;
if (extAudio) {
  // audio luar tidak dipotong/diberi jeda: hanya 44.1 kHz mono + gain linear ke target loudness + ekor hening
  const conv = path.join(cache, "external.wav");
  run("ffmpeg", ["-v", "error", "-y", "-i", extAudio, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", conv]);
  const gain = (styles.normal?.lufs ?? -16) - measureLufs(conv);
  run("ffmpeg", ["-v", "error", "-y", "-i", conv, "-af", `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false,apad=pad_dur=${tail}`, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
  console.log(`${elLabel || `Audio luar: ${path.basename(extAudio)}`} (gain ${gain.toFixed(1)} dB)`);
} else {
  const list = path.join(cache, "concat.txt");
  writeFileSync(list, segs.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join("\n"));
  const joined = path.join(cache, "joined.wav");
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
  run("ffmpeg", ["-v", "error", "-y", "-i", joined, "-af", `alimiter=limit=0.89:level=false,apad=pad_dur=${tail}`, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", out]);
}
const baseTotal = duration(out);

// --- Sinkron: transkripsi per kata lalu cocokkan ke naskah ---
process.stdout.write("Menyelaraskan kata dengan audio... ");
const prompt = scenes.map((s) => s.text).join(" ");
const asr = JSON.parse(execFileSync(PY, [TOOLS, "words", out, "--lang", language, "--prompt", prompt], { encoding: "utf8", maxBuffer: 64e6 }));
const display = scenes.map((sc) => sc.text.split(/\s+/).filter(Boolean));
const toks = [];
// audio luar (--audio) tidak dibacakan lewat kamus pelafalan, jadi dicocokkan dengan teks asli
display.forEach((words, si) => words.forEach((w, wi) => normTokens(extAudio && !el.applied ? w : speak(w)).forEach((t) => toks.push({ t, si, wi }))));
// ejaan ASR yang keliru untuk istilah tertentu (config "asrAlias", mis. "kloud" -> "Cloud")
const asrAlias = { ...(cfg.asrAlias ?? {}), ...(profile?.asrAlias ?? {}) };
const { times, matched, total: nTok } = alignTokens(
  toks.map((x) => x.t),
  asr.map((w) => ({ ...w, w: asrAlias[normTokens(w.w).join("")] ?? w.w })),
);
console.log(`${matched}/${nTok} token cocok (${Math.round((matched / nTok) * 100)}%)`);

const wordTimes = display.map((words) => words.map(() => ({ s: Infinity, e: 0, guessed: true })));
toks.forEach((x, k) => {
  const wt = wordTimes[x.si][x.wi];
  wt.s = Math.min(wt.s, times[k].s);
  wt.e = Math.max(wt.e, times[k].e);
  wt.guessed = wt.guessed && !!times[k].guessed;
});

// Jeda napas ("> jeda: x"): sisipkan hening di antara scene, lalu geser waktu semua kata sesudahnya.
// Titik paling hening (RMS 20 ms terendah) di antara akhir kata dan awal kata berikutnya.
const quietest = (a, b) => {
  const json = execFileSync(PY, [TOOLS, "quiet", out, `${a.toFixed(3)}:${Math.max(a + 0.05, b).toFixed(3)}`], { encoding: "utf8" });
  return JSON.parse(json)[0];
};
const inserts = scenes
  .map((sc, si) => ({ si, sec: sc.pause }))
  .filter((x) => !userAudio && x.sec > 0 && x.si < scenes.length - 1)
  .map(({ si, sec }) => ({ at: quietest(wordTimes[si].at(-1).e, wordTimes[si + 1][0].s), sec }));
let total = baseTotal;
if (inserts.length) {
  const shift = (t) => t + inserts.filter((x) => x.at < t).reduce((a, x) => a + x.sec, 0);
  for (const wt of wordTimes) for (const w of wt) [w.s, w.e] = [shift(w.s), shift(w.e)];
  const filt = [];
  let prev = 0;
  inserts.forEach((x, k) => {
    const len = x.at - prev;
    filt.push(
      `[0]atrim=${prev}:${x.at},asetpts=PTS-STARTPTS,afade=t=in:d=${k ? 0.01 : 0},afade=t=out:st=${Math.max(0, len - 0.01)}:d=0.01[a${k}]`,
      `aevalsrc=0:d=${x.sec}:s=44100[z${k}]`,
    );
    prev = x.at;
  });
  filt.push(`[0]atrim=${prev},asetpts=PTS-STARTPTS,afade=t=in:d=0.01[last]`);
  const parts = inserts.map((_, k) => `[a${k}][z${k}]`).join("") + "[last]";
  filt.push(`${parts}concat=n=${inserts.length * 2 + 1}:v=0:a=1[o]`);
  const tmp = path.join(cache, "paused.wav");
  run("ffmpeg", ["-v", "error", "-y", "-i", out, "-filter_complex", filt.join(";"), "-map", "[o]", "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", tmp]);
  copyFileSync(tmp, out);
  total = duration(out);
  console.log(`Jeda napas: ${inserts.length} titik, +${inserts.reduce((a, x) => a + x.sec, 0).toFixed(1)} dtk`);
}

const lead = cfg.leadSeconds ?? 0.12;
const startSec = wordTimes.map((wt, si) => {
  if (si === 0) return 0;
  const prevEnd = wordTimes[si - 1].at(-1).e;
  return Math.max(prevEnd, wt[0].s - lead);
});
const totalFrames = Math.round(total * FPS);
const timed = scenes.map((sc, si) => {
  const startFrame = Math.round(startSec[si] * FPS);
  const endFrame = si < scenes.length - 1 ? Math.round(startSec[si + 1] * FPS) : totalFrames;
  return {
    index: si,
    text: sc.text,
    style: sc.style,
    startFrame,
    durationFrames: Math.max(15, endFrame - startFrame),
    words: display[si].map((w, wi) => ({
      w,
      f: Math.round(wordTimes[si][wi].s * FPS) - startFrame,
      e: Math.round(wordTimes[si][wi].e * FPS) - startFrame,
      ...(wordTimes[si][wi].guessed ? { guessed: true } : {}),
    })),
  };
});

const report = timed.map((t) => {
  const g = t.words.filter((w) => w.guessed).length;
  return { scene: t.index + 1, mulai: (t.startFrame / FPS).toFixed(2), durasi: (t.durationFrames / FPS).toFixed(2), kataTebakan: g };
});
// Jangkar suara: rekaman 20 dtk pertama dari pemakaian PERTAMA voice+model ini. Video berikutnya dengan voice yang
// sama dibandingkan dengan jangkar ini di QA, sehingga perubahan karakter suara antar-video ketahuan.
let anchor = null;
if (provider === "elevenlabs") {
  const dirA = path.join(ENGINE, "voices", "elevenlabs", "anchor");
  mkdirSync(dirA, { recursive: true });
  const f = path.join(dirA, `${el.voiceName}-${el.modelUsed}.wav`.replace(/[^\w.-]+/g, "-"));
  const isNew = !existsSync(f);
  if (isNew) run("ffmpeg", ["-v", "error", "-y", "-i", out, "-t", String(Math.min(20, total)), "-ar", "16000", "-ac", "1", f]);
  anchor = { path: path.relative(ENGINE, f), from: isNew ? name : "video sebelumnya" };
  console.log(isNew ? `Jangkar suara baru: ${anchor.path}` : `Jangkar suara: ${anchor.path} (dibandingkan saat QA)`);
}
writeFileSync(
  paths.timing,
  JSON.stringify({ fps: FPS, totalFrames, audio: `audio/${name}.wav`, provider, ...(extAudio ? { external: elLabel || path.basename(extAudio) } : {}), ...(anchor ? { voiceAnchor: anchor } : {}), ...(profileName ? { profile: profileName } : {}), scenes: timed }, null, 2),
);
console.table(report);
const lowScenes = report.filter((r, i) => r.kataTebakan > timed[i].words.length * 0.4);
if (matched / nTok < 0.85 || lowScenes.length)
  console.warn(`! Sinkron kurang yakin di scene: ${lowScenes.map((r) => r.scene).join(", ") || "-"}. Dengarkan / cek ejaan naskah.`);
console.log(`\nSelesai: ${path.relative(process.cwd(), out)} (${total.toFixed(1)} detik, ${scenes.length} scene)`);
