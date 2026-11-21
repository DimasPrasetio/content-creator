// Klip pendek otomatis dari video panjang (podcast, wawancara, talking-head panjang) — v0.9.
//
//   npm run clips -- <nama>                       usulan kandidat dari transkrip proyek edit yang sudah --analyze:
//        Projects/<nama>/klip/kandidat.md (+ .json) = jendela 30-60 dtk (kalimat utuh) berperingkat: pembuka kuat,
//        akhir tuntas, padat, angka. Agent membaca kandidat + konteks.md, lalu menulis 3-5 usulan di
//        Projects/<nama>/klip.json -> "clips": [{id, title, hook, why, from, to}] (from/to = id kalimat).
//   npm run clips -- <nama> --check               validasi klip.json + tabel ringkas untuk ditanyakan ke pengguna (pilih)
//   npm run clips -- <nama> --make=k1,k3 [--render] [--force]
//        tiap klip terpilih -> proyek edit anak Projects/<nama>-<id>/ (9:16 bawaan, style klip bawaan "ngobrol"):
//        footage induk dipakai sebagian (sources[].range, tanpa salin), transkrip & pembicara dari induk (tanpa kredit),
//        kamera tetap pada pembicara. --render: langsung potong + grafis + render + QA (+ posting bila caption ada).
//   Opsi: --min=30 --max=60 (detik), --top=12 (jumlah kandidat)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, ROOT, loadStyle, normFormat, normTokens, readJson, resolveName } from "./lib.mjs";

const args = process.argv.slice(2);
const name = resolveName(args.find((a) => !a.startsWith("--")));
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const has = (k) => args.includes(`--${k}`);
const paths = P(name);
const planFile = path.join(paths.dir, "edit.json");
const plan = readJson(planFile, null);
if (!plan?.sentences?.length) throw new Error(`Proyek edit ${name} belum dianalisis: npm run edit -- ${name} --analyze`);
const S = (() => { try { return loadStyle(plan.style); } catch { return {}; } })();
const klipFile = path.join(paths.dir, "klip.json");
const kdir = path.join(paths.dir, "klip");
const klip = readJson(klipFile, null);
const [MIN, MAX] = [Number(opt("min") ?? klip?.lengthSec?.[0] ?? S.clips?.lengthSec?.[0] ?? 30), Number(opt("max") ?? klip?.lengthSec?.[1] ?? S.clips?.lengthSec?.[1] ?? 60)];
const MC = !!plan.multicam && plan.sources.length > 1;
const AUD = MC ? Math.max(0, (plan.audio ?? 1) - 1) : -1;
const work = path.join(paths.work, "edit");
const infos = plan.sources.map((_, i) => readJson(path.join(work, `src${i + 1}.json`), null));
const words = plan.sources.map((_, i) => readJson(path.join(work, `src${i + 1}.words.json`), { words: [] }).words);
const spk = (s) => s.speaker ?? s.spk ?? null;
const sents = plan.sentences;
const idx = new Map(sents.map((s, k) => [s.id, k]));
/** Perkiraan durasi klip: ucapan kalimat terpakai + jeda kecil antar-kalimat (jeda mati dibuang mesin edit). */
const estDur = (list) => { const k = list.filter((s) => s.keep !== false); return k.reduce((t, s) => t + (s.t[1] - s.t[0]), 0) + 0.15 * Math.max(0, k.length - 1); };

const HOOK = /\b(kenapa|mengapa|gimana|bagaimana|rahasia|jangan|kesalahan|salah|ternyata|sebenarnya|faktanya|banyak orang|paling|cara|tips|harus|nggak pernah|tidak pernah|pertama kali|bayangin|bayangkan|masalahnya|intinya|kuncinya)\b/i;
const WEAK = /^(dan|tapi|terus|jadi|karena|makanya|soalnya|yang|atau|kalau|nah,? terus)\b/i;
const FILL = new Set(["eh", "em", "emm", "anu", "hmm", "ehm"]);
const scoreOf = (list) => {
  const a = list[0], z = list.at(-1);
  const first = a.text.trim();
  let sc = 0;
  const why = [];
  if (/\?$/.test(first)) (sc += 2), why.push("dibuka pertanyaan");
  if (HOOK.test(first)) (sc += 1.5), why.push("kata pemikat di awal");
  if (WEAK.test(first)) (sc -= 2), why.push("awal menggantung");
  if (FILL.has(normTokens(first.split(/\s+/)[0]).join(""))) sc -= 1;
  if (/[.!?]$/.test(z.text.trim())) (sc += 1), why.push("akhir tuntas");
  else sc -= 1.5;
  const nw = list.reduce((t, s) => t + s.text.split(/\s+/).length, 0), d = estDur(list);
  const wps = nw / Math.max(1, d);
  sc += Math.max(-1, Math.min(1.5, wps - 2.2));
  if (list.some((s) => /\d|persen|juta|miliar|ribu/.test(s.text))) (sc += 0.5), why.push("ada angka");
  const sp = new Set(list.map(spk).filter(Boolean));
  if (sp.size === 2) (sc += 0.5), why.push("dialog");
  sc -= list.filter((s) => (s.flags ?? []).some((f) => f.startsWith("mirip"))).length;
  return { score: +sc.toFixed(2), why, dur: +d.toFixed(1), speakers: [...sp], words: nw };
};

/** Validasi satu usulan klip -> {list, errors, dur} */
const checkClip = (c) => {
  const errors = [];
  if (!c.id || !/^[a-z0-9-]+$/i.test(c.id)) errors.push(`id "${c.id}" harus huruf/angka (mis. k1)`);
  const a = idx.get(c.from), b = idx.get(c.to);
  if (a === undefined) errors.push(`from "${c.from}" bukan id kalimat`);
  if (b === undefined) errors.push(`to "${c.to}" bukan id kalimat`);
  if (errors.length) return { errors, list: [], dur: 0 };
  if (b < a) errors.push("to sebelum from");
  const list = sents.slice(a, b + 1);
  if (new Set(list.map((s) => s.src)).size > 1) errors.push("kalimat dari footage berbeda (klip harus satu rekaman bersambung)");
  if (!list.some((s) => s.keep !== false)) errors.push("semua kalimat dibuang (keep:false)");
  return { errors, list, dur: estDur(list) };
};

// ---------------------------------------------------------------- usulan kandidat
if (!has("check") && !opt("make")) {
  const cands = [];
  for (let a = 0; a < sents.length; a++) {
    if (sents[a].keep === false) continue;
    for (let b = a; b < sents.length; b++) {
      if (sents[b].src !== sents[a].src) break;
      const list = sents.slice(a, b + 1), d = estDur(list);
      if (d > MAX) break;
      if (d >= MIN && sents[b].keep !== false) cands.push({ from: sents[a].id, to: sents[b].id, a, b, ...scoreOf(list) });
    }
  }
  cands.sort((x, y) => y.score - x.score || x.a - y.a);
  const top = [], used = new Set();
  for (const c of cands) {
    if (top.length >= Number(opt("top") ?? 12)) break;
    let clash = false;
    for (let k = c.a; k <= c.b; k++) if (used.has(k)) clash = true;
    if (clash) continue;
    for (let k = c.a; k <= c.b; k++) used.add(k);
    top.push(c);
  }
  top.sort((x, y) => x.a - y.a);
  mkdirSync(kdir, { recursive: true });
  writeFileSync(path.join(kdir, "kandidat.json"), JSON.stringify(top, null, 2));
  const short = (t, n, end) => { const w = t.split(/\s+/); return w.length <= n ? t : end ? "… " + w.slice(-n).join(" ") : w.slice(0, n).join(" ") + " …"; };
  const md = [`# Kandidat klip: ${name}`, "", `${top.length} jendela ${MIN}-${MAX} dtk (kalimat utuh, tidak tumpang-tindih), urut waktu. Skor = pembuka kuat, akhir tuntas, padat, angka, dialog.`,
    "Pilih 3-5 yang paling berdiri sendiri (penonton paham tanpa konteks episode) dan tulis di `klip.json`; boleh menggeser from/to.", "",
    "| from-to | durasi | pembicara | skor | alasan | awal | akhir |", "|---|---|---|---|---|---|---|"];
  for (const c of top) md.push(`| ${c.from}-${c.to} | ${c.dur} dtk | ${c.speakers.join(", ") || "-"} | ${c.score} | ${c.why.join(", ")} | ${short(sents[c.a].text, 14).replace(/\|/g, "/")} | ${short(sents[c.b].text, 8, true).replace(/\|/g, "/")} |`);
  writeFileSync(path.join(kdir, "kandidat.md"), md.join("\n") + "\n");
  if (!klip) writeFileSync(klipFile, JSON.stringify({ style: S.clips?.style ?? "ngobrol", format: S.clips?.format ?? "9:16", lengthSec: [MIN, MAX], clips: [] }, null, 2) + "\n");
  console.log(`Kandidat: ${path.relative(ROOT, path.join(kdir, "kandidat.md"))} (${top.length} jendela ${MIN}-${MAX} dtk).`);
  console.log(`Tulis 3-5 usulan di ${path.relative(ROOT, klipFile)} -> "clips": [{id, title, hook, why, from, to}], lalu: npm run clips -- ${name} --check`);
  process.exit(0);
}

if (!klip?.clips?.length) throw new Error(`Belum ada usulan di ${path.relative(ROOT, klipFile)} ("clips": [...]); jalankan dulu: npm run clips -- ${name}`);
let bad = 0;
const checked = klip.clips.map((c) => ({ c, ...checkClip(c) }));
for (const { c, errors, dur } of checked) {
  for (const e of errors) (bad++, console.log(`  ERROR  ${c.id}: ${e}`));
  if (!errors.length && (dur < MIN - 5 || dur > MAX + 5)) console.log(`  !      ${c.id}: perkiraan ${dur.toFixed(0)} dtk di luar ${MIN}-${MAX} dtk`);
  if (!c.title || !c.hook) console.log(`  !      ${c.id}: title/hook belum diisi`);
}

// ---------------------------------------------------------------- cek + tabel
if (has("check")) {
  console.log("\n| id | durasi | judul | hook | alasan |\n|---|---|---|---|---|");
  for (const { c, dur } of checked) console.log(`| ${c.id} | ±${dur.toFixed(0)} dtk | ${c.title ?? ""} | ${c.hook ?? ""} | ${c.why ?? ""} |`);
  console.log(bad ? `\n${bad} error di klip.json` : `\nSiap ditanyakan ke pengguna, lalu: npm run clips -- ${name} --make=<id,...> --render`);
  process.exit(bad ? 1 : 0);
}
if (bad) process.exit(1);

// ---------------------------------------------------------------- buat proyek anak per klip terpilih
const pick = opt("make").split(",").map((x) => x.trim()).filter(Boolean);
const made = [];
for (const id of pick) {
  const ck = checked.find((x) => x.c.id === id);
  if (!ck) throw new Error(`klip "${id}" tidak ada di klip.json (${klip.clips.map((c) => c.id).join(", ")})`);
  const { c, list } = ck;
  const child = `${name}-${id.toLowerCase()}`;
  const cp = P(child);
  const cfile = path.join(cp.dir, "edit.json");
  const src0 = list[0].src;
  const masterDur = infos[src0]?.duration ?? 1e9;
  const a = Math.max(0, list[0].t[0] - 0.4), b = Math.min(masterDur, list.at(-1).t[1] + 0.6);
  if (existsSync(cfile) && !has("force")) console.log(`\n== ${child}: edit.json sudah ada (dipakai; --force untuk membuat ulang)`);
  else {
    // sumber: multikamera = semua kamera yang merekam rentang itu (digeser offset); selain itu satu footage kalimat itu
    const keepIdx = MC ? plan.sources.map((_, i) => i).filter((i) => {
      const off = i === AUD ? 0 : plan.sources[i].offset ?? 0;
      return Math.min(b - off, infos[i]?.duration ?? 0) - Math.max(0, a - off) > 1;
    }) : [src0];
    const remap = new Map(keepIdx.map((i, k) => [i, k]));
    const one = (n) => (n && remap.has(n - 1) ? remap.get(n - 1) + 1 : undefined); // nomor footage 1.. -> nomor di anak
    const sources = keepIdx.map((i) => {
      const off = MC && i !== AUD ? plan.sources[i].offset ?? 0 : 0;
      const r0 = Math.max(0, a - off), r1 = Math.min(infos[i]?.duration ?? b, b - off);
      const an = readJson(path.join(work, `src${i + 1}.analysis.json`), {});
      return { file: path.relative(cp.dir, path.join(paths.dir, plan.sources[i].file)), range: [+r0.toFixed(3), +r1.toFixed(3)], from: { project: name, src: i },
        ...(MC && i !== AUD ? { offset: +(r0 - a + off).toFixed(4) } : {}), ...(an.seats?.length ? { seatCenters: an.seats.map((x) => [x.cx, x.cy]) } : {}) };
    });
    const speakers = (plan.speakers ?? []).map((sp) => {
      const o = { id: sp.id, name: sp.name ?? "", title: sp.title ?? "" };
      for (const k of ["cam", "wide", "boxSrc"]) if (sp[k] && one(sp[k])) o[k] = one(sp[k]);
      for (const k of ["seat", "box", "lowerThird"]) if (sp[k] !== undefined) o[k] = sp[k];
      return o;
    });
    const sentences = list.map((s) => ({ id: s.id, src: remap.get(s.src), t: [+(s.t[0] - a).toFixed(2), +(s.t[1] - a).toFixed(2)], text: s.text, ...(s.spk ? { spk: s.spk } : {}), ...(s.speaker ? { speaker: s.speaker } : {}),
      flags: s.flags ?? [], keep: s.keep !== false, intent: s.intent ?? null, mode: "aroll", objects: [], why: s.why ?? "" }));
    const cplan = { style: klip.style ?? "ngobrol", ...(normFormat(klip.format ?? "9:16") !== "9:16" ? { format: normFormat(klip.format) } : {}), ...(plan.profile ? { profile: plan.profile } : {}),
      brand: plan.brand ?? { left: "", right: "" }, ...(plan.language ? { language: plan.language } : {}), duration: [Math.max(10, MIN - 10), MAX + 15],
      parent: name, clip: { id: c.id, title: c.title ?? "", hook: c.hook ?? "", why: c.why ?? "" },
      ...(speakers.length ? { speakers } : {}), ...(MC && keepIdx.length > 1 ? { multicam: true, audio: remap.get(AUD) + 1 } : {}), ...(plan.wide && one(plan.wide) ? { wide: one(plan.wide) } : {}),
      sources, glossary: plan.glossary ?? {}, sentences };
    mkdirSync(cp.dir, { recursive: true });
    writeFileSync(cfile, JSON.stringify(cplan, null, 2) + "\n");
    console.log(`\n== ${child}: klip "${c.title ?? id}" (${a.toFixed(1)}-${b.toFixed(1)} dtk dari ${name}, ${keepIdx.length} footage)`);
  }
  const node = process.execPath;
  const r = spawnSync(node, [path.join(ENGINE, "scripts", "edit.mjs"), child, "--analyze"], { cwd: ENGINE, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`analisis ${child} gagal`);
  if (has("render")) {
    const r2 = spawnSync(node, [path.join(ENGINE, "scripts", "edit.mjs"), child], { cwd: ENGINE, stdio: "inherit" });
    if (r2.status !== 0) throw new Error(`render ${child} gagal`);
  }
  made.push(child);
}
console.log(`\nKlip: ${made.join(", ")}${has("render") ? " (dirender)" : `. Tambahkan objek/caption bila perlu, lalu: npm run edit -- <klip>`}`);
