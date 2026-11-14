// Produksi satu perintah untuk video jalur C (HTML), semua brand. Keluaran ringkas + waktu per tahap.
//
// Pemakaian:
//   npm run produce -- <nama> --draft      contoh frame timing perkiraan + preview/draft/board.png (tanpa kredit)
//   npm run produce -- <nama>              voice -> cek cue -> sound -> preview + board -> render paralel -> QA ‖ posting
// Opsi: --from=voice|cues|sound|preview|render|qa   mulai dari tahap itu (tahap sebelumnya dianggap sudah)
//       --stop-after=<tahap>                       berhenti setelah tahap itu
//       --workers=4 --no-gpu                       diteruskan ke render (npm run html)
//       --pace=2.0                                 tempo bicara voice (kata/dtk) untuk cek durasi (atau "pace" di Brands/<slug>/profile.json)
//       --force                                    lanjut walau ada cue animasi yang tidak ditemukan
// Storyboard "cover": {"at": "auto"} -> thumbnail otomatis di akhir scene 1 (hook).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, ROOT, brandProfile, duration, parseScript, readJson, resolveName, run } from "./lib.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const flag = (k) => argv.includes(`--${k}`);
const name = resolveName(argv.find((a) => !a.startsWith("--")));
const paths = P(name);
const PY = path.join(ENGINE, ".venv", "bin", "python");
const STEPS = ["voice", "cues", "sound", "preview", "render", "qa"];
const from = STEPS.indexOf(opt("from", "voice"));
const stopAfter = STEPS.indexOf(opt("stop-after", "qa"));
if (from < 0 || stopAfter < 0) throw new Error(`Tahap dikenal: ${STEPS.join(", ")}`);
const renderOpts = argv.filter((a) => a.startsWith("--workers=") || a === "--no-gpu");
const times = [];
const rel = (p) => path.relative(ROOT, p);

function sh(cmd, args, show = () => false) {
  const r = spawnSync(cmd, args, { cwd: ENGINE, encoding: "utf8", maxBuffer: 64 << 20 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  for (const l of out.split(/\r?\n|\r/)) if (l.trim() && show(l)) console.log(`    ${l.trim()}`);
  return { ok: r.status === 0, out };
}
const shAsync = (cmd, args) => new Promise((res) => {
  const c = spawn(cmd, args, { cwd: ENGINE });
  let out = "";
  c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
  c.on("close", (status) => res({ ok: status === 0, out }));
});
const die = (msg, out) => { if (out) console.log(out.split("\n").slice(-25).join("\n")); console.error(`\n✗ ${msg}`); process.exit(1); };
async function step(key, label, fn) {
  const i = STEPS.indexOf(key);
  if (key && (i < from || i > stopAfter)) return;
  const t0 = Date.now();
  console.log(`\n▶ ${label}`);
  await fn();
  const s = (Date.now() - t0) / 1000;
  times.push([label.split(" ")[0], s]);
  console.log(`  ✓ ${s.toFixed(0)} dtk`);
}
const board = (dir) => {
  const files = Array.from({ length: 40 }, (_, i) => path.join(dir, `scene-${String(i + 1).padStart(2, "0")}.png`)).filter(existsSync);
  const out = path.join(dir, "board.png");
  sh(PY, [path.join(ENGINE, "scripts", "board_png.py"), out, ...files.map((f, i) => `${i + 1}=${f}`)]);
  return out;
};
const layoutLine = (l) => /Cek tata letak|^\s*error\b|! \d+ error/i.test(l);
const layoutErrors = (out) => +(out.match(/Cek tata letak: (\d+) error/)?.[1] ?? 0);

// ---------- cek kata pemicu animasi (cue(s, "kata"[, n]) di halaman) ----------
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
function checkCues() {
  const timing = readJson(paths.timing);
  if (!timing) die("timing.json belum ada (jalankan tahap voice)");
  const miss = [];
  let total = 0;
  for (const f of ["index.html", "scenes.js"].map((x) => path.join(paths.html, x)).filter(existsSync)) {
    const src = readFileSync(f, "utf8");
    const marks = [...src.matchAll(/\bscene\((\d+)\)/g)].map((m) => [m.index, +m[1]]);
    for (const m of src.matchAll(/\bcue\(\s*[\w.]+\s*,\s*["']([^"']+)["']\s*(?:,\s*(\d+))?\s*\)/g)) {
      const sc = marks.filter(([at]) => at < m.index).at(-1)?.[1];
      if (sc === undefined || !timing.scenes[sc]) continue;
      total++;
      const want = norm(m[1]), n = +(m[2] ?? 0);
      const hits = timing.scenes[sc].words.filter((w) => norm(w.w) === want || norm(w.w).startsWith(want)).length;
      if (hits <= n) miss.push(`scene ${sc + 1}: cue "${m[1]}"${n ? ` ke-${n + 1}` : ""} · kata: ${timing.scenes[sc].words.map((w) => w.w).join(" ")}`);
    }
  }
  console.log(`    ${total} cue animasi dicek, ${miss.length} tidak ditemukan`);
  miss.forEach((m) => console.log(`    ! ${m}`));
  if (miss.length && !flag("force")) die("Perbaiki cue di halaman (atau --force): elemen itu akan muncul di awal scene, bukan saat katanya diucapkan.");
  const sb = readJson(paths.storyboard, {});
  if (sb.cover?.at === "auto" && timing.scenes[1]) {
    sb.cover.at = Math.round((timing.scenes[1].startFrame / timing.fps - 0.45) * 100) / 100;
    writeFileSync(paths.storyboard, JSON.stringify(sb, null, 2) + "\n");
    console.log(`    thumbnail otomatis di detik ${sb.cover.at} (akhir hook)`);
  }
}

if (flag("draft")) {
  await step(null, "Contoh frame (timing perkiraan)", () => {
    const r = sh("npm", ["run", "html", "--", name, "--preview", "--draft"], layoutLine);
    if (!r.ok) die("Preview draft gagal", r.out);
    console.log(`    board: ${rel(board(path.join(paths.preview, "draft")))}`);
  });
  process.exit(0);
}

await step("voice", "Voice over", () => {
  const r = sh("npm", ["run", "voice", "--", name], (l) => /Selesai|peringatan|berbeda|gagal/i.test(l));
  if (!r.ok) die("Voice gagal", r.out);
  const meta = parseScript(readFileSync(paths.script, "utf8")).meta;
  const prof = brandProfile(meta.profile);
  const pace = +opt("pace", prof?.pace ?? 2.0);
  const words = readFileSync(paths.plain, "utf8").replace(/\[[^\]]*\]/g, "").split(/\s+/).filter(Boolean).length;
  const dur = duration(paths.voice), est = words / pace, d = (dur / est - 1) * 100;
  console.log(`    durasi ${dur.toFixed(1)} dtk vs perkiraan ${est.toFixed(1)} dtk (${d >= 0 ? "+" : ""}${d.toFixed(0)}%)${Math.abs(d) > 15 ? "  ! meleset > 15%" : ""}`);
});
await step("cues", "Cek kata pemicu animasi", checkCues);
await step("sound", "Sound (SFX + musik)", () => {
  const r = sh("npm", ["run", "sound", "--", name], (l) => /Selesai|cue SFX tidak|^!/.test(l.trim()));
  if (!r.ok) die("Sound gagal", r.out);
});
await step("preview", "Preview + cek tata letak", () => {
  const r = sh("npm", ["run", "html", "--", name, "--preview"], layoutLine);
  if (!r.ok) die("Preview gagal", r.out);
  console.log(`    board: ${rel(board(paths.preview))}`);
  if (layoutErrors(r.out)) die("Ada error tata letak: perbaiki dulu.");
});
await step("render", "Render video", () => {
  const r = sh("npm", ["run", "html", "--", name, ...renderOpts], (l) => /Selesai|worker|error di halaman|^\s+cue/i.test(l));
  if (!r.ok) die("Render gagal", r.out);
});
await step("render", "Cek layar kosong", () => {
  const r = sh(PY, [path.join(ENGINE, "scripts", "visual_gaps.py"), paths.result, "--json"]);
  if (!r.ok) return console.log("    (cek layar kosong gagal dijalankan)");
  const g = JSON.parse(r.out.trim().split("\n").at(-1));
  const fmt = (xs) => xs.map(([a, b]) => `${a}-${b}`).join(", ");
  console.log(`    kosong ${g.empty_seconds} dtk (${(g.empty_ratio * 100).toFixed(0)}%)${g.gaps.length ? ` di ${fmt(g.gaps)}` : ""}`);
  if (g.half_empty.length) console.log(`    separuh kosong >= 1 dtk di ${fmt(g.half_empty)}`);
  if (g.gaps.length || g.half_empty.length)
    console.log("    ! PERBAIKI: beri jangkar scene (objek utama sejak awal scene) di rentang itu, lalu --from=preview (README kit, aturan 1)");
});
await step("qa", "QA + paket posting (paralel)", async () => {
  const hasCaption = existsSync(path.join(paths.dir, "posting", "caption.md"));
  const [qa, post] = await Promise.all([
    shAsync("npm", ["run", "qa", "--", name]),
    hasCaption ? shAsync("npm", ["run", "posting", "--", name]) : Promise.resolve(null),
  ]);
  qa.out.split("\n").filter((l) => /GAGAL|pengecekan (gagal|lolos)|Semua pengecekan/i.test(l)).forEach((l) => console.log(`    QA   ${l.trim()}`));
  if (post) post.out.split("\n").filter((l) => /\bOK\b|GAGAL|Hasil siap/.test(l)).forEach((l) => console.log(`    POST ${l.trim()}`));
  else console.log("    POST dilewati: tulis Projects/<nama>/posting/caption.md lalu --from=qa");
  const v = run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-show_entries", "format=duration", "-of", "compact=p=0:nk=1", paths.result]);
  console.log(`    ffprobe ${v.trim().split("\n").join(" | ")}`);
});
console.log(`\nSelesai ${name} · ${times.map(([l, s]) => `${l} ${s.toFixed(0)}s`).join(" · ")} · total ${times.reduce((a, [, s]) => a + s, 0).toFixed(0)} dtk`);
