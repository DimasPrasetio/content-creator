// Siapkan proyek jalur C (HTML) dari kit standar + STYLE (rasa) + identitas brand, supaya per video cukup menulis html/scenes.js.
// Pemakaian: npm run new -- <nama> [--style=<slug>] [--warna=brand|style] [--brand=<slug>] [--format=9:16|16:9|4:5|1:1]
//                            [--bab=tanpa|label|kartu] [--scenes=N] [--refresh-kit]
//   - format: kanvas asli (bawaan 9:16; 16:9 = YouTube/landscape, 4:5 & 1:1 = feed), dicatat di storyboard "format"
//   - bab: tampilan bab dari "> bab: <judul>" di naskah (tanpa = tidak tampil; label = label atas; kartu = label + kartu judul)
//   - style: --style, lalu "style" di storyboard.json, lalu style bawaan brand (profile.json "style"); daftar: npm run style -- list
//   - tema:  kit bawaan < style.theme < identitas brand (watermark, mark, CTA, penutup, ui) < warna brand (bila warna = brand)
//            tanpa style: kit bawaan < Brands/<slug>/theme.json (perilaku lama)
//   - kit:   index.html, kit.css, kit-core.js, kit-camera.js, kit-run.js (+ cap brand theme.ui.stamp) disalin ke Projects/<nama>/html/ (proyek tetap utuh walau kit berubah)
//   - jumlah scene dari script.md (atau --scenes=N); scenes.js & storyboard.json yang sudah ada tidak ditimpa (style/warna dicatat)
//   - --refresh-kit: hanya salin ulang file kit + theme.js (mis. setelah tema brand/style diubah)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DIRS, ENGINE, NAME_RE, P, ROOT, brandOf, brandStyle, kitTheme, loadStyle, normFormat, parseScript, readJson } from "./lib.mjs";

const argv = process.argv.slice(2);
const opt = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const name = argv.find((a) => !a.startsWith("--"));
if (!name || !NAME_RE.test(name)) throw new Error("Pemakaian: npm run new -- YYYYMMDD-NN-slug [--style=<slug>] [--warna=brand|style] [--brand=<slug>]");
const p = P(name);
const brand = opt("brand", brandOf(name));
const KIT = path.join(ENGINE, "kit", "html");
for (const d of [p.html, path.join(p.dir, "posting"), p.assets]) mkdirSync(d, { recursive: true });

// 1) style + tema
const sbOld = readJson(p.storyboard, null);
const styleName = opt("style") ?? sbOld?.style ?? brandStyle(brand);
if (styleName) {
  const st = loadStyle(styleName);
  if ((st.jalur ?? "html") !== "html")
    throw new Error(`Style "${st.slug}" memakai jalur ${st.jalur} (bukan HTML): ${st.jalur === "Pop" ? "storyboard \"composition\": \"Pop\" lalu npm run render" : st.kind === "edit" ? "npm run edit" : "lihat STYLE.md style itu"}`);
}
const brandTheme = path.join(DIRS.brands, brand, "theme.json");
if (!styleName && !existsSync(brandTheme)) console.warn(`  !     belum ada style maupun ${path.relative(ROOT, brandTheme)}: pakai tema bawaan kit (pilih style: npm run style -- list)`);
const { theme, style, warna, sumber } = kitTheme({ brand, style: styleName, warna: opt("warna") ?? sbOld?.warna });
// cap/segel brand untuk kit kamera (theme.ui.stamp = path relatif ke Brands/<slug>/) -> html/stamp.<ext>
if (theme.ui?.stamp) {
  const src = path.join(DIRS.brands, brand, theme.ui.stamp);
  if (existsSync(src)) { const dst = `stamp${path.extname(src)}`; copyFileSync(src, path.join(p.html, dst)); theme.ui.stampSrc = dst; }
  else console.warn(`  !     ui.stamp ${path.relative(ROOT, src)} tidak ada: cap memakai lingkaran ✓ bawaan`);
}
// logo brand sebagai watermark (theme.watermark.image = path relatif ke Brands/<slug>/) -> html/watermark.<ext>
if (theme.watermark?.image) {
  const src = path.join(DIRS.brands, brand, theme.watermark.image);
  if (existsSync(src)) { const dst = `watermark${path.extname(src)}`; copyFileSync(src, path.join(p.html, dst)); theme.watermark.src = dst; }
  else console.warn(`  !     watermark.image ${path.relative(ROOT, src)} tidak ada: watermark memakai teks parts`);
}
writeFileSync(path.join(p.html, "theme.js"), `// tema ${style ? `style ${style} · brand ${brand} · warna ${warna}` : brand} (dibuat npm run new dari ${sumber.join(" < ")})\nconst THEME = ${JSON.stringify(theme, null, 2)};\n`);
for (const f of ["index.html", "kit.css", "kit-core.js", "kit-camera.js", "kit-run.js"]) copyFileSync(path.join(KIT, f), path.join(p.html, f));
console.log(`  OK    kit + ${style ? `style ${style} (warna ${warna}) + brand ${brand}` : `tema ${brand}`} -> ${path.relative(ROOT, p.html)}/`);
// format & bab (v0.8)
const format = normFormat(opt("format") ?? sbOld?.format ?? "9:16");
const bab = opt("bab") ?? sbOld?.bab ?? "tanpa";
if (!["tanpa", "label", "kartu"].includes(bab)) throw new Error(`--bab=${bab} tidak dikenal (tanpa | label | kartu)`);
// catat style/format/bab di storyboard yang sudah ada (thumbnail & refresh memakai tema yang sama)
if (sbOld && ((style && (sbOld.style !== style || sbOld.warna !== warna)) || (sbOld.format ?? "9:16") !== format || (sbOld.bab ?? "tanpa") !== bab))
  writeFileSync(p.storyboard, JSON.stringify({ ...sbOld, ...(style ? { style, warna } : {}), format, bab }, null, 2) + "\n");
if (format !== "9:16") console.log(`  OK    kanvas ${format}${bab !== "tanpa" ? ` · bab: ${bab}` : ""}`);
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
  const hasBab = bab !== "tanpa" && scenes.some((x) => x.chapter);
  const L = hasBab ? "" : Array.from({ length: n }, (_, i) => (closing && i === n - 1 ? "null" : "B1")).join(", ");
  writeFileSync(sj, `// ${name} · scene khusus video ini. Komponen & aturan timing: Engine/kit/html/README.md
// Label bab per scene: [teks, warna titik] (null = tanpa label).${hasBab ? " Kosong = judul bab dari naskah (\"> bab: ...\")." : ""}
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
    composition: "html", skill: S.skill || "vox-explainer", ...(style ? { style, warna } : {}), ...(format !== "9:16" ? { format } : {}), ...(bab !== "tanpa" ? { bab } : {}), brandOverlay: S.brandOverlay ?? false, brand: brandBox, cover: { at: "auto" },
    scenes: Array.from({ length: n }, (_, i) => ({
      music: i === 0 ? m.first ?? "pad" : i >= n - 3 ? m.last ?? "full" : m.middle ?? "build",
      sfx: closing && i === n - 1 && S.closingSfx?.cue ? [{ cue: S.closingSfx.cue, type: S.closingSfx.type }] : [],
    })),
  };
  writeFileSync(p.storyboard, JSON.stringify(sb, null, 2).replace(/\{\s+"cue": "([^"]+)",\s+"type": "([^"]+)"\s+\}/g, '{"cue": "$1", "type": "$2"}') + "\n");
  console.log(`  OK    kerangka ${path.relative(ROOT, p.storyboard)} (isi sfx per scene)`);
}
