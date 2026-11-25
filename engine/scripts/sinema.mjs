// Mode film (style Sinema): raw film -> video "cinema story" 9:16 (footage persegi, subtitle dialog kata per kata,
// 3 narasi pencerita diucapkan, babak aksi cepat, montase di ketukan musik, flash penutup). Rincian: styles/sinema/STYLE.md.
//
//   npm run sinema -- --new --film=<file> --judul="Judul Film" [--tahun=2024] [--genre=animasi|action|fantasi|romance|drama]
//                     [--musik=<lagu>] [--srt=<subtitle film>] [--brand=feminine-allure] [--slug=...]
//                                         proyek baru: Projects/<nama>/sinema.json (+ brief.md)
//   npm run sinema -- <nama> --analyze [--step=5]
//                                         tahap 1 tanpa biaya: potongan, gerak, ucapan, jendela dialog/aksi, lembar kontak
//   npm run sinema -- <nama> --sheet=<dari>-<sampai>[:langkah]
//                                         lembar kontak rapat satu rentang (mis. --sheet=1:02:10-1:02:40:1)
//   npm run sinema -- <nama> --transkrip [--estimate | --ukur]
//                                         tahap 2: transkrip kata per kata HANYA rentang "kandidat" (ElevenLabs Scribe, kredit)
//                                         atau gratis dari film.srt. --ukur = ukur kredit 60 dtk pertama lalu simpan tarifnya
//   npm run sinema -- <nama> --storyboard [--suara-uji]
//                                         potong + preview + Projects/<nama>/sinema/storyboard.md (tanpa kredit) -> disetujui pengguna
//   npm run sinema -- <nama> --audisi --voices=A,B,C [--teks="..."]
//                                         audisi narator dengan kalimat narasi (kredit ±karakter × voice)
//   npm run sinema -- <nama> [--suara-uji] narasi (ElevenLabs; --suara-uji = suara macOS gratis untuk uji) -> potong -> audio
//                                         -> render -> Result/<brand>/<nama>/ (+ posting bila posting/caption.md ada)
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DIRS, ENGINE, LOCAL_CONFIG, NAME_RE, P, ROOT, archiveResult, brandProfile, config, duration, encodeFor, loadStyle, readJson, resolveName, run } from "./lib.mjs";

const args = process.argv.slice(2);
const has = (k) => args.includes(`--${k}`);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const PY = path.join(ENGINE, ".venv", "bin", "python");
const TOOLS = path.join(ENGINE, "scripts", "sinema_tools.py");
const FPS = 30;
const rel = (f) => path.relative(ROOT, f);
const say = (m) => console.log(`\n▶ ${m}`);
let warns = 0;
const warn = (m) => (warns++, console.log(`  ! ${m}`));
const hms = (t) => `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
const hash = (o) => createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 12);
const toSec = (v) => {
  if (typeof v === "number") return v;
  const p = String(v).trim().split(":").map(Number);
  if (p.some((x) => Number.isNaN(x))) throw new Error(`Waktu tidak dikenal: "${v}" (pakai detik atau h:mm:ss.s)`);
  return p.reduce((a, x) => a * 60 + x, 0);
};
const py = (argv) => {
  const r = spawnSync(PY, [TOOLS, ...argv], { cwd: ENGINE, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`sinema_tools.py ${argv[0]} gagal`);
  return r.stdout.trim().split("\n").at(-1);
};
const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40);
const clean = (w) => w.replace(/[^\p{L}\p{N}'’-]/gu, "").replace(/^[-']+|[-']+$/g, "");
const normTok = (w) => clean(w).toLowerCase().replace(/’/g, "'");

// ------------------------------------------------------------------ --new
if (has("new")) {
  const film = opt("film") && path.resolve(opt("film"));
  if (!film || !existsSync(film)) throw new Error("Pemakaian: npm run sinema -- --new --film=<file film> --judul=\"Judul\" [--genre=..] [--musik=<lagu>]");
  const judul = opt("judul");
  if (!judul) throw new Error("--judul wajib (judul film, untuk riset sinopsis & konteks)");
  const brand = opt("brand") ?? "feminine-allure";
  const prof = brandProfile(brand);
  if (!prof) console.log(`! Profil brand "${brand}" belum ada di Brands/; proyek tetap dibuat.`);
  const d = new Date();
  const day = opt("tanggal") ?? `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const nn = (existsSync(DIRS.projects) ? readdirSync(DIRS.projects) : []).filter((n) => n.startsWith(`${day}-`)).map((n) => parseInt(n.split("-")[1]) || 0).reduce((a, b) => Math.max(a, b), 0) + 1;
  const name = `${day}-${String(nn).padStart(2, "0")}-${opt("slug") ?? slugify(`${brand.split("-")[0]}-${judul}`)}`;
  if (!NAME_RE.test(name)) throw new Error(`Nama proyek tidak valid: ${name}`);
  const dir = path.join(DIRS.projects, name);
  mkdirSync(path.join(dir, "sinema"), { recursive: true });
  mkdirSync(path.join(dir, "posting"), { recursive: true });
  const spec = {
    _doc: "Spesifikasi edit Sinema. Waktu boleh detik atau h:mm:ss.s (waktu FILM). Urutan shots = urutan di video. Rincian: Engine/styles/sinema/STYLE.md",
    profile: brand,
    style: opt("style") ?? prof?.style ?? "sinema",
    film: { path: film, judul, tahun: opt("tahun") ? Number(opt("tahun")) : null, genre: opt("genre") ?? null, bahasa: opt("bahasa") ?? prof?.bahasa ?? "en", srt: opt("srt") ? path.resolve(opt("srt")) : null },
    musik: opt("musik") ? { file: path.resolve(opt("musik")), drop: "auto", dropDi: "narasi2" } : null,
    narator: null,
    kandidat: [],
    shots: [],
    narasi: [],
    montase: { shots: [] },
    kunci: [],
    emosi: [],
    cover: null,
  };
  writeFileSync(path.join(dir, "sinema.json"), JSON.stringify(spec, null, 2) + "\n");
  writeFileSync(path.join(dir, "brief.md"), `# ${name}\n\n- Jenis: edit film (style Sinema), brand ${brand}\n- Film: ${judul}${spec.film.tahun ? ` (${spec.film.tahun})` : ""} · genre ${spec.film.genre ?? "-"} · ${film}\n- Musik: ${spec.musik?.file ?? "-"}\n- Dibuat ${new Date().toISOString().slice(0, 10)}\n`);
  console.log(`Proyek: ${rel(dir)}\nBerikutnya: npm run sinema -- ${name} --analyze`);
  process.exit(0);
}

// ------------------------------------------------------------------ proyek
const name = resolveName(args.find((a) => !a.startsWith("--")));
const paths = P(name);
const SPEC = path.join(paths.dir, "sinema.json");
const spec = readJson(SPEC, null);
if (!spec) throw new Error(`Bukan proyek sinema (tidak ada ${rel(SPEC)}). Buat dengan: npm run sinema -- --new --film=...`);
const st = loadStyle(spec.style ?? "sinema");
const prof = brandProfile(spec.profile) ?? {};
const W = path.join(paths.work, "sinema");
const PD = path.join(paths.dir, "sinema");
for (const d of [W, PD]) mkdirSync(d, { recursive: true });
const film = spec.film?.path;
if (!film || !existsSync(film)) throw new Error(`File film tidak ditemukan: ${film}`);
const AN = path.join(W, "analysis.json");
const WORDS = path.join(W, "words.json");
const filmMtime = statSync(film).mtimeMs;
const filmDur = duration(film);

// ------------------------------------------------------------------ --analyze
if (has("analyze")) {
  say("Analisis film (tanpa biaya)");
  console.log("  " + py(["analyze", "--film", film, "--out", W, "--step", String(opt("step") ?? 5), "--sheets", path.join(PD, "kontak")]));
  const a = readJson(AN);
  if (a.hdr) warn("film HDR: warna bisa pucat (ffmpeg di sini tanpa zscale); pakai versi SDR bila ada");
  for (const k of ["dialog", "aksi"]) {
    console.log(`\n  Jendela ${k} teratas:`);
    for (const w of a.windows[k]) console.log(`    ${w.jam}  skor ${w.skor}  ucapan ${w.speech}  potongan/mnt ${w.cpm}`);
  }
  console.log(`\n  Lembar kontak: ${rel(path.join(PD, "kontak"))}/ (${a.sheets.length} lembar, tiap ${a.step} dtk)`);
  const kf = path.join(PD, "konteks.md");
  if (!existsSync(kf))
    writeFileSync(kf, `# Konteks film: ${spec.film.judul}${spec.film.tahun ? ` (${spec.film.tahun})` : ""}\n\n## Sinopsis singkat (sumber)\n\n## Tokoh (nama · peran · ciri visual)\n\n## Konflik inti\n\n## Kandidat momen (waktu film)\n- Konfrontasi (dialog, babak 1):\n- Aksi / puncak (babak 2):\n- Momen lucu / twist / haru (narasi 3):\n- Ikonik / kemenangan (montase):\n\n## Nada narasi (genre ${spec.film.genre ?? "-"})\n`);
  console.log(`  Isi ${rel(kf)} (riset sinopsis + lembar kontak), lalu tulis "kandidat" di sinema.json dan jalankan --transkrip`);
  process.exit(0);
}

const active = () => readJson(AN, null)?.active ?? (() => {
  const [w, h] = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", film]).trim().split(",").map(Number);
  warn("analisis belum ada: area gambar dianggap penuh (jalankan --analyze untuk mendeteksi letterbox)");
  return { x: 0, y: 0, w, h };
})();

// ------------------------------------------------------------------ --sheet
if (opt("sheet")) {
  const m = opt("sheet").match(/^([\d:.]+)-([\d:.]+?)(?::(\d*\.?\d+))?$/);
  if (!m) throw new Error("Format: --sheet=<dari>-<sampai>[:langkah], mis. --sheet=1:02:10-1:02:40:1 atau --sheet=3730-3760");
  // "1:02:10-1:02:40:1": langkah = bagian terakhir bila ada 4+ bagian di sisi kanan
  let [a, b, step] = [toSec(m[1]), m[2], m[3]];
  const bp = b.split(":");
  if (!step && bp.length > 3) step = bp.pop();
  b = toSec(bp.join(":"));
  step = Number(step ?? 1);
  const times = [];
  for (let t = a; t <= b + 1e-6 && times.length < 96; t += step) times.push(t.toFixed(2));
  const ac = active();
  const out = path.join(PD, "kontak", `detail-${Math.round(a)}-${Math.round(b)}.jpg`);
  mkdirSync(path.dirname(out), { recursive: true });
  py(["sheet", "--film", film, "--times", times.join(","), "--out", out, "--crop", `${ac.w}:${ac.h}:${ac.x}:${ac.y}`]);
  console.log(rel(out));
  process.exit(0);
}

// ------------------------------------------------------------------ transkrip
const parseSrt = (txt) =>
  txt.replace(/\r/g, "").replace(/^\uFEFF/, "").split(/\n\s*\n/).map((b) => {
    const lines = b.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    const m = i >= 0 && lines[i].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return null;
    const t = (h, mi, s, ms) => +h * 3600 + +mi * 60 + +s + +ms / 1000;
    const text = lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").replace(/(^|\s)-\s+/g, " ").replace(/\[[^\]]*\]|\([^)]*\)/g, "").trim();
    return text ? { s: t(m[1], m[2], m[3], m[4]), e: t(m[5], m[6], m[7], m[8]), text } : null;
  }).filter(Boolean);
/** Kata dibagi rata (bobot panjang huruf) di dalam rentang [s, e]. */
const spread = (text, s, e) => {
  const toks = text.split(/\s+/).filter((w) => clean(w));
  const wt = toks.map((w) => clean(w).length + 1.5);
  const tot = wt.reduce((a, b) => a + b, 0) || 1;
  let t = s;
  return toks.map((w, i) => {
    const d = ((e - s) * wt[i]) / tot;
    const o = { w, s: +t.toFixed(3), e: +(t + d * 0.92).toFixed(3) };
    t += d;
    return o;
  });
};
const writeTranscriptMd = (words, ranges) => {
  const lines = [`# Transkrip ${spec.film.judul} (waktu film)\n`, "Sumber: " + (spec.film.srt ? "file SRT" : "ElevenLabs Scribe") + ". Pilih kalimat untuk shots di sinema.json.\n"];
  for (const r of ranges) {
    lines.push(`\n## ${r.id ?? "rentang"} · ${hms(r.a)}-${hms(r.b)}${r.isi ? ` · ${r.isi}` : ""}\n`);
    let cur = [];
    const flush = () => {
      if (cur.length) lines.push(`- [${hms(cur[0].s)}-${hms(cur.at(-1).e)}] ${cur.map((x) => x.w).join(" ")}`);
      cur = [];
    };
    for (const w of words.filter((x) => x.s >= r.a && x.s < r.b)) {
      if (cur.length && (w.s - cur.at(-1).e > 0.8 || cur.length >= 14)) flush();
      cur.push(w);
      if (/[.!?…]["']?$/.test(w.w)) flush();
    }
    flush();
  }
  const f = path.join(PD, "transkrip.md");
  writeFileSync(f, lines.join("\n") + "\n");
  return f;
};
const kandidatRanges = () => {
  const rs = (spec.kandidat ?? []).map((k, i) => ({ id: k.id ?? `k${i + 1}`, isi: k.isi, a: toSec(k.t[0]), b: Math.min(filmDur, toSec(k.t[1])) })).sort((x, y) => x.a - y.a);
  const merged = [];
  for (const r of rs) {
    const last = merged.at(-1);
    if (last && r.a <= last.b + 2) (last.b = Math.max(last.b, r.b)), (last.id += `+${r.id}`);
    else merged.push({ ...r });
  }
  return merged;
};
const audioChunk = (a, len, file) =>
  run("ffmpeg", ["-v", "error", "-y", "-ss", a.toFixed(3), "-t", len.toFixed(3), "-i", film, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-b:a", "48k", file]);

if (has("transkrip")) {
  const lang = spec.film.bahasa ?? "en";
  if (spec.film.srt) {
    say("Transkrip dari SRT (gratis)");
    const cues = parseSrt(readFileSync(spec.film.srt, "utf8"));
    const words = cues.flatMap((c) => spread(c.text, c.s, c.e));
    writeFileSync(WORDS, JSON.stringify(words));
    const ranges = kandidatRanges();
    const f = writeTranscriptMd(words, ranges.length ? ranges : [{ id: "film", a: 0, b: filmDur }]);
    console.log(`  ${cues.length} baris, ${words.length} kata -> ${rel(f)} (waktu kata = perkiraan rata per baris SRT)`);
    process.exit(0);
  }
  const ranges = kandidatRanges();
  if (!ranges.length) throw new Error('Isi "kandidat" di sinema.json dulu: [{"id":"konfrontasi","t":["1:02:10","1:04:00"],"isi":"..."}] (dari --analyze + konteks.md)');
  const minutes = ranges.reduce((a, r) => a + (r.b - r.a), 0) / 60;
  const rate = config().sinema?.sttCreditsPerMin ?? null;
  const est = rate ? Math.ceil(minutes * rate) : null;
  console.log(`  ${ranges.length} rentang, total ${minutes.toFixed(1)} menit audio · ${rate ? `±${est} kredit (tarif terukur ${rate}/menit)` : "tarif belum diukur (jalankan --ukur, ±60 dtk audio)"}`);
  if (has("estimate")) process.exit(0);
  const { quota, transcribe } = await import("./eleven.mjs");
  const sttDir = path.join(W, "stt");
  mkdirSync(sttDir, { recursive: true });
  const doChunk = async (a, b) => {
    const key = hash([film, filmMtime, a, b, lang, "scribe_v2"]);
    const jf = path.join(sttDir, `${key}.json`);
    if (existsSync(jf)) return readJson(jf);
    const af = path.join(sttDir, `${key}.mp3`);
    audioChunk(a, b - a, af);
    const ws = (await transcribe(af, lang)).map((w) => ({ w: w.w, s: +(w.s + a).toFixed(3), e: +(w.e + a).toFixed(3), p: w.p }));
    writeFileSync(jf, JSON.stringify(ws));
    return ws;
  };
  if (has("ukur")) {
    const r = ranges[0];
    const b = Math.min(r.b, r.a + 60);
    const q0 = await quota();
    await doChunk(r.a, b);
    const q1 = await quota();
    const per = +(((q1.used - q0.used) / ((b - r.a) / 60)) || 0).toFixed(1);
    const lc = readJson(LOCAL_CONFIG, {});
    lc.sinema = { ...(lc.sinema ?? {}), sttCreditsPerMin: per };
    writeFileSync(LOCAL_CONFIG, JSON.stringify(lc, null, 2) + "\n");
    console.log(`  Terukur: ${q1.used - q0.used} kredit untuk ${(b - r.a).toFixed(0)} dtk -> ${per} kredit/menit (disimpan). Semua kandidat: ±${Math.ceil(per * minutes)} kredit, sisa kuota ${q1.left}.`);
    process.exit(0);
  }
  const q = await quota();
  if (est && q.left < est * 1.1) throw new Error(`Kuota ElevenLabs tidak cukup: perlu ±${est}, sisa ${q.left}. Persempit kandidat atau pakai --srt.`);
  say(`Transkrip ${minutes.toFixed(1)} menit (ElevenLabs Scribe)`);
  const all = [];
  for (const r of ranges)
    for (let a = r.a; a < r.b - 0.5; a += 300) {
      const ws = await doChunk(a, Math.min(r.b, a + 300));
      for (const w of ws) if (!all.length || w.s >= all.at(-1).e - 0.02) all.push(w);
    }
  writeFileSync(WORDS, JSON.stringify(all));
  const q2 = await quota();
  const f = writeTranscriptMd(all, ranges);
  console.log(`  ${all.length} kata -> ${rel(f)} · kredit terpakai ${q2.used - q.used}, sisa ${q2.left}`);
  process.exit(0);
}

// ------------------------------------------------------------------ narator
const genre = spec.film.genre ?? "action";
const gender = spec.naratorGender ?? prof.narator?.genre?.[genre] ?? "pria";
const UJI = has("suara-uji") || spec.suaraUji === true;

if (has("audisi")) {
  const voices = opt("voices");
  if (!voices) throw new Error("--voices=A,B,C wajib (nama di config elevenlabs.voices atau voice_id); cari kandidat: npm run voices -- --library [--gender=..]");
  const teks = opt("teks") ?? (spec.narasi ?? []).map((n) => n.text).join(" ... ");
  if (!teks) throw new Error("--teks wajib bila narasi belum ditulis");
  console.log(`Audisi ${voices.split(",").length} voice × ${teks.length} karakter (memakai kredit).`);
  const r = spawnSync(process.execPath, [path.join(ENGINE, "scripts", "voices.mjs"), `--sample=${voices}`, `--text=${teks}`, ...(spec.profile ? [`--profile=${spec.profile}`] : [])], { cwd: ENGINE, stdio: "inherit" });
  process.exit(r.status ?? 0);
}

/** Narasi -> [{text, kunci, file, dur, words:[{w,s,e}]}] (cache per teks+voice). estimateOnly: tanpa audio baru. */
const narasi = async ({ estimateOnly = false } = {}) => {
  const list = spec.narasi ?? [];
  const nd = path.join(W, "narasi");
  mkdirSync(nd, { recursive: true });
  const out = [];
  const estimate = (n) => ({ ...n, file: null, dur: 0.35 + n.text.split(/\s+/).length * 0.36, words: null, est: true });
  if (UJI) {
    const voice = gender === "perempuan" ? "Samantha" : "Daniel";
    for (const n of list) {
      const f = path.join(nd, `uji-${hash([voice, n.text])}.wav`);
      if (!existsSync(f)) {
        const aiff = f.replace(/\.wav$/, ".aiff");
        execFileSync("say", ["-v", voice, "-r", "165", "-o", aiff, n.text]);
        run("ffmpeg", ["-v", "error", "-y", "-i", aiff, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-ar", "48000", "-ac", "2", f]);
      }
      const dur = duration(f);
      out.push({ ...n, file: f, dur, words: spread(n.text, 0.03, dur - 0.05), uji: true });
    }
    return out;
  }
  const el = config().elevenlabs ?? {};
  const nar = prof.narator ?? {};
  const want = spec.narator ?? nar[gender];
  const model = nar.model ?? el.model ?? "eleven_v3";
  const vs = nar.settings ?? null;
  const voiceId = want ? (Object.entries(el.voices ?? {}).find(([k]) => k.toLowerCase() === String(want).toLowerCase())?.[1] ?? (/^[A-Za-z0-9]{20}$/.test(want) ? want : null)) : null;
  const keyOf = (n) => hash([n.text, voiceId, model, vs, nar.seed]);
  const missing = list.filter((n) => !voiceId || !existsSync(path.join(nd, `${keyOf(n)}.mp3`)));
  const { alignmentWords } = await import("./eleven.mjs");
  const loadCached = (n) => {
    const f = path.join(nd, `${keyOf(n)}.mp3`);
    const dur = duration(f);
    return { ...n, file: f, dur, words: alignmentWords(readJson(f.replace(/\.mp3$/, ".json")), 0, dur).map(({ w, s, e }) => ({ w, s, e })) };
  };
  if (estimateOnly || !list.length) return list.map((n) => (missing.includes(n) ? estimate(n) : loadCached(n)));
  if (!voiceId) throw new Error(`Narator ${gender} belum dipilih: audisi dulu (npm run sinema -- ${name} --audisi --voices=A,B,C), lalu isi Brands/${spec.profile}/profile.json narator.${gender} (atau sinema.json "narator"). Uji gratis: --suara-uji`);
  if (missing.length) {
    const { quota, ttsWithTimestamps } = await import("./eleven.mjs");
    const chars = missing.reduce((a, n) => a + n.text.length, 0);
    const q = await quota();
    console.log(`  Narasi baru: ${missing.length} kalimat, ${chars} karakter (±${chars} kredit) · sisa kuota ${q.left}`);
    if (q.left < chars) throw new Error("Kuota ElevenLabs tidak cukup untuk narasi.");
    for (const n of missing) {
      const f = path.join(nd, `${keyOf(n)}.mp3`);
      const o = { modelId: model, outputFormat: "mp3_44100_128", ...(vs ? { voiceSettings: vs } : {}), ...(nar.seed !== undefined ? { seed: nar.seed } : {}) };
      const al = await ttsWithTimestamps(voiceId, n.text, o, f);
      writeFileSync(f.replace(/\.mp3$/, ".json"), JSON.stringify(al));
    }
  }
  return list.map(loadCached);
};

// ------------------------------------------------------------------ rencana timeline
const musicWav = path.join(W, "musik.wav");
const beatsOf = () => {
  if (!spec.musik?.file) return null;
  if (!existsSync(spec.musik.file)) throw new Error(`File musik tidak ditemukan: ${spec.musik.file}`);
  const key = hash([spec.musik.file, statSync(spec.musik.file).mtimeMs]);
  const bj = path.join(W, `beats-${key}.json`);
  if (!existsSync(musicWav) || !existsSync(bj)) {
    run("ffmpeg", ["-v", "error", "-y", "-i", spec.musik.file, "-map", "0:a:0", "-ar", "48000", "-ac", "2", musicWav]);
    execFileSync(PY, [path.join(ENGINE, "scripts", "edit_media.py"), "beats", "--audio", musicWav, "--out", bj], { cwd: ENGINE, stdio: ["ignore", "ignore", "inherit"] });
  }
  return readJson(bj);
};
const autoDrop = (b) => {
  const e = b.energy ?? [];
  let best = 0, at = b.beats[0] ?? 0;
  for (let i = 8; i < e.length - 8; i++) {
    if (b.beats[i] < 8) continue;
    const m = (a, z) => e.slice(a, z).reduce((x, y) => x + y, 0) / (z - a);
    const d = m(i, i + 8) - m(i - 8, i);
    if (d > best) (best = d), (at = b.beats[i]);
  }
  return at;
};

const plan = (narr) => {
  const fx = st.fx ?? {};
  const zoomOf = (z) => (z === "in" ? [1, fx.punchIn ?? 1.08] : z === "out" ? [fx.punchIn ?? 1.08, 1] : Array.isArray(z) ? z : [1, 1]);
  const A = st.audio ?? {};
  const shots = (spec.shots ?? []).map((s, i) => {
    const a = toSec(s.t[0]), b = toSec(s.t[1]);
    if (!(b > a)) throw new Error(`shot ${i + 1}: t[1] harus > t[0]`);
    const babak = s.babak ?? "dialog";
    const speed = s.speed ?? 1;
    return { i: i + 1, kind: "main", babak, a, b, speed, d: (b - a) / speed, cx: s.cx ?? 0.5, cy: s.cy ?? 0.5, scale: s.scale ?? 1, zoom: zoomOf(s.zoom), fx: s.fx ?? [], sub: s.sub ?? true, gain: s.audio ?? (babak === "dialog" ? 1 : 0.85), catatan: s.catatan ?? "" };
  });
  if (!shots.length) throw new Error('sinema.json "shots" masih kosong (lihat STYLE.md: babak dialog -> aksi -> montase)');
  let t = 0;
  for (const s of shots) (s.start = t), (t += s.d);
  const mainEnd = t;
  const N = (narr ?? []).map((n, k) => {
    const sh = shots[(n.shot ?? 1) - 1];
    if (!sh) throw new Error(`narasi ${k + 1}: shot ${n.shot} tidak ada`);
    return { ...n, k: k + 1, at: sh.start + (n.offset ?? 0.15) };
  });
  // musik: detik lagu "drop" jatuh di detik video "dropDi" (bawaan: awal narasi 2)
  const beats = beatsOf();
  let offset = 0, dropSec = null, dropAt = null;
  if (beats) {
    dropSec = spec.musik.drop == null || spec.musik.drop === "auto" ? autoDrop(beats) : toSec(spec.musik.drop);
    const dd = spec.musik.dropDi ?? "narasi2";
    const m = String(dd).match(/^narasi(\d)$/);
    dropAt = m ? (N[+m[1] - 1]?.at ?? shots.find((s) => s.babak === "aksi")?.start ?? 0) : toSec(dd);
    offset = spec.musik.mulai != null ? toSec(spec.musik.mulai) : dropSec - dropAt;
  }
  // montase di ketukan
  const M = st.babak?.montase ?? {};
  const mont = (spec.montase?.shots ?? []).map((s, k) => ({ i: shots.length + k + 1, kind: "montase", babak: "montase", a: toSec(s.t?.[0] ?? s.t), speed: s.speed ?? 1, cx: s.cx ?? 0.5, cy: s.cy ?? 0.5, scale: s.scale ?? 1, zoom: zoomOf(s.zoom ?? [1, 1.04]), fx: s.fx ?? [], sub: s.sub ?? false, gain: s.audio ?? A.filmUnderMontage ?? 0.15, catatan: s.catatan ?? "" }));
  if (mont.length) {
    let times = null;
    if (beats?.beats?.length) {
      const vb = beats.beats.map((b) => b - offset).filter((x) => x > 0.5);
      const ibi = vb.length > 2 ? (vb.at(-1) - vb[0]) / (vb.length - 1) : 0.63;
      let bps = spec.montase?.beatsPerShot ?? M.beatsPerShot ?? 1;
      while (ibi * bps < (M.shotSec?.[0] ?? 0.4)) bps *= 2;
      const i0 = vb.findIndex((x) => x >= mainEnd - 0.12);
      if (i0 >= 0 && i0 + mont.length * bps < vb.length) times = mont.map((_, k) => [vb[i0 + k * bps], vb[i0 + (k + 1) * bps]]);
      else warn("ketukan musik tidak cukup untuk montase: interval tetap 0,63 dtk");
    }
    if (!times) {
      const iv = spec.montase?.shotSec ?? 0.63;
      times = mont.map((_, k) => [mainEnd + k * iv, mainEnd + (k + 1) * iv]);
    }
    // shot utama terakhir diperpanjang sampai ketukan pertama montase
    const last = shots.at(-1);
    last.d += times[0][0] - mainEnd;
    mont.forEach((s, k) => ((s.start = times[k][0]), (s.d = times[k][1] - times[k][0]), (s.b = s.a + s.d * s.speed)));
  }
  const all = [...shots, ...mont];
  for (const s of all) {
    s.f0 = Math.round(s.start * FPS);
    s.f1 = Math.max(s.f0 + 1, Math.round((s.start + s.d) * FPS));
    s.src = (s.f1 - s.f0) / FPS * s.speed;
    if (s.a + s.src > filmDur + 0.05) warn(`shot ${s.i}: melewati akhir film`);
    const lim = (st.babak?.[s.babak]?.shotSec ?? [0, 99]);
    if (s.kind === "main" && (s.d < lim[0] - 0.05 || s.d > lim[1] + 0.05)) warn(`shot ${s.i} (${s.babak}) ${s.d.toFixed(2)} dtk di luar ${lim[0]}-${lim[1]} dtk`);
  }
  for (let k = 1; k < all.length; k++) all[k].f0 = all[k - 1].f1; // tanpa celah
  const totalFrames = all.at(-1).f1;
  const total = totalFrames / FPS;
  const E = fx.ending ?? { whipSec: 0.3, flashSec: 0.15, fadeSec: 0.6 };
  const ending = { whip: Math.round(E.whipSec * FPS), flash: Math.round(E.flashSec * FPS), fade: Math.round(E.fadeSec * FPS) };
  ending.f0 = totalFrames - ending.whip - ending.flash - ending.fade;
  // cek narasi
  const nz = st.narasi ?? {};
  if (N.length !== (nz.count ?? 3)) warn(`narasi ${N.length} titik (aturan style: ${nz.count ?? 3})`);
  N.forEach((n, k) => {
    const wc = n.text.split(/\s+/).length;
    if (nz.words && (wc < nz.words[0] || wc > nz.words[1])) warn(`narasi ${k + 1}: ${wc} kata (aturan ${nz.words[0]}-${nz.words[1]})`);
    if (n.at + n.dur > total - 0.3) warn(`narasi ${k + 1} melewati akhir video`);
    if (N[k + 1] && n.at + n.dur + 0.2 > N[k + 1].at) warn(`narasi ${k + 1} bertabrakan dengan narasi ${k + 2}`);
  });
  const dr = st.babak?.duration;
  if (dr && (total < dr[0] || total > dr[1])) warn(`durasi ${total.toFixed(1)} dtk di luar ${dr[0]}-${dr[1]} dtk`);
  return { shots: all, narr: N, totalFrames, total, ending, music: beats ? { offset, dropSec, dropAt, tempo: beats.tempo } : null };
};

// ------------------------------------------------------------------ kartu subtitle
const buildCards = (tl) => {
  const S = st.type?.subtitle ?? {};
  const maxW = S.wordsPerLine?.[1] ?? 4, maxC = S.maxChars ?? 22, maxL = S.lines ?? 2;
  const fw = readJson(WORDS, []);
  const words = [];
  for (const s of tl.shots) {
    if (s.sub === false) continue;
    const t0 = s.start, t1 = s.f1 / FPS;
    if (typeof s.sub === "string") {
      for (const w of spread(s.sub, t0 + 0.12, t1 - 0.25)) words.push({ ...w, src: "dialog", shot: s.i });
      continue;
    }
    for (const w of fw) {
      const mid = (w.s + w.e) / 2;
      if (mid < s.a || mid >= s.a + s.src) continue;
      words.push({ w: w.w, s: t0 + (w.s - s.a) / s.speed, e: Math.min(t1, t0 + (w.e - s.a) / s.speed), src: "dialog", shot: s.i });
    }
  }
  const nwin = tl.narr.map((n) => [n.at - 0.1, n.at + n.dur + 0.1]);
  const dialog = words.filter((w) => !nwin.some(([a, b]) => w.s >= a && w.s < b));
  const nar = tl.narr.flatMap((n) => (n.words ?? spread(n.text, 0.03, n.dur - 0.05)).map((w) => ({ w: w.w, s: n.at + w.s, e: n.at + w.e, src: `narasi${n.k}`, kunci: n.kunci })));
  const seq = [...dialog, ...nar].filter((w) => clean(w.w)).sort((a, b) => a.s - b.s);
  const layout = (ws) => {
    const lines = [[]];
    for (const w of ws) {
      const ln = lines.at(-1);
      const len = ln.map((x) => clean(x.w)).join(" ").length + clean(w.w).length + 1;
      if (ln.length && (ln.length >= maxW || len > maxC)) lines.push([w]);
      else ln.push(w);
    }
    return lines;
  };
  const cards = [];
  let cur = [];
  const flush = () => cur.length && (cards.push(cur), (cur = []));
  for (const w of seq) {
    const last = cur.at(-1);
    if (last && (w.src !== last.src || w.s - last.e > 0.7 || /[.!?…]["']?$/.test(last.w) || layout([...cur, w]).length > maxL)) flush();
    cur.push(w);
  }
  flush();
  // kata kunci: daftar "kunci" sinema.json / narasi.kunci; selain itu ujung kalimat (+ kata pendek sebelumnya)
  const phrases = (list) => (list ?? []).map((p) => String(p).split(/\s+/).map(normTok).filter(Boolean)).filter((p) => p.length);
  const globalKey = phrases(spec.kunci), emo = phrases(spec.emosi);
  const mark = (toks, list, val, kind) => {
    let n = 0;
    for (const p of list)
      for (let i = 0; i + p.length <= toks.length; i++)
        if (p.every((x, j) => toks[i + j] === x)) for (let j = 0; j < p.length; j++) if (!kind[i + j]) (kind[i + j] = val), n++;
    return n;
  };
  return cards.map((c, ci) => {
    const toks = c.map((w) => normTok(w.w));
    const kind = c.map(() => 0);
    mark(toks, emo, 2, kind);
    const nk = c[0].src.startsWith("narasi") ? phrases(c[0].kunci ? [c[0].kunci] : []) : [];
    const n = mark(toks, [...nk, ...globalKey], 1, kind);
    if (!n && !kind.some((k) => k) && S.autoKey === "ujung" && (!c[0].src.startsWith("narasi") || !nk.length)) {
      const L = c.length - 1;
      kind[L] = 1;
      if (L > 0 && clean(c[L - 1].w).length <= 3) kind[L - 1] = 1;
    }
    const next = cards[ci + 1];
    const f0 = Math.round(c[0].s * FPS);
    const end = Math.min(c.at(-1).e + 0.45, next ? next[0].s - 0.04 : Infinity, tl.ending.f0 / FPS);
    const f1 = Math.max(f0 + 6, Math.round(end * FPS));
    const ws = c.map((w, i) => ({ w: clean(w.w), raw: w.w, f: Math.max(f0, Math.round(w.s * FPS)), e: Math.round(w.e * FPS), k: kind[i] }));
    return { f0, f1, src: c[0].src, lines: layout(ws).map((ln) => ln.map(({ w, f, k }) => ({ w, f, k }))), words: ws };
  });
};

// ------------------------------------------------------------------ potong (ffmpeg)
const gradeVf = () => {
  const g = { ...(st.grade ?? {}), ...(spec.grade ?? {}) };
  const sh = g.shadows ?? {}, hi = g.highlights ?? {};
  return [
    `eq=contrast=${g.contrast ?? 1}:saturation=${g.saturation ?? 1}:brightness=${g.brightness ?? 0}:gamma=${g.gamma ?? 1}`,
    `colorbalance=rs=${sh.r ?? 0}:gs=${sh.g ?? 0}:bs=${sh.b ?? 0}:rh=${hi.r ?? 0}:gh=${hi.g ?? 0}:bh=${hi.b ?? 0}`,
    ...(g.sharpen ? [`unsharp=5:5:${g.sharpen}`] : []),
  ].join(",");
};
const cut = (tl) => {
  const ac = active();
  const segDir = path.join(W, "seg");
  mkdirSync(segDir, { recursive: true });
  const gv = gradeVf();
  const files = [];
  let made = 0;
  for (const s of tl.shots) {
    const n = s.f1 - s.f0;
    const side = Math.floor(Math.min(ac.w, ac.h) / s.scale / 2) * 2;
    const x = Math.round(Math.min(Math.max(ac.x + s.cx * ac.w - side / 2, ac.x), ac.x + ac.w - side));
    const y = Math.round(Math.min(Math.max(ac.y + s.cy * ac.h - side / 2, ac.y), ac.y + ac.h - side));
    const vf = `crop=${side}:${side}:${x}:${y},setpts=(PTS-STARTPTS)/${s.speed},fps=${FPS},scale=1080:1080:flags=lanczos,${gv},tpad=stop_mode=clone:stop_duration=2,format=yuv420p`;
    const f = path.join(segDir, `${hash([film, filmMtime, s.a, n, s.speed, vf, "v1"])}.mp4`);
    if (!existsSync(f)) {
      run("ffmpeg", ["-v", "error", "-y", "-ss", s.a.toFixed(3), "-t", (s.src + 0.4).toFixed(3), "-i", film, "-vf", vf, "-frames:v", String(n), "-an",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-g", "30", "-r", String(FPS), f]);
      made++;
    }
    files.push(f);
  }
  const list = path.join(W, "concat.txt");
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n") + "\n");
  const out = path.join(ENGINE, "public", "media", "sinema", `${name}.mp4`);
  mkdirSync(path.dirname(out), { recursive: true });
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  const nf = parseInt(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", out]).trim());
  if (nf !== tl.totalFrames) warn(`jumlah frame potongan ${nf} ≠ timeline ${tl.totalFrames}`);
  console.log(`  ${tl.shots.length} shot (${made} baru dipotong) -> ${path.relative(ENGINE, out)} · area ${ac.w}x${ac.h}`);
  return `media/sinema/${name}.mp4`;
};

// ------------------------------------------------------------------ audio
const mix = (tl) => {
  const A = st.audio ?? {}, nz = st.narasi ?? {};
  const nwin = tl.narr.map((n) => ({ a: n.at - 0.05, b: n.at + n.dur + (nz.gapAfterSec ?? 0.25) }));
  const env = [];
  for (const s of tl.shots) {
    const lv = s.babak === "montase" ? A.musicMontage ?? 1 : s.babak === "aksi" ? A.musicUnderAction ?? 0.55 : A.musicUnderDialog ?? 0.12;
    env.push([s.start, lv], [Math.max(s.start, s.f1 / FPS - 0.2), lv]);
  }
  const specMix = {
    film,
    dur: tl.total,
    out: paths.mix,
    targetLufs: A.targetLufs ?? -14,
    fadeOut: (tl.ending.flash + tl.ending.fade) / FPS,
    segments: tl.shots.map((s) => ({ t0: s.f0 / FPS, s: s.a, len: (s.f1 - s.f0) / FPS, speed: s.speed, gain: s.gain })),
    duck: nwin.map((w) => ({ ...w, gain: nz.filmDuck ?? 0.25 })),
    clips: tl.narr.filter((n) => n.file).map((n) => ({ file: n.file, at: n.at, gain: spec.narasiGain ?? 1.3 })),
    music: tl.music ? { file: musicWav, offset: tl.music.offset, env, duck: nwin.map((w) => ({ ...w, gain: 0.6 })) } : null,
  };
  mkdirSync(paths.work, { recursive: true });
  const sf = path.join(W, "mix.json");
  writeFileSync(sf, JSON.stringify(specMix, null, 1));
  const r = JSON.parse(py(["mix", "--spec", sf]));
  console.log(`  mix ${r.dur} dtk · loudness ${r.lufsSebelum} -> ${r.target} LUFS${tl.music ? ` · musik mulai di detik lagu ${tl.music.offset.toFixed(2)} (drop ${tl.music.dropSec?.toFixed(2)} -> video ${tl.music.dropAt?.toFixed(2)})` : " · tanpa musik"}`);
  const pub = path.join(ENGINE, "public", "audio", `${name}.wav`);
  mkdirSync(path.dirname(pub), { recursive: true });
  copyFileSync(paths.mix, pub);
  return `audio/${name}.wav`;
};

// ------------------------------------------------------------------ props, timing kompatibel posting
const propsOf = (tl, cards, video, audio) => {
  const T = st.type ?? {}, S = T.subtitle ?? {}, WM = T.watermark ?? {};
  const wmText = spec.watermark === null ? null : spec.watermark ?? prof.watermark ?? null;
  return {
    name, totalFrames: tl.totalFrames, video, audio,
    layout: st.layout,
    sub: { size: S.size ?? 40, weight: S.weight ?? 900, italic: S.italic !== false, lineHeight: S.lineHeight ?? 1.18, letterSpacing: S.letterSpacing ?? 0, color: S.color ?? "#fff", key: S.key ?? "#F5E14A", emotion: S.emotion ?? "#E8423A", shadow: S.shadow ?? "", keyGlow: S.keyGlow ?? "" },
    watermark: wmText ? { text: wmText.toUpperCase(), size: WM.size ?? 21, weight: WM.weight ?? 400, letterSpacing: WM.letterSpacing ?? "0.6em", opacity: WM.opacity ?? 0.72 } : null,
    shots: tl.shots.map((s) => ({ f0: s.f0, f1: s.f1, zoom: s.zoom, fx: s.fx })),
    cards: cards.map(({ f0, f1, lines }) => ({ f0, f1, lines })),
    fx: { flashFrames: st.fx?.flashFrames ?? 2, whipFrames: Math.round((st.fx?.whipSec ?? 0.25) * FPS) },
    ending: tl.ending,
  };
};
const writeCompat = (tl, cards, audio) => {
  const words = cards.flatMap((c) => c.words);
  const timing = {
    fps: FPS, totalFrames: tl.totalFrames, audio: audio ?? "audio/none.wav",
    scenes: tl.shots.map((s, k) => ({
      index: k, text: `shot ${s.i} (${s.babak})`, startFrame: s.f0, durationFrames: s.f1 - s.f0,
      words: words.filter((w) => w.f >= s.f0 && w.f < s.f1).map((w) => ({ w: w.raw, f: w.f - s.f0, e: Math.max(w.e, w.f + 3) - s.f0 })),
    })),
  };
  mkdirSync(paths.work, { recursive: true });
  writeFileSync(paths.timing, JSON.stringify(timing));
  const firstDialog = cards.find((c) => c.src === "dialog");
  const coverAt = spec.cover != null ? toSec(spec.cover) : firstDialog ? (firstDialog.words.at(-1).f + 8) / FPS : 1;
  writeFileSync(paths.storyboard, JSON.stringify({ composition: "Sinema", format: "9:16", profile: spec.profile, cover: { at: +coverAt.toFixed(2) }, _doc: "dibuat otomatis oleh npm run sinema (sumber: sinema.json)" }, null, 2) + "\n");
};

// ------------------------------------------------------------------ Remotion
const remotion = async () => {
  const { bundle } = await import("@remotion/bundler");
  const R = await import("@remotion/renderer");
  await R.ensureBrowser();
  process.stdout.write("  Bundling ... ");
  const serveUrl = await bundle({ entryPoint: path.join(ENGINE, "src", "index.ts"), publicDir: path.join(ENGINE, "public") });
  console.log("OK");
  return { ...R, serveUrl };
};
const previews = async (R, props, tl, cards) => {
  const composition = await R.selectComposition({ serveUrl: R.serveUrl, id: "Sinema", inputProps: props });
  const dir = path.join(paths.dir, "preview");
  mkdirSync(dir, { recursive: true });
  const items = [];
  for (const s of tl.shots) {
    const inShot = cards.filter((c) => c.f0 < s.f1 && c.f1 > s.f0);
    const lastF = Math.max(...inShot.flatMap((c) => c.words.filter((w) => w.f < s.f1).map((w) => w.f)), -1);
    const frame = Math.min(s.f1 - 1, lastF >= 0 ? Math.max(s.f0, lastF + 4) : Math.floor((s.f0 + s.f1) / 2));
    const out = path.join(dir, `shot-${String(s.i).padStart(2, "0")}.jpg`);
    await R.renderStill({ composition, serveUrl: R.serveUrl, inputProps: props, frame, output: out, imageFormat: "jpeg", jpegQuality: 80 });
    items.push(`#${s.i} ${s.babak} ${(frame / FPS).toFixed(1)}s=${out}`);
  }
  const board = path.join(dir, "board.jpg");
  py(["board", "--out", board, "--cols", "6", ...items]);
  return board;
};

const storyboardMd = (tl, cards, narr, board) => {
  const rows = tl.shots.map((s) => {
    const txt = cards.filter((c) => c.f0 >= s.f0 && c.f0 < s.f1).map((c) => (c.src.startsWith("narasi") ? `🎙 ${c.lines.flat().map((w) => w.w).join(" ")}` : c.lines.flat().map((w) => (w.k === 1 ? `**${w.w}**` : w.k === 2 ? `_${w.w}_` : w.w)).join(" "))).join(" / ");
    const n = tl.narr.filter((x) => x.at * FPS >= s.f0 && x.at * FPS < s.f1).map((x) => `N${x.k}`).join(" ");
    return `| ${s.i} | ${s.babak} | ${hms(s.a)}${s.speed !== 1 ? ` ×${s.speed}` : ""} | ${(s.start).toFixed(2)}-${(s.f1 / FPS).toFixed(2)} | ${txt || "—"} | ${n} | ${[...s.fx, s.zoom[0] !== s.zoom[1] ? `zoom ${s.zoom.join("→")}` : ""].filter(Boolean).join(", ")} | ${s.catatan} |`;
  });
  const chars = narr.filter((n) => n.est).reduce((a, n) => a + n.text.length, 0);
  const md = [
    `# Storyboard ${name}`,
    "",
    `Film: **${spec.film.judul}**${spec.film.tahun ? ` (${spec.film.tahun})` : ""} · genre ${genre} · narator ${gender}${UJI ? " (suara uji macOS)" : ""} · durasi **${tl.total.toFixed(1)} dtk** · ${tl.shots.length} shot`,
    tl.music ? `Musik: ${path.basename(spec.musik.file)} · tempo ${tl.music.tempo} BPM · drop detik lagu ${tl.music.dropSec?.toFixed(2)} jatuh di video ${tl.music.dropAt?.toFixed(2)} dtk` : "Musik: —",
    "",
    "## Narasi (diucapkan)",
    ...tl.narr.map((n) => `${n.k}. "${n.text}" — mulai ${n.at.toFixed(2)} dtk di shot ${n.shot}, ±${n.dur.toFixed(1)} dtk${n.kunci ? ` · kunci: ${n.kunci}` : ""}${n.est ? " (perkiraan)" : ""}`),
    "",
    "## Shot",
    "| # | babak | sumber film | video (dtk) | subtitle (**kunci**, _emosi_, 🎙 narasi) | narasi | efek | catatan |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    `Board: ${rel(board)}`,
    chars ? `\nBiaya saat produksi: narasi ±${chars} kredit ElevenLabs.` : "",
    warns ? `\n${warns} peringatan (lihat keluaran perintah).` : "",
    `\nSetuju → \`npm run sinema -- ${name}\``,
  ];
  const f = path.join(PD, "storyboard.md");
  writeFileSync(f, md.join("\n") + "\n");
  return f;
};

// ------------------------------------------------------------------ jalankan
const storyOnly = has("storyboard");
say(storyOnly ? "Storyboard (tanpa kredit)" : "Narasi");
const narr = await narasi({ estimateOnly: storyOnly && !UJI });
if (!storyOnly) narr.forEach((n, k) => console.log(`  N${k + 1} ${n.dur.toFixed(2)} dtk "${n.text}"`));
const tl = plan(narr);
const cards = buildCards(tl);
say("Potong film (ffmpeg, persegi + grading)");
const video = cut(tl);
let audio = null;
if (!storyOnly) {
  say("Audio (film + narasi + musik)");
  audio = mix(tl);
}
writeCompat(tl, cards, audio);
const props = propsOf(tl, cards, video, audio);
writeFileSync(path.join(W, "props.json"), JSON.stringify(props));
say("Preview");
const R = await remotion();
const board = await previews(R, props, tl, cards);
const sb = storyboardMd(tl, cards, narr, board);
console.log(`  ${rel(board)}\n  ${rel(sb)}`);
if (storyOnly) {
  console.log(`\nStoryboard siap (${tl.total.toFixed(1)} dtk, ${warns} peringatan). Setelah disetujui: npm run sinema -- ${name}${UJI ? " --suara-uji" : ""}`);
  process.exit(0);
}

say("Render akhir");
{
  const composition = await R.selectComposition({ serveUrl: R.serveUrl, id: "Sinema", inputProps: props });
  const e = encodeFor(name);
  mkdirSync(paths.resultDir, { recursive: true });
  archiveResult(name);
  const memGB = os.totalmem() / 2 ** 30;
  const memOpts = { offthreadVideoCacheSizeInBytes: Math.round(Math.min(1024, (memGB * 1024) / 8)) * 2 ** 20, ...(memGB < 7 ? { concurrency: memGB < 5 ? 1 : 2 } : {}) };
  let last = -1;
  const t0 = Date.now();
  await R.renderMedia({ composition, serveUrl: R.serveUrl, inputProps: props, ...memOpts, codec: "h264", crf: e.crf, x264Preset: e.preset,
    ...(e.maxrate ? { encodingMaxRate: String(e.maxrate), encodingBufferSize: String(e.bufsize) } : {}),
    pixelFormat: "yuv420p", audioCodec: "aac", audioBitrate: String(e.audioBitrate), outputLocation: paths.result,
    onProgress: ({ progress }) => { const p = Math.floor(progress * 10) * 10; if (p !== last) { last = p; process.stdout.write(`\r  Render ${p}%`); } } });
  console.log(`\n  Selesai: ${rel(paths.result)} (${tl.total.toFixed(1)} dtk, ${Math.round((Date.now() - t0) / 1000)} dtk render)`);
  const pr = run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height:format=duration", "-of", "csv=p=0", paths.result]).trim().replace(/\n/g, " | ");
  const lu = spawnSync("ffmpeg", ["-hide_banner", "-i", paths.result, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr.match(/I:\s+(-?[\d.]+) LUFS/g)?.at(-1);
  console.log(`  ffprobe ${pr} · ${lu ?? ""}`);
}
if (existsSync(path.join(paths.dir, "posting", "caption.md"))) {
  const po = spawnSync("npm", ["run", "-s", "posting", "--", name], { cwd: ENGINE, encoding: "utf8" });
  po.stdout.split("\n").filter((l) => /OK|GAGAL|Hasil siap/.test(l)).forEach((l) => console.log(`  POST ${l.trim()}`));
} else console.log("  POST dilewati: tulis Projects/<nama>/posting/caption.md lalu npm run posting -- " + name);
console.log(`\n${warns} peringatan.`);
