// Siapkan proyek jalur C (HTML) dari kit standar + tema brand, supaya per video cukup menulis html/scenes.js.
// Pemakaian: npm run new -- <nama> [--brand=<slug>] [--scenes=N] [--refresh-kit]
//   - tema: Engine/kit/html/theme.default.json digabung dengan Brands/<slug>/theme.json -> html/theme.js
//   - kit:  index.html, kit.css, kit-core.js, kit-run.js disalin ke Projects/<nama>/html/ (proyek tetap utuh walau kit berubah)
//   - jumlah scene dari script.md (atau --scenes=N); scenes.js & storyboard.json yang sudah ada tidak ditimpa
//   - --refresh-kit: hanya salin ulang file kit + theme.js (mis. setelah tema brand diubah)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DIRS, ENGINE, NAME_RE, P, ROOT, brandOf, parseScript, readJson } from "./lib.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const name = argv.find((a) => !a.startsWith("--"));
if (!name || !NAME_RE.test(name)) throw new Error("Pemakaian: npm run new -- YYYYMMDD-NN-slug [--brand=<slug>]");
const p = P(name);
const brand = opt("brand", brandOf(name));
const KIT = path.join(ENGINE, "kit", "html");
for (const d of [p.html, path.join(p.dir, "posting"), p.assets]) mkdirSync(d, { recursive: true });

// 1) tema = bawaan + tema brand (gabung dalam)
const merge = (a, b) => {
  if (Array.isArray(b) || typeof b !== "object" || b === null) return b === undefined ? a : b;
  const o = { ...(a ?? {}) };
  for (const k of Object.keys(b)) o[k] = merge(o[k], b[k]);
  return o;
};
const brandTheme = path.join(DIRS.brands, brand, "theme.json");
if (!existsSync(brandTheme)) console.warn(`  !     ${path.relative(ROOT, brandTheme)} belum ada: pakai tema bawaan (buat dari Engine/kit/html/README.md)`);
const theme = merge(readJson(path.join(KIT, "theme.default.json")), readJson(brandTheme, {}));
delete theme._doc;
writeFileSync(path.join(p.html, "theme.js"), `// tema ${brand} (dibuat npm run new dari ${existsSync(brandTheme) ? `Brands/${brand}/theme.json` : "tema bawaan"})\nconst THEME = ${JSON.stringify(theme, null, 2)};\n`);
for (const f of ["index.html", "kit.css", "kit-core.js", "kit-run.js"]) copyFileSync(path.join(KIT, f), path.join(p.html, f));
console.log(`  OK    kit + tema ${brand} -> ${path.relative(ROOT, p.html)}/`);
if (argv.includes("--refresh-kit")) process.exit(0);

// 2) jumlah scene
const scenes = existsSync(p.script) ? parseScript(readFileSync(p.script, "utf8")).scenes : [];
const n = +opt("scenes", 0) || scenes.length;
if (!n) throw new Error("Jumlah scene tidak diketahui: tulis script.md dulu atau beri --scenes=N");
const closing = !!theme.closing;

// 3) kerangka scenes.js
const sj = path.join(p.html, "scenes.js");
if (!existsSync(sj)) {
  const body = Array.from({ length: closing ? n - 1 : n }, (_, i) => {
    const txt = scenes[i]?.text ? `\n// "${scenes[i].text.replace(/\s+/g, " ")}"` : "";
    return `// ============ ${i + 1} ============${txt}\nscene(${i});\n{\n  const s = ${i};\n}\n`;
  }).join("\n");
  const L = Array.from({ length: n }, (_, i) => (closing && i === n - 1 ? "null" : "B1")).join(", ");
  writeFileSync(sj, `// ${name} · scene khusus video ini. Komponen & aturan timing: Engine/kit/html/README.md
// Label bab per scene: [teks, warna titik] (null = tanpa label).
const B1 = ["NAMA BAB", C.accent2], K = ["KESIMPULAN", C.accent];
const LABEL = [${L}];
// const KEY = { 0: ["kata"] };  // kata kunci subtitle (warna subtitle.key tema)

${body}${closing ? `\n// ============ ${n} · Penutup brand ============\nscene(${n - 1});\nclosing(${n - 1});\n` : ""}`);
  console.log(`  OK    kerangka ${path.relative(ROOT, sj)} (${n} scene${closing ? ", penutup dari tema" : ""})`);
}

// 4) kerangka storyboard.json
if (!existsSync(p.storyboard)) {
  const S = theme.storyboard || {}, m = S.music || {};
  const brandBox = theme.watermark?.parts ? { left: "", right: theme.watermark.parts.map(([t]) => t).join("") } : { left: "", right: "" };
  const sb = {
    composition: "html", skill: S.skill || "vox-explainer", brandOverlay: S.brandOverlay ?? false, brand: brandBox, cover: { at: "auto" },
    scenes: Array.from({ length: n }, (_, i) => ({
      music: i === 0 ? m.first ?? "pad" : i >= n - 3 ? m.last ?? "full" : m.middle ?? "build",
      sfx: closing && i === n - 1 && S.closingSfx?.cue ? [{ cue: S.closingSfx.cue, type: S.closingSfx.type }] : [],
    })),
  };
  writeFileSync(p.storyboard, JSON.stringify(sb, null, 2).replace(/\{\s+"cue": "([^"]+)",\s+"type": "([^"]+)"\s+\}/g, '{"cue": "$1", "type": "$2"}') + "\n");
  console.log(`  OK    kerangka ${path.relative(ROOT, p.storyboard)} (isi sfx per scene)`);
}
