// Style = rasa video (bukan brand). Brand mana pun & jenis video apa pun boleh memakai style mana pun.
//
//   npm run style -- list                                   daftar style (bawaan plugin + milik Anda di Styles/)
//   npm run style -- show <style>                           isi style (gabungan), STYLE.md, selera terakhir
//   npm run style -- new <slug> --title="Nama Mudah" [--dari=<style>] [--kind=animasi|edit] [--jalur=html|Pop|mg4]
//        style baru di Styles/<slug>/ (kosong, atau salinan style lain untuk diubah)
//   npm run style -- save <proyek> <slug> --title="Nama Mudah" [--warna=style|brand] [--force]
//        simpan rasa video yang sudah jadi sebagai style bernama: tema HTML (tanpa identitas brand), skill, musik,
//        atau aturan edit (proyek edit) + contoh frame -> Styles/<slug>/
//   npm run style -- selera <style> "<catatan>"            catat yang disukai/ditolak pengguna -> Styles/<slug>/selera.md
//
// Isi folder style: style.json (mesin) · STYLE.md (cara menyusun, dibaca agent) · selera.md (riwayat selera) · examples/
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { BRAND_THEME_KEYS, DIRS, P, ROOT, STYLE_SLUG, brandOf, listStyles, loadStyle, readJson, resolveName, resolveStyle } from "./lib.mjs";

const argv = process.argv.slice(2);
const [cmd, a1, a2] = argv.filter((a) => !a.startsWith("--"));
const opt = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const has = (k) => argv.includes(`--${k}`);
const rel = (f) => path.relative(ROOT, f);
const today = () => new Date().toISOString().slice(0, 10);
const writeJson = (f, o) => writeFileSync(f, JSON.stringify(o, null, 2) + "\n");

const newSlug = (slug) => {
  if (!slug || !STYLE_SLUG.test(slug)) throw new Error(`Slug style wajib huruf kecil/angka/minus, mis. "papan-tulis" (bukan "${slug ?? ""}")`);
  const ada = resolveStyle(slug);
  if (ada && !has("force")) throw new Error(`Style "${slug}" sudah ada${ada !== slug ? ` (alias dari ${ada})` : ""}; pilih nama lain atau --force`);
  const dir = path.join(DIRS.styles, slug);
  mkdirSync(path.join(dir, "examples"), { recursive: true });
  return dir;
};
const titleOf = (slug) => opt("title") ?? slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const seleraHead = (title) => `# Selera: ${title}\n\nRiwayat yang disukai/ditolak pengguna untuk style ini. Format: \`- YYYY-MM-DD · <proyek/brand> · <yang dipilih/ditolak> · <alasan>\`.\n\n`;

if (!cmd || cmd === "list") {
  const rows = listStyles().map((s) => ({
    style: s.slug, nama: s.title, jenis: s.kind, jalur: s.jalur ?? (s.kind === "edit" ? "edit" : "html"), skill: s.skill ?? "", warna: s.warna ?? "",
    sumber: s.sources.join("+"), alias: s.aliases.join(", "),
  }));
  rows.length ? console.table(rows) : console.log("Belum ada style. Buat: npm run style -- new <slug> --title=\"Nama\"");
  console.log("Pakai: animasi -> npm run new -- <nama> --style=<style> [--warna=brand|style] · edit footage -> npm run edit -- <nama> --new --style=<style>");
} else if (cmd === "show") {
  const s = loadStyle(a1);
  const { dirs, sources, home, ...json } = s;
  console.log(`Style ${s.title} (${s.slug}) · ${s.kind} · sumber ${sources.join("+")}`);
  for (const d of dirs) console.log(`  folder  ${rel(d)}`);
  console.log(JSON.stringify(json, null, 2));
  for (const d of [...dirs].reverse()) {
    const md = path.join(d, "STYLE.md");
    if (existsSync(md)) { console.log(`\n--- ${rel(md)} ---\n${readFileSync(md, "utf8")}`); break; }
  }
  const sel = path.join(home, "selera.md");
  if (existsSync(sel)) {
    const lines = readFileSync(sel, "utf8").split("\n").filter((l) => l.startsWith("- "));
    console.log(`\n--- selera (${lines.length} catatan, 8 terakhir) ---\n${lines.slice(-8).join("\n") || "(kosong)"}`);
  }
  const ex = dirs.map((d) => path.join(d, "examples")).filter(existsSync).flatMap((d) => readdirSync(d).map((f) => rel(path.join(d, f))));
  if (ex.length) console.log(`\ncontoh: ${ex.join(", ")}`);
} else if (cmd === "new") {
  const dir = newSlug(a1);
  const title = titleOf(a1);
  let json;
  if (opt("dari")) {
    const src = loadStyle(opt("dari"));
    const { dirs, sources, home, slug, ...rest } = src;
    json = { ...rest, name: a1, title, aliases: [], _doc: `Turunan dari style ${src.title} (${src.slug}), ${today()}.` };
    const md = [...dirs].reverse().map((d) => path.join(d, "STYLE.md")).find(existsSync);
    if (md) writeFileSync(path.join(dir, "STYLE.md"), readFileSync(md, "utf8").replace(/^# .*$/m, `# Style: ${title} (\`${a1}\`, turunan ${src.title})`));
  } else {
    const kind = opt("kind") ?? "animasi";
    if (!["animasi", "edit"].includes(kind)) throw new Error("--kind harus animasi atau edit");
    json = kind === "edit"
      ? { name: a1, title, aliases: [], kind, jalur: "edit", _doc: "Style edit footage. Isi kunci seperti Engine/styles/ngobrol/style.json (canvas, pace, aroll, broll, type, palette, grade, subtitle)." }
      : { name: a1, title, aliases: [], kind, jalur: opt("jalur") ?? "html", skill: "vox-explainer", warna: "brand", theme: {},
          _doc: "Style animasi. theme = token kit HTML (colors, fonts, subtitle, glow, highlight, progress, label, storyboard.music); lihat Engine/kit/html/theme.default.json." };
  }
  writeJson(path.join(dir, "style.json"), json);
  if (!existsSync(path.join(dir, "STYLE.md")))
    writeFileSync(path.join(dir, "STYLE.md"), `# Style: ${title} (\`${a1}\`)\n\n## Rasa\n(2-3 kata rasa, untuk video seperti apa)\n\n## Cara menyusun\n(struktur scene, tipografi, warna, gerak, musik/SFX, yang dilarang)\n\n## Sumber\n(video referensi / video jadi / moodboard yang menjadi dasar style ini)\n`);
  writeFileSync(path.join(dir, "selera.md"), seleraHead(title) + `- ${today()} · style dibuat${opt("dari") ? ` dari ${opt("dari")}` : ""}\n`);
  console.log(`Dibuat: ${rel(dir)}/ (style.json, STYLE.md, selera.md, examples/). Isi STYLE.md, lalu pakai --style=${a1}`);
} else if (cmd === "save") {
  const name = resolveName(a1);
  const slug = a2;
  const p = P(name);
  const sb = readJson(p.storyboard, {});
  const plan = readJson(path.join(p.dir, "edit.json"), null);
  const title = titleOf(slug ?? "");
  let json, sumber;
  if (plan) {
    const base = loadStyle(plan.style ?? "ngobrol");
    const { dirs, sources, home, slug: _s, aliases, ...rest } = base;
    json = { ...rest, name: slug, title, aliases: [], _doc: `Disimpan dari proyek edit ${name} (style asal ${base.slug}), ${today()}.` };
    sumber = `proyek edit ${name} (style asal ${base.title})`;
  } else if (sb.composition === "html") {
    const tj = path.join(p.html, "theme.js");
    if (!existsSync(tj)) throw new Error(`${rel(tj)} tidak ada: proyek HTML ini tidak memakai kit (halaman khusus). Buat style kosong: npm run style -- new ${slug} --title="..." lalu tulis STYLE.md dari halaman itu`);
    const src = readFileSync(tj, "utf8");
    const theme = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
    for (const k of BRAND_THEME_KEYS) delete theme[k];
    if (theme.storyboard) delete theme.storyboard.closingSfx;
    const music = [...new Set((sb.scenes ?? []).map((s) => s.music).filter(Boolean))];
    json = { name: slug, title, aliases: [], kind: "animasi", jalur: "html", skill: sb.skill ?? theme.storyboard?.skill ?? "vox-explainer", warna: opt("warna") ?? "style", theme,
      _doc: `Disimpan dari proyek ${name} (brand ${brandOf(name)}), ${today()}. Identitas brand (watermark, mark, CTA, penutup, ui) tidak ikut.${music.length ? ` Musik dipakai: ${music.join(", ")}.` : ""}` };
    sumber = `proyek ${name}`;
  } else if (sb.composition === "Pop" || sb.composition === "mg4") {
    json = { name: slug, title, aliases: [], kind: "animasi", jalur: sb.composition, ...(sb.composition === "mg4" ? { mg4Style: sb.style, palette: sb.palette ?? {} } : { skill: "pop-cinematic-motion" }), warna: "style",
      _doc: `Disimpan dari proyek ${name}, ${today()}.` };
    sumber = `proyek ${name}`;
  } else throw new Error(`Proyek ${name} belum punya storyboard.json/edit.json yang dikenali`);
  const dir = newSlug(slug);
  writeJson(path.join(dir, "style.json"), json);
  // contoh frame: board + 3 scene tersebar + thumbnail terpilih
  const ex = [];
  const pv = p.preview;
  const scenes = existsSync(pv) ? readdirSync(pv).filter((f) => /^scene-\d+\.png$/.test(f)).sort() : [];
  const pick = scenes.length ? [...new Set([0, Math.floor(scenes.length / 2), scenes.length - 1].map((i) => scenes[i]))] : [];
  for (const f of ["board.png", ...pick]) if (existsSync(path.join(pv, f))) ex.push([path.join(pv, f), `${name}-${f}`]);
  for (const f of ["thumb-pilihan.jpg", "cover.jpg"]) if (existsSync(path.join(p.dir, "posting", f))) { ex.push([path.join(p.dir, "posting", f), `${name}-${f}`]); break; }
  for (const [from, to] of ex) copyFileSync(from, path.join(dir, "examples", to));
  if (!existsSync(path.join(dir, "STYLE.md")))
    writeFileSync(path.join(dir, "STYLE.md"), `# Style: ${title} (\`${slug}\`)\n\nDisimpan dari ${sumber}. Contoh: \`examples/\`.\n\n## Rasa\n(diisi agent: 2-3 kata rasa, cocok untuk video seperti apa)\n\n## Cara menyusun\n(diisi agent dari proyek itu: struktur scene, label bab, tipografi, warna & perannya, gerak, subtitle, musik/SFX, larangan)\n`);
  writeFileSync(path.join(dir, "selera.md"), seleraHead(title) + `- ${today()} · ${name} · disimpan sebagai style ${title}\n`);
  console.log(`Style ${title} (${slug}) disimpan dari ${sumber} -> ${rel(dir)}/ (${ex.length} contoh). Lengkapi STYLE.md, lalu pakai --style=${slug}`);
} else if (cmd === "selera") {
  const s = loadStyle(a1);
  const text = argv.filter((a) => !a.startsWith("--")).slice(2).join(" ").trim();
  if (!text) throw new Error('Pemakaian: npm run style -- selera <style> "<catatan>"');
  mkdirSync(s.home, { recursive: true });
  const f = path.join(s.home, "selera.md");
  if (!existsSync(f)) writeFileSync(f, seleraHead(s.title));
  appendFileSync(f, `- ${today()} · ${text.replace(/\n+/g, " ")}\n`);
  console.log(`Dicatat di ${rel(f)}`);
} else {
  throw new Error(`Perintah tidak dikenal: ${cmd}. Pakai: list | show | new | save | selera`);
}
