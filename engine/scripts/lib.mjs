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
  styles: path.join(ROOT, "Styles"), // style milik pengguna (rasa video, lepas dari brand): Styles/<slug>/
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
  // proyek edit film (style Sinema): profil brand dari sinema.json
  const sp = readJson(path.join(dir, "sinema.json"), null)?.profile;
  if (sp) return sp;
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

// ------------------------------------------------------------------ FORMAT / KANVAS (v0.8)
// Satu definisi untuk semua jalur asli (HTML & edit footage): ukuran + zona aman (semua teks & brand wajib di dalamnya).
// 9:16 = TikTok/Reels/Shorts (UI aplikasi menimpa atas, kanan, bawah) · 16:9 = YouTube (margin title-safe 5%) ·
// 4:5 & 1:1 = feed Instagram/Facebook/LinkedIn (margin 5%). Komik (Pop) & mg4 tetap 9:16; format lain lewat npm run export.
export const FORMATS = {
  "9:16": { format: "9:16", w: 1080, h: 1920, safe: { l: 60, r: 940, t: 220, b: 1440 }, ui: "TikTok/Reels", brand: { top: 226, left: 64, right: 140, h: 50, font: 24 } },
  "16:9": { format: "16:9", w: 1920, h: 1080, safe: { l: 96, r: 1824, t: 54, b: 1026 }, ui: "YouTube", brand: { top: 54, left: 96, right: 96, h: 50, font: 24 } },
  "4:5": { format: "4:5", w: 1080, h: 1350, safe: { l: 54, r: 1026, t: 54, b: 1296 }, ui: "feed", brand: { top: 54, left: 54, right: 54, h: 46, font: 22 } },
  "1:1": { format: "1:1", w: 1080, h: 1080, safe: { l: 54, r: 1026, t: 54, b: 1026 }, ui: "feed", brand: { top: 54, left: 54, right: 54, h: 46, font: 22 } },
};
const FORMAT_ALIAS = { "9x16": "9:16", potret: "9:16", portrait: "9:16", vertikal: "9:16", vertical: "9:16", reels: "9:16", tiktok: "9:16", shorts: "9:16",
  "16x9": "16:9", landscape: "16:9", lanskap: "16:9", horizontal: "16:9", youtube: "16:9", "4x5": "4:5", feed: "4:5", "1x1": "1:1", kotak: "1:1", square: "1:1" };
/** "16x9" / "landscape" / "16:9" -> "16:9"; kosong -> "9:16"; tidak dikenal -> error berisi pilihan. */
export const normFormat = (f) => {
  if (f == null || f === "") return "9:16";
  const k = String(f).trim().toLowerCase();
  const v = FORMATS[k] ? k : FORMAT_ALIAS[k];
  if (!v) throw new Error(`Format "${f}" tidak dikenal. Pilihan: ${Object.keys(FORMATS).join(", ")} (atau landscape, potret, feed, kotak)`);
  return v;
};
/** Kanvas proyek: storyboard.json "format" (animasi) atau edit.json "format" (edit footage); bawaan 9:16. */
export const canvasOf = (name) => {
  const d = path.join(DIRS.projects, name);
  const f = readJson(path.join(d, "storyboard.json"), {}).format ?? readJson(path.join(d, "edit.json"), {})?.format;
  return FORMATS[normFormat(f)];
};
/**
 * Bab video (opsional): [{start (detik), title}] + mode tampilan. Sumber: timing.json scenes[].chapter (edit footage) atau
 * "> bab: <judul>" di script.md (sejajar dengan scene suara). Mode: storyboard/edit.json "bab" (tanpa | label | kartu).
 */
export const chaptersOf = (name) => {
  const p = P(name), t = readJson(p.timing, null);
  if (!t) return { bab: "tanpa", chapters: [], total: 0 };
  const fps = t.fps ?? 30, total = t.totalFrames / fps;
  let list = t.scenes.filter((s) => s.chapter).map((s) => ({ start: s.startFrame / fps, title: s.chapter }));
  if (!list.length && existsSync(p.script)) {
    const sc = parseScript(readFileSync(p.script, "utf8")).scenes;
    list = t.scenes.map((s, i) => ({ start: s.startFrame / fps, title: sc[i]?.chapter })).filter((x) => x.title);
  }
  const bab = readJson(p.storyboard, {}).bab ?? readJson(path.join(p.dir, "edit.json"), {})?.bab ?? t.bab ?? "tanpa";
  return { bab: list.length ? bab : "tanpa", chapters: list, total };
};
/** Detik -> "M:SS" atau "J:MM:SS" (timestamp bab YouTube). */
export const ts = (sec) => {
  const t = Math.max(0, Math.floor(sec)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};
/**
 * Bab yang sah sebagai chapter YouTube: >= 3 bab, bab pertama di 0:00, tiap bab >= 10 dtk. list = [{title, start}] (detik).
 * Kembalikan {ok, chapters (bab pertama digeser ke 0), alasan}.
 */
export const youtubeChapters = (list, total) => {
  const c = (list ?? []).filter((x) => x && x.title).map((x) => ({ title: String(x.title).trim(), start: Math.max(0, x.start) })).sort((a, b) => a.start - b.start);
  if (c.length) c[0].start = 0;
  if (c.length < 3) return { ok: false, chapters: c, alasan: `butuh minimal 3 bab (ada ${c.length})` };
  for (let i = 0; i < c.length; i++) {
    const end = i < c.length - 1 ? c[i + 1].start : total ?? Infinity;
    if (end - c[i].start < 10) return { ok: false, chapters: c, alasan: `bab "${c[i].title}" kurang dari 10 detik` };
  }
  return { ok: true, chapters: c, alasan: "" };
};

// ------------------------------------------------------------------ STYLE = rasa video, lepas dari brand
// Style bawaan plugin: Engine/styles/<slug>/; milik pengguna: Styles/<slug>/ (menimpa bawaan bernama sama, digabung dalam).
// style.json: name, title, kind ("animasi" | "edit"), jalur (html | Pop | mg4 | edit), skill, warna ("brand" | "style"),
// aliases (nama lama), theme (token kit HTML: colors, fonts, subtitle, glow, ...). Brand = identitas (logo, watermark,
// CTA, penutup, warna brand, voice); brand mana pun boleh memakai style mana pun.
export const STYLE_SLUG = /^[a-z0-9][a-z0-9-]*$/;
const PLUGIN_STYLES = path.join(ENGINE, "styles");
const styleFolders = () => {
  const out = [];
  for (const [source, root] of [["plugin", PLUGIN_STYLES], ["workspace", DIRS.styles]])
    if (existsSync(root))
      for (const d of readdirSync(root).sort()) {
        const f = path.join(root, d, "style.json");
        if (STYLE_SLUG.test(d) && existsSync(f)) out.push({ source, folder: d, dir: path.join(root, d), json: readJson(f, {}) });
      }
  return out;
};
/** Semua style: [{slug, title, kind, jalur, skill, warna, aliases, sources, dirs}] (bawaan + workspace digabung). */
export const listStyles = () => {
  const folders = styleFolders();
  const alias = new Map();
  for (const f of folders) for (const a of f.json.aliases ?? []) if (a !== f.folder) alias.set(a, f.json.name ?? f.folder);
  const by = new Map();
  for (const f of folders) {
    const slug = alias.get(f.folder) ?? f.json.name ?? f.folder; // Styles/narration/ menimpa bawaan "ngobrol" (alias)
    const cur = by.get(slug) ?? { slug, json: {}, sources: [], dirs: [] };
    cur.json = deepMerge(cur.json, f.json);
    cur.sources.push(f.source);
    cur.dirs.push(f.dir);
    by.set(slug, cur);
  }
  return [...by.values()].map(({ slug, json, sources, dirs }) => ({
    ...json, slug, name: slug, title: json.title ?? slug, kind: json.kind ?? "animasi", aliases: json.aliases ?? [], sources, dirs,
    // folder untuk menulis (selera, contoh): folder workspace bila ada, selain itu Styles/<slug>/ (dibuat saat perlu)
    home: dirs.find((d) => d.startsWith(DIRS.styles)) ?? path.join(DIRS.styles, slug),
  }));
};
/** Nama/alias -> slug kanonik (null bila tidak dikenal). */
export const resolveStyle = (name) => {
  if (!name) return null;
  const n = String(name).toLowerCase().trim().replace(/\s+/g, "-");
  const all = listStyles();
  return (all.find((s) => s.slug === n) ?? all.find((s) => s.aliases.includes(n)) ?? all.find((s) => s.title.toLowerCase().replace(/\s+/g, "-") === n))?.slug ?? null;
};
/** Style lengkap (bawaan digabung milik workspace). Melempar error bila tidak ada. */
export const loadStyle = (name) => {
  const slug = resolveStyle(name);
  const st = slug && listStyles().find((s) => s.slug === slug);
  if (!st) {
    const ada = listStyles().map((s) => s.slug).join(", ") || "-";
    throw new Error(`Style "${name}" tidak ada (Styles/<slug>/style.json atau Engine/styles/<slug>/style.json). Tersedia: ${ada}`);
  }
  return st;
};
/** Style bawaan brand (rekomendasi, bukan kunci): profile.style, atau profile.visual.style lama bila cocok dengan alias. */
export const brandStyle = (slug) => {
  const p = brandProfile(slug);
  return resolveStyle(p?.style) ?? resolveStyle(p?.visual?.style) ?? null;
};

// Tema kit HTML = bawaan kit < style.theme < identitas brand (< warna brand bila warna = "brand").
// null di lapisan atas menimpa (mis. "watermark": null).
const mergeTheme = (a, b) => {
  if (Array.isArray(b) || typeof b !== "object" || b === null) return b === undefined ? a : b;
  const o = { ...(a ?? {}) };
  for (const k of Object.keys(b)) o[k] = mergeTheme(o[k], b[k]);
  return o;
};
export const BRAND_THEME_KEYS = ["watermark", "mark", "cta", "closing", "ui"]; // + colors (warna brand) + storyboard.closingSfx
/**
 * Tema kit HTML untuk satu video. style = slug/alias (null = tanpa style: tema brand utuh seperti sebelum v0.7).
 * Hasil: {theme, style (slug|null), warna ("brand"|"style"|null), sumber: [teks]}.
 */
export const kitTheme = ({ brand, style, warna } = {}) => {
  const kit = readJson(path.join(ENGINE, "kit", "html", "theme.default.json"), {});
  const bf = brand && brand !== "umum" ? path.join(DIRS.brands, brand, "theme.json") : null;
  const bt = bf ? readJson(bf, null) : null;
  const sumber = ["kit"];
  let theme, slug = null, w = null;
  if (!style) {
    theme = mergeTheme(kit, bt ?? {});
    if (bt) sumber.push(`Brands/${brand}/theme.json`);
  } else {
    const st = loadStyle(style);
    if (st.kind === "edit") throw new Error(`Style "${st.slug}" untuk edit footage (npm run edit), bukan video animasi`);
    slug = st.slug;
    w = warna ?? st.warna ?? "brand";
    if (!["brand", "style"].includes(w)) throw new Error(`warna harus "brand" atau "style" (bukan "${w}")`);
    theme = mergeTheme(kit, st.theme ?? {});
    if (st.skill) theme.storyboard = { ...(theme.storyboard ?? {}), skill: st.skill };
    sumber.push(`style ${slug}`);
    if (bt) {
      for (const k of BRAND_THEME_KEYS) if (k in bt) theme[k] = mergeTheme(theme[k], bt[k]);
      if (bt.storyboard?.closingSfx) theme.storyboard = { ...(theme.storyboard ?? {}), closingSfx: bt.storyboard.closingSfx };
      sumber.push(`identitas Brands/${brand}`);
      if (w === "brand" && bt.colors) (theme.colors = { ...theme.colors, ...bt.colors }), sumber.push("warna brand");
    }
  }
  delete theme._doc;
  return { theme, style: slug, warna: w, sumber };
};

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
 *  - "> bab: <judul>" = scene ini membuka bab baru (opsional; video panjang: label/kartu bab & timestamp YouTube)
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
      chapter: c.match(/^\s*>\s*(?:bab|chapter):\s*(.+)$/im)?.[1].trim() ?? null,
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
