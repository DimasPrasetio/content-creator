import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// alat yang dipasang setup ke folder pengguna (Node/ffmpeg/uv/rclone tanpa sudo) ikut dicari di PATH
{
  const home = process.env.HOME ?? "";
  const extra = [path.join(home, ".local", "share", "content-creator", "tools", "bin"), path.join(home, ".local", "bin")];
  process.env.PATH = [...extra, process.env.PATH ?? ""].join(path.delimiter);
}
export const ROOT = path.resolve(ENGINE, "..");
export const DIRS = {
  projects: path.join(ROOT, "Projects"), // satu folder per video: brief, naskah, storyboard, suara, preview
  brands: path.join(ROOT, "Brands"), // satu folder per brand: profile.json, brand.md, MOTION.md, logo/, examples/
  references: path.join(ROOT, "References"),
  result: path.join(ROOT, "Result"), // hasil jadi saja: Result/<brand>/<nama>/ (video, thumbnail, caption)
  work: path.join(ENGINE, "work"), // hasil otomatis mesin (timing, cache, render); aman dihapus
};

/**
 * Brand (slug folder Brands/) sebuah video: frontmatter "profile:" di script.md; kalau tidak ada, teks brand pojok
 * storyboard dicocokkan dengan "brand" di Brands/<slug>/profile.json; kalau tidak cocok juga: "umum".
 */
export const brandOf = (name) => {
  const dir = path.join(DIRS.projects, name);
  const md = path.join(dir, "script.md");
  if (existsSync(md)) {
    const prof = readFileSync(md, "utf8").match(/^---\n[\s\S]*?^profile:\s*([\w-]+)/m)?.[1];
    if (prof) return prof;
  }
  // proyek edit footage: profil brand dari edit.json (--brand=<slug>)
  const ep = readJson(path.join(dir, "edit.json"), null)?.profile;
  if (ep) return ep;
  const b = readJson(path.join(dir, "storyboard.json"), {}).brand ?? {};
  const texts = [b.left, b.right].filter(Boolean).map((x) => x.toLowerCase());
  if (texts.length && existsSync(DIRS.brands))
    for (const slug of readdirSync(DIRS.brands)) {
      const pb = readJson(path.join(DIRS.brands, slug, "profile.json"), null)?.brand ?? {};
      if ([pb.left, pb.right].filter(Boolean).some((x) => texts.includes(x.toLowerCase()))) return slug;
    }
  return "umum";
};

/** Semua path milik satu video. */
export const P = (name) => {
  const dir = path.join(DIRS.projects, name);
  const work = path.join(DIRS.work, name);
  const out = path.join(DIRS.result, brandOf(name), name);
  return {
    dir,
    brief: path.join(dir, "brief.md"),
    script: path.join(dir, "script.md"),
    plain: path.join(dir, "script.txt"),
    storyboard: path.join(dir, "storyboard.json"),
    voice: path.join(dir, "voice.wav"),
    preview: path.join(dir, "preview"),
    html: path.join(dir, "html"),
    assets: path.join(dir, "assets"),
    work,
    timing: path.join(work, "timing.json"),
    mix: path.join(work, "mix.wav"),
    cache: path.join(work, "cache"),
    mg4: path.join(work, "mg4"),
    brand: brandOf(name),
    resultDir: out, // Result/<brand>/<nama>/ hanya berisi hasil jadi
    result: path.join(out, `${name}.mp4`),
    thumbnail: path.join(out, "thumbnail.jpg"),
    caption: path.join(out, "caption.txt"),
  };
};

/** Profil brand: Brands/<slug>/profile.json (null bila tidak ada). */
export const brandProfile = (slug) => (slug ? readJson(path.join(DIRS.brands, slug, "profile.json"), null) : null);

/** Cari file logo: Brands/<slug>/logo/<file>, lalu Engine/public/brand/<file>. */
export const findLogo = (file, slug) =>
  [slug && path.join(DIRS.brands, slug, "logo", file), path.join(ENGINE, "public", "brand", file)].find((f) => f && existsSync(f)) ?? null;

// Rahasia: ELEVENLABS_API_KEY dari .env.local di folder workspace (dibuat `elevenlabs onboard`). Jangan pernah mencetak isinya.
try {
  const f = path.join(ROOT, ".env.local");
  if (!process.env.ELEVENLABS_API_KEY && existsSync(f)) {
    process.loadEnvFile(f);
    if (process.env.ELEVENLABS_API_KEY) process.env.ELEVENLABS_KEY_SOURCE = ".env.local";
  }
} catch {}

export const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
// Pengaturan = config.json (bawaan plugin) digabung config.local.json (milik workspace, tidak ditimpa update).
export const deepMerge = (a, b) => {
  if (!b || typeof b !== "object" || Array.isArray(b)) return b ?? a;
  const out = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(out[k], v) : v;
  return out;
};
export const LOCAL_CONFIG = path.join(ENGINE, "config.local.json");
export const config = () => deepMerge(readJson(path.join(ENGINE, "config.json"), {}), readJson(LOCAL_CONFIG, {}));

export const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

export const duration = (file) =>
  parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());

/** Terima "20261103-01-nama", "Projects/20261103-01-nama", atau path ke file di dalamnya (mis. script.md). */
export const resolveName = (arg) => {
  if (!arg) throw new Error("Nama video wajib diisi. Contoh: npm run voice -- 20261103-01-nama");
  const abs = path.resolve(arg);
  const rel = path.relative(DIRS.projects, abs);
  if (!rel.startsWith("..") && rel) return rel.split(path.sep)[0];
  return path.basename(arg).replace(/\.(md|txt|json)$/i, "");
};

export const NAME_RE = /^\d{8}-\d{2,}-[a-z0-9][a-z0-9-]*$/;

/**
 * Parse naskah Markdown:
 *  - frontmatter opsional (key: value)
 *  - scene dipisah heading "## ..."; tanpa heading -> per paragraf
 *  - baris diawali ">" adalah catatan visual, tidak dibacakan
 *  - "> gaya: <nama>" di dalam scene = gaya suara scene itu (mis. "pelan"; daftar di config.json "styles")
 *  - "> jeda: <detik>" = hening tambahan setelah scene itu (napas setelah punchline)
 *  - komentar <!-- ... --> diabaikan
 */
export const parseScript = (md) => {
  let body = md.replace(/<!--[\s\S]*?-->/g, "");
  const meta = {};
  const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const m = line.match(/^([\w-]+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
    }
    body = body.slice(fm[0].length);
  }
  body = body.replace(/^#\s+.*$/m, "");
  const clean = (t) =>
    t
      .split("\n")
      .filter((l) => !l.trim().startsWith(">"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  const chunks = /^##\s/m.test(body) ? body.split(/^##\s.*$/m).slice(1) : body.split(/\n\s*\n/);
  const scenes = chunks
    .map((c) => ({
      text: clean(c),
      style: (c.match(/^\s*>\s*(?:gaya|voice|style):\s*(.+)$/im)?.[1].trim() ?? "normal").toLowerCase(),
      pause: parseFloat(c.match(/^\s*>\s*(?:jeda|pause):\s*([\d.]+)/im)?.[1] ?? "0"),
    }))
    .filter((sc) => sc.text);
  return { meta, scenes };
};

/** Token pembanding: huruf kecil, tanpa tanda baca, kata bersambung "-" dipecah. */
export const normTokens = (word) =>
  word
    .toLowerCase()
    .split(/[-–]/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

const lev = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const similar = (a, b) => {
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return Math.max(a.length, b.length) >= 4 && 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.7;
};

/**
 * Cocokkan token naskah ke kata hasil ASR (alignment LCS dengan kecocokan longgar).
 * Hasil: waktu mulai/akhir (detik) tiap token naskah; token tak cocok diinterpolasi.
 */
export const alignTokens = (scriptToks, asrWords) => {
  const asr = asrWords.flatMap((w) => normTokens(w.w).map((t) => ({ t, s: w.s, e: w.e })));
  const n = scriptToks.length;
  const m = asr.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = similar(scriptToks[i], asr[j].t) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const times = new Array(n).fill(null);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (similar(scriptToks[i], asr[j].t) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      times[i] = { s: asr[j].s, e: asr[j].e };
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const matched = times.filter(Boolean).length;
  // interpolasi token yang tidak cocok
  for (let k = 0; k < n; k++) {
    if (times[k]) continue;
    let a = k - 1;
    while (a >= 0 && !times[a]) a--;
    let b = k + 1;
    while (b < n && !times[b]) b++;
    const t0 = a >= 0 ? times[a].e : 0;
    const t1 = b < n ? times[b].s : t0 + 0.3 * (k - a);
    const frac = (k - a) / (b - a);
    const t = t0 + (t1 - t0) * frac;
    times[k] = { s: t, e: t + 0.05, guessed: true };
  }
  return { times, matched, total: n };
};

/**
 * Timing PERKIRAAN dari naskah saja (tanpa suara), untuk contoh frame gaya sebelum kredit ElevenLabs terpakai.
 * ±2,5 kata per detik, scene minimal 1,5 dtk, jeda "> jeda:" ikut dihitung. Bentuknya sama dengan data/<nama>.timing.json.
 */
export const draftTiming = (name, fps = 30) => {
  const md = P(name).script;
  if (!existsSync(md)) throw new Error(`Naskah tidak ditemukan: ${md}`);
  const { scenes } = parseScript(readFileSync(md, "utf8"));
  const per = Math.round(fps / 2.5);
  let at = 0;
  const out = scenes.map((sc, index) => {
    const words = sc.text.split(/\s+/).filter(Boolean);
    const dur = Math.max(Math.round(fps * 1.5), words.length * per + 9) + Math.round((sc.pause || 0) * fps);
    const s = {
      index,
      text: sc.text,
      style: sc.style,
      startFrame: at,
      durationFrames: dur,
      words: words.map((w, i) => ({ w, f: 3 + i * per, e: 3 + i * per + per - 2 })),
    };
    at += dur;
    return s;
  });
  return { fps, totalFrames: at + fps, audio: "audio/_hening.wav", draft: true, scenes: out };
};

/** Simpan & ringkas hasil cek tata letak (layout.json di folder preview). Dipakai render.mjs dan html.mjs. */
export const writeLayout = (dir, scenes, draft = false) => {
  const errors = scenes.reduce((t, s) => t + s.errors.length, 0);
  const warns = scenes.reduce((t, s) => t + s.warns.length, 0);
  writeFileSync(path.join(dir, "layout.json"), JSON.stringify({ at: new Date().toISOString(), draft, errors, warns, scenes }, null, 2));
  console.log(`\nCek tata letak: ${errors} error, ${warns} peringatan (${path.relative(process.cwd(), path.join(dir, "layout.json"))})`);
  for (const s of scenes) for (const e of s.errors) console.log(`  ERROR  ${s.label}: ${e}`);
  for (const s of scenes) for (const w of s.warns.slice(0, 3)) console.log(`  cek    ${s.label}: ${w}`);
  return { errors, warns };
};

/**
 * Sebelum Result/<nama>.mp4 ditimpa render baru: simpan versi lama ke Projects/<nama>/versions/vN.mp4
 * (N naik terus), agar revisi bisa dibandingkan atau dikembalikan.
 */
export const archiveResult = (name) => {
  const p = P(name);
  if (!existsSync(p.result)) return null;
  const dir = path.join(p.dir, "versions");
  mkdirSync(dir, { recursive: true });
  const n = readdirSync(dir).map((f) => parseInt(f.match(/^v(\d+)\.mp4$/)?.[1] ?? "0")).reduce((a, b) => Math.max(a, b), 0) + 1;
  const dst = path.join(dir, `v${n}.mp4`);
  copyFileSync(p.result, dst);
  console.log(`Versi sebelumnya disimpan: ${path.relative(ROOT, dst)}`);
  return dst;
};

/**
 * Setelan encode video final (capped CRF): kualitas dijaga CRF, bitrate dibatasi maxrate supaya efek grain/noise
 * tidak membuat file membengkak (TikTok/Reels mengompres ulang; > ±8 Mbps tidak menambah ketajaman di aplikasi).
 * Urutan: bawaan < config.json "encode" < profil brand "encode" < storyboard "encode".
 */
export const ENCODE_DEFAULT = { crf: 23, maxrate: "8M", bufsize: null, preset: "slow", audioBitrate: "192k" };
export const encodeFor = (name) => {
  const p = P(name);
  const meta = existsSync(p.script) ? parseScript(readFileSync(p.script, "utf8")).meta : {};
  const prof = brandProfile(meta.profile);
  const board = readJson(p.storyboard, {});
  const e = { ...ENCODE_DEFAULT, ...(config().encode ?? {}), ...(prof?.encode ?? {}), ...(board.encode ?? {}) };
  // bufsize bawaan = 2x maxrate (mis. 8M -> 16M)
  if (e.maxrate && !e.bufsize) e.bufsize = String(e.maxrate).replace(/^([\d.]+)/, (m) => String(parseFloat(m) * 2));
  return e;
};
/** Argumen ffmpeg (libx264) untuk setelan encode: yuv420p rentang standar (tv), 30 fps, faststart. */
export const x264Args = (e, { audio = "aac" } = {}) => [
  "-c:v", "libx264", "-preset", String(e.preset), "-crf", String(e.crf),
  ...(e.maxrate ? ["-maxrate", String(e.maxrate), "-bufsize", String(e.bufsize ?? e.maxrate)] : []),
  // -color_range tv juga mengonversi sumber rentang penuh (screenshot JPEG/PNG) ke rentang standar video
  "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", "30",
  ...(audio === "copy" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", String(e.audioBitrate)]),
  "-movflags", "+faststart",
];
/** Angka bitrate "8M" / "800k" -> bit per detik. */
export const bps = (v) => {
  const m = String(v).match(/^([\d.]+)\s*([kKmM]?)/);
  return m ? parseFloat(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] ?? 1) : NaN;
};

/**
 * Lokasi skill motion-graphics-v4 (milik Anthropic, tidak dibundel plugin publik). Dicari di: $MG4_SKILL,
 * <workspace>/.claude/skills/, ~/.claude/skills/, skill tersinkron akun (~/.claude/skills/synced/...),
 * dan skill mode agent Claude desktop. null = jalur B (mg4) tidak tersedia di komputer ini.
 */
/** Model whisper (opsional) sudah ada di cache Hugging Face? Dipasang lewat setup --with-whisper. */
export const WHISPER_MODEL = "deepdml/faster-whisper-large-v3-turbo-ct2";
export const whisperReady = () => {
  const hub = process.env.HF_HUB_CACHE || path.join(process.env.HF_HOME || path.join(process.env.HOME ?? "", ".cache", "huggingface"), "hub");
  return existsSync(path.join(hub, `models--${WHISPER_MODEL.replace("/", "--")}`, "snapshots"));
};

export const mg4Skill = () => {
  const home = process.env.HOME ?? "";
  const cands = [process.env.MG4_SKILL, path.join(ROOT, ".claude", "skills", "motion-graphics-v4"), path.join(home, ".claude", "skills", "motion-graphics-v4")];
  const scan = (base, depth) => {
    if (!existsSync(base) || depth < 0) return;
    for (const d of readdirSync(base, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const p = path.join(base, d.name);
      if (d.name === "motion-graphics-v4") cands.push(p);
      else scan(p, depth - 1);
    }
  };
  scan(path.join(home, ".claude", "skills", "synced"), 2);
  scan(path.join(home, "Library", "Application Support", "Claude", "local-agent-mode-sessions", "skills-plugin"), 4);
  return cands.find((c) => c && existsSync(path.join(c, "scripts", "render.py"))) ?? null;
};
