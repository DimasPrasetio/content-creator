// Aset AI dari Higgsfield (gambar, klip video, audio) untuk sebuah video, lewat CLI resmi `higgsfield`.
// MEMAKAI KREDIT Higgsfield: hanya berjalan dengan --yes dan selalu di bawah batas kredit (budget) yang disepakati
// pengguna saat penyamaan persepsi. Tanpa --yes hanya menghitung perkiraan biaya (gratis).
//
//   npm run gen -- --status                       login, paket, sisa kredit, versi CLI (gratis)
//   npm run gen -- --models [--video|--image|--audio]   daftar model (gratis)
//   npm run gen -- <nama> --estimate              perkiraan kredit item yang belum dibuat (gratis)
//   npm run gen -- <nama> --yes [--only=id,id] [--force] [--budget=N]
//
// Daftar aset ditulis agent di Projects/<nama>/gen.json:
//   { "budget": 80,                              batas TOTAL kredit proyek ini (termasuk yang sudah terpakai)
//     "items": [
//       { "id": "kampus-malam",                  huruf kecil-minus; nama file hasil: assets/gen/<id>.<ext>
//         "kind": "video",                       image | video | audio
//         "model": "seedance_2_5",               opsional; bawaan config.json -> higgsfield.models[kind]
//         "prompt": "slow dolly-in, empty campus corridor at night, 9:16, no text",
//         "aspect_ratio": "9:16", "duration": 5, "resolution": "1080p",   parameter model (diteruskan sebagai --nama nilai)
//         "image": "assets/ref.png",             media: image | start_image | end_image | video | audio (path proyek / UUID)
//         "params": { "mode": "t2v" },           parameter lain (cek: higgsfield model get <model> --json)
//         "use": "edit s4 klip penuh" } ] }      catatan pemakaian (bebas)
//
// Hasil: Projects/<nama>/assets/gen/<id>.<ext> + assets/gen/manifest.json (model, prompt, job, URL, kredit, hash).
// Cache per hash (model + prompt + parameter + isi file media): item yang tidak berubah tidak dibuat ulang (--force memaksa).
// Dipakai oleh: mesin edit (objek "clip" / "image"), kit HTML jalur C (/assets/gen/<file>), thumbnail (visual.image).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NAME_RE, P, config, readJson, resolveName, run } from "./lib.mjs";
import { HiggsError, account, creditsOf, hf, jobId, jobStatus, resultUrls, version } from "./higgsfield.mjs";

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const cfg = config().higgsfield ?? {};
const die = (m, code = 1) => {
  console.error(`\nGAGAL ${m}`);
  process.exit(code);
};

try {
  if (flag("status")) {
    const v = version();
    if (!v) die("CLI higgsfield belum terpasang: jalankan ulang /content-creator:setup");
    const a = account();
    console.log(`higgsfield CLI ${v}`);
    if (!a.ok) die(a.error);
    console.log(`Login: ${a.email ?? "?"} · paket ${a.plan ?? "?"} · sisa ${Number.isFinite(a.credits) ? a.credits : "?"} kredit`);
    process.exit(0);
  }
  if (flag("models")) {
    const kind = ["video", "image", "audio", "text"].find((k) => flag(k));
    const list = hf(["model", "list", ...(kind ? [`--${kind}`] : [])]);
    const rows = Array.isArray(list) ? list : list.models ?? list.items ?? list.data ?? [];
    if (!rows.length) console.log(typeof list === "string" ? list : JSON.stringify(list, null, 2));
    for (const m of rows) console.log(`  ${(m.job_set_type ?? m.id ?? m.job_type ?? m.name ?? "?").padEnd(34)} ${m.name ?? m.display_name ?? ""}${m.category ? `  [${m.category}]` : ""}`);
    process.exit(0);
  }
} catch (e) {
  die(e.message);
}

const name = resolveName(argv.find((a) => !a.startsWith("--")));
if (!NAME_RE.test(name)) die(`nama video tidak valid: ${name}`);
const paths = P(name);
const specFile = path.join(paths.dir, "gen.json");
const spec = readJson(specFile, null);
if (!spec) die(`belum ada ${path.relative(process.cwd(), specFile)} (format di kepala Engine/scripts/gen.mjs)`);
const outDir = path.join(paths.assets, "gen");
const manFile = path.join(outDir, "manifest.json");
const man = readJson(manFile, { items: {} });

// ---------- validasi spesifikasi
const MEDIA = { image: "--image", start_image: "--start-image", end_image: "--end-image", video: "--video", audio: "--audio",
  image_references: "--image-references", video_references: "--video-references", audio_references: "--audio-references" };
const META = new Set(["id", "kind", "model", "prompt", "params", "use", "note", ...Object.keys(MEDIA)]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const items = spec.items ?? [];
if (!items.length) die("gen.json tidak berisi items");
const ids = new Set();
const errs = [];
for (const [i, it] of items.entries()) {
  const tag = it.id ?? `items[${i}]`;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(it.id ?? "")) errs.push(`${tag}: id wajib huruf kecil/angka/minus`);
  if (ids.has(it.id)) errs.push(`${tag}: id ganda`);
  ids.add(it.id);
  if (!["image", "video", "audio"].includes(it.kind)) errs.push(`${tag}: kind harus image | video | audio`);
  if (!it.model && !cfg.models?.[it.kind]) errs.push(`${tag}: model belum diisi dan tidak ada bawaan untuk ${it.kind}`);
  if (!it.prompt && !Object.keys(MEDIA).some((k) => it[k])) errs.push(`${tag}: prompt atau media wajib diisi`);
  for (const k of Object.keys(MEDIA))
    for (const f of [it[k]].flat().filter(Boolean))
      if (!UUID.test(f) && !existsSync(path.resolve(paths.dir, f))) errs.push(`${tag}: file ${k} tidak ada: ${f}`);
  if (it.kind === "video" && it.aspect_ratio && it.aspect_ratio !== "9:16") console.log(`  ! ${tag}: aspect_ratio ${it.aspect_ratio} (video vertikal = 9:16; selain itu dipotong/dikecilkan)`);
}
if (errs.length) die(`gen.json tidak valid:\n  - ${errs.join("\n  - ")}`);

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const argsOf = (it) => {
  const a = [];
  if (it.prompt) a.push("--prompt", it.prompt);
  for (const [k, f] of Object.entries(MEDIA))
    for (const v of [it[k]].flat().filter(Boolean)) a.push(f, UUID.test(v) ? v : path.resolve(paths.dir, v));
  const params = { ...Object.fromEntries(Object.entries(it).filter(([k]) => !META.has(k))), ...(it.params ?? {}) };
  for (const [k, v] of Object.entries(params)) a.push(`--${k}`, String(v));
  return a;
};
const hashOf = (it) => {
  const media = Object.keys(MEDIA).flatMap((k) => [it[k]].flat().filter(Boolean).map((v) => (UUID.test(v) ? v : sha(readFileSync(path.resolve(paths.dir, v))))));
  const { use, note, ...rest } = it;
  return sha(JSON.stringify({ ...rest, model: it.model ?? cfg.models[it.kind], media })).slice(0, 16);
};
const modelOf = (it) => it.model ?? cfg.models[it.kind];

const only = opt("only")?.split(",");
const force = flag("force");
const plan = items.map((it) => {
  const h = hashOf(it);
  const m = man.items[it.id];
  const cached = m && m.hash === h && (m.files ?? []).length && m.files.every((f) => existsSync(path.join(outDir, f)));
  const want = (!only || only.includes(it.id)) && (force || !cached);
  return { it, h, cached, want };
});
const todo = plan.filter((p) => p.want);
const spent = Object.values(man.items).reduce((t, m) => t + (Number(m.credits) || 0), 0);
for (const p of plan.filter((p) => !p.want)) console.log(`  = ${p.it.id}: ${p.cached ? "sudah ada (cache)" : "dilewati (--only)"}`);
if (!todo.length) {
  console.log(`\nSemua aset sudah ada di ${path.relative(process.cwd(), outDir)} (terpakai ${spent} kredit).`);
  process.exit(0);
}

// ---------- perkiraan biaya (gratis)
let total = 0;
try {
  console.log(`\nPerkiraan biaya Higgsfield (${todo.length} item):`);
  for (const p of todo) {
    const c = creditsOf(hf(["generate", "cost", modelOf(p.it), ...argsOf(p.it)], { timeoutMs: 120000 }));
    p.cost = Number.isFinite(c) ? c : null;
    total += p.cost ?? 0;
    console.log(`  ${p.it.id.padEnd(24)} ${p.it.kind.padEnd(6)} ${modelOf(p.it).padEnd(24)} ${p.cost === null ? "?" : p.cost} kredit`);
  }
} catch (e) {
  die(e.message);
}
const unknown = todo.some((p) => p.cost === null);
const budget = Number(opt("budget") ?? spec.budget ?? cfg.budget ?? 0);
const acc = account();
console.log(`Total ±${total}${unknown ? "+ (ada yang tidak diketahui)" : ""} kredit · sudah terpakai proyek ini ${spent} · batas ${budget || "-"} · sisa akun ${acc.ok && Number.isFinite(acc.credits) ? acc.credits : "?"}`);
if (flag("estimate")) process.exit(0);
if (!flag("yes")) die("belum dijalankan: perintah ini memakai kredit Higgsfield. Tambahkan --yes setelah batas kredit disepakati pengguna.");
if (!(budget > 0)) die('batas kredit belum ada: isi "budget" di gen.json (angka yang disepakati pengguna) atau --budget=N');
if (unknown) die("biaya sebagian item tidak bisa diperkirakan: periksa parameter dengan `higgsfield model get <model> --json`");
if (spent + total > budget) die(`melebihi batas: terpakai ${spent} + baru ${total} > batas ${budget}. Kurangi item / model lebih murah, atau minta pengguna menaikkan batas.`, 2);
if (!acc.ok) die(`status akun Higgsfield tidak terbaca, generate dibatalkan: ${acc.error}`);
if (Number.isFinite(acc.credits) && total > acc.credits) die(`kredit akun tidak cukup (${acc.credits} < ${total})`, 2);

// ---------- generate (memakai kredit)
mkdirSync(outDir, { recursive: true });
const extOf = (url, kind) => (url.match(/\.(mp4|mov|webm|png|jpe?g|webp|gif|svg|wav|mp3|m4a|glb)(?:\?|$)/i)?.[1] ?? { image: "png", video: "mp4", audio: "wav" }[kind]).toLowerCase();
const download = async (url, file) => {
  if (url.startsWith("file://")) return copyFileSync(new URL(url), file); // stub selftest
  const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!r.ok) throw new HiggsError(`unduh hasil gagal (${r.status})`);
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
};
const probe = (file) => {
  try {
    const s = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", file]));
    const v = s.streams?.find((x) => x.codec_type === "video");
    return { w: v?.width, h: v?.height, dur: s.format?.duration ? Number(Number(s.format.duration).toFixed(2)) : undefined };
  } catch {
    return {};
  }
};
let used = 0;
for (const p of todo) {
  const { it } = p;
  process.stdout.write(`\n  ${it.id}: membuat (${modelOf(it)}) ... `);
  const t0 = Date.now();
  let res;
  try {
    res = hf(["generate", "create", modelOf(it), ...argsOf(it), "--wait", "--wait-timeout", cfg.waitTimeout ?? "20m"]);
  } catch (e) {
    die(`${it.id}: ${e.message}`);
  }
  const st = jobStatus(res);
  if (st && /fail|error|cancel|nsfw|reject/i.test(st)) die(`${it.id}: job berstatus ${st}${typeof res === "object" && res.fail_reason ? ` (${res.fail_reason})` : ""}`);
  const urls = resultUrls(res);
  if (!urls.length) die(`${it.id}: tidak ada URL hasil di respons CLI: ${JSON.stringify(res).slice(0, 300)}`);
  const files = [];
  for (const [k, u] of urls.entries()) {
    const f = `${it.id}${k ? `-${k + 1}` : ""}.${extOf(u, it.kind)}`;
    await download(u, path.join(outDir, f));
    files.push(f);
  }
  const info = it.kind === "audio" ? {} : probe(path.join(outDir, files[0]));
  const credits = p.cost;
  used += credits;
  man.items[it.id] = { hash: p.h, kind: it.kind, model: modelOf(it), prompt: it.prompt ?? null, args: argsOf(it).map((a) => a.replace(paths.dir + path.sep, "")),
    job: jobId(res) ?? null, urls, files, credits, ...info, use: it.use ?? null, at: new Date().toISOString() };
  writeFileSync(manFile, JSON.stringify(man, null, 2) + "\n");
  console.log(`selesai ${((Date.now() - t0) / 1000).toFixed(0)} dtk -> ${files.join(", ")}${info.w ? ` (${info.w}x${info.h}${info.dur ? `, ${info.dur} dtk` : ""})` : ""}`);
  if (it.kind === "video" && info.w && info.h && Math.abs(info.w / info.h - 9 / 16) > 0.02) console.log(`    ! rasio ${info.w}x${info.h} bukan 9:16: mesin akan memotong (cover) saat dipakai`);
}
const after = account();
console.log(`\nSelesai: ${todo.length} aset, ±${used} kredit (total proyek ${spent + used}/${budget}). Sisa akun: ${after.ok ? after.credits : "?"}.`);
console.log("Catatan: klip/gambar AI yang tampak nyata (orang, tempat, kejadian) wajib diberi label konten AI saat posting di TikTok/Instagram.");
