// Uji alur utuh content-creator pada proyek sementara, lalu dibersihkan.
//
//   npm run selftest                tanpa kredit: suara dari video contoh (--audio), semua mesin & langkah pasca-produksi
//   npm run selftest -- --full      + render akhir mg4 dan preview Pop (lebih lama, ±6-8 menit)
//   npm run selftest -- --real-voice   suara dibuat ElevenLabs (voice default, ±120 karakter kredit) untuk menguji
//                                   jalur API sungguhan; hanya setelah pengguna setuju
//   --keep                          proyek uji tidak dihapus (untuk diperiksa)
//   --only=podcast                  hanya bagian podcast + klip (v0.9)
//   --only=layar | montase          hanya rekaman layar/tutorial atau vlog/montase (v0.10; juga cepat|buang|wajah|ai|v916|musik|vo|vlog)
//   --only=tiktok                   hanya unggah TikTok (v0.11; halaman TikTok tiruan lokal, tanpa jaringan & tanpa akun)
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DIRS, ENGINE, P, ROOT, kitTheme, mg4Skill, resolveStyle, run, youtubeChapters } from "./lib.mjs";
import { podcastTest } from "./selftest_podcast.mjs";
import { layarTest } from "./selftest_layar.mjs";
import { tiktokTest } from "./selftest_tiktok.mjs";

const args = process.argv.slice(2);
const full = args.includes("--full");
const real = args.includes("--real-voice");
const keep = args.includes("--keep");
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const NAME = "00000000-00-selftest";
const p = P(NAME);
// sampel bawaan plugin: naskah 3 scene + suara (selftest/sample.mp3), jadi tidak bergantung pada video di workspace
const SAMPLE_MD = path.join(ENGINE, "selftest", "sample.md");
const SAMPLE_AUDIO = path.join(ENGINE, "selftest", "sample.mp3");
const rows = [];

const step = (label, cmd, a, { allowFail = false } = {}) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, a, { cwd: ENGINE, encoding: "utf8" });
  const okk = r.status === 0;
  const out = (r.stdout + r.stderr).trim().split("\n").filter(Boolean);
  rows.push({ langkah: label, hasil: okk ? "LULUS" : allowFail ? "PERINGATAN" : "GAGAL", detik: Math.round((Date.now() - t0) / 1000), catatan: (out.findLast((l) => /Selesai|lolos|gagal|error|GAGAL|siap|PASS|FAIL|Cek tata/i.test(l)) ?? out.at(-1) ?? "").trim().slice(0, 90) });
  process.stdout.write(`${okk ? "✓" : "✗"} ${label}\n`);
  if (!okk && !allowFail) console.log(out.slice(-12).join("\n"));
  step.last = out.join("\n");
  return okk;
};
const npm = (label, script, a = [], o) => step(label, "npm", ["run", "-s", script, "--", ...a], o);
const finish = () => {
  console.table(rows);
  const failed = rows.filter((r) => r.hasil === "GAGAL").length;
  console.log(failed ? `\n${failed} langkah GAGAL.` : "\nSemua langkah lulus.");
  process.exit(failed ? 1 : 0);
};
if (only === "podcast") {
  console.log("Selftest podcast + klip (tanpa kredit)\n");
  podcastTest({ npm, rows, step, keep, sampleAudio: SAMPLE_AUDIO });
  finish();
}
if (["layar", "montase", "cepat", "buang", "wajah", "ai", "musik", "vo", "vlog", "v916"].includes(only)) {
  console.log(`Selftest ${only} (tanpa kredit)\n`);
  layarTest({ npm, rows, step, keep, sampleAudio: SAMPLE_AUDIO, sampleMd: SAMPLE_MD, only });
  finish();
}

if (only === "tiktok") {
  console.log("Selftest unggah TikTok (tiruan lokal, tanpa jaringan)\n");
  await tiktokTest({ npm, rows, step, keep });
  finish();
}

const clean = () => {
  rmSync(p.dir, { recursive: true, force: true });
  rmSync(p.work, { recursive: true, force: true });
  rmSync(p.resultDir, { recursive: true, force: true });
  rmSync(path.join(ENGINE, "public", "audio", `${NAME}.wav`), { force: true });
  rmSync(path.join(ENGINE, "public", "audio", `${NAME}.mix.wav`), { force: true });
};

clean();
mkdirSync(p.dir, { recursive: true });
mkdirSync(p.work, { recursive: true });
if (!existsSync(SAMPLE_MD) || !existsSync(SAMPLE_AUDIO)) throw new Error("Sampel selftest tidak ada di Engine/selftest/ (jalankan ulang /content-creator:setup)");
const src = path.join(p.work, "src.mp3");
if (real) {
  writeFileSync(p.script, "---\njudul: selftest\nlanguage: id\n---\n\n## 1\nEh, tahu nggak? Video ini dibuat otomatis.\n\n## 2\nMulai dari naskah, suara, sampai siap upload!\n");
  writeFileSync(p.plain, "[excited] Eh, tahu nggak? Video ini dibuat otomatis.\n\nMulai dari naskah, suara, sampai siap upload!\n");
} else {
  copyFileSync(SAMPLE_MD, p.script);
  copyFileSync(SAMPLE_AUDIO, src);
  // waktu per kata sampel (hasil forced alignment ElevenLabs): sinkron tanpa whisper & tanpa kredit
  copyFileSync(SAMPLE_AUDIO.replace(/\.mp3$/, ".align.json"), src.replace(/\.mp3$/, ".align.json"));
}
const scenesN = real ? 2 : 3;
const lines = real
  ? [{ lines: ["tahu nggak?", "dibuat otomatis."], key: "otomatis" }, { lines: ["sampai siap upload!"], key: "upload" }]
  : [
      { lines: ["Bikin video pendek", "itu gampang,"], key: "gampang" },
      { lines: ["naskah, suara,", "visual yang sinkron."], key: "sinkron" },
      { lines: ["dicek otomatis", "sebelum diunggah!"], key: "otomatis" },
    ];
const sb = (composition, extra = {}) =>
  writeFileSync(p.storyboard, JSON.stringify({ composition, brand: { left: "SELFTEST", right: "" }, ...extra, scenes: lines.map((l, i) => ({ ...l, music: i === 1 ? "pad" : "full", sfx: i === 0 ? [{ cue: l.key, type: "impact" }] : [] })) }, null, 2));

console.log(`Selftest ${real ? "(suara ElevenLabs sungguhan)" : "(tanpa kredit)"}${full ? " + render penuh mg4 & Pop" : ""}\n`);
npm("cek kesiapan", "check", [], { allowFail: true });
// 1) contoh frame gaya sebelum suara (mg4 draft + HTML draft)
sb("mg4", { style: "kinetic-type" });
const hasMg4 = !!mg4Skill();
if (hasMg4) npm("contoh frame mg4 (draft, tanpa suara)", "mg4", [NAME, "--draft", "--style=kinetic-type", "--scenes=1,2"]);
else rows.push({ langkah: "contoh frame mg4", hasil: "DILEWATI", detik: 0, catatan: "skill motion-graphics-v4 (Anthropic) tidak terpasang" });
mkdirSync(p.html, { recursive: true });
writeFileSync(
  path.join(p.html, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:P;src:url(/fonts/Poppins-Black.ttf)}html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#0B1026;font-family:P,sans-serif}
#t{position:absolute;left:90px;right:170px;top:640px;color:#F4F1E8;font-size:76px;line-height:1.05;text-transform:uppercase}#t span{display:inline-block;margin-right:20px}</style></head>
<body><div id="t"></div><script>const T=window.__TIMING__;const el=document.getElementById('t');let cur=-1;
window.seek=(t)=>{const i=Math.max(0,T.scenes.findIndex(s=>t>=s.start&&t<s.end));const s=T.scenes[i];if(i!==cur){cur=i;el.innerHTML=s.words.slice(0,8).map(w=>'<span>'+w.w+'</span>').join('');}
[...el.children].forEach((sp,k)=>{const p=Math.min(1,Math.max(0,(t-s.words[k].s+.1)/.25));sp.style.opacity=p;});};window.seek(0);</script></body></html>`,
);
sb("html");
npm("contoh frame HTML (draft) + cek tata letak", "html", [NAME, "--preview", "--draft"]);
// 2) suara
if (real) npm("voice over ElevenLabs (kredit)", "voice", [NAME]);
else npm("voice over (audio contoh, sinkron per kata)", "voice", [NAME, `--audio=${src}`]);
// 3) musik track (tiruan, menguji jalur music.wav) + SFX
run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=8,volume=0.3", "-ar", "44100", "-ac", "1", path.join(p.work, "music.wav")]);
npm("musik + SFX (jalur track music.wav)", "sound", [NAME]);
rows.push({ langkah: "track musik terpakai", hasil: /Musik: track (dari work\/|ElevenLabs)/.test(step.last) ? "LULUS" : "GAGAL", detik: 0, catatan: "sound.py memakai work/<nama>/music.wav" });
// 4) jalur HTML: preview + render + QA + posting + export
npm("preview HTML + cek tata letak", "html", [NAME, "--preview"]);
npm("render akhir HTML", "html", [NAME]);
npm("QA (format, loudness, suara, sinkron, tata letak)", "qa", [NAME]);
mkdirSync(path.join(p.dir, "posting"), { recursive: true });
writeFileSync(path.join(p.dir, "posting", "caption.md"), "Bikin video pendek itu gampang, kalau alurnya jelas.\n\nNaskah, suara, dan visual dibuat sinkron lalu dicek otomatis.\n\nSimpan video ini!\n\n#contentcreator #videopendek #tips #produktivitas\n");
// sampul khusus: 2 varian (frame video + polos) -> npm run thumbnail lewat posting
writeFileSync(path.join(p.dir, "posting", "thumbnail.json"), JSON.stringify({ pick: 1, variants: [
  { trigger: "kontras", kicker: "VIDEO PENDEK", headline: "Ternyata gampang kok", accent: "gampang", sub: "Asal alurnya jelas", sticker: "check", layout: "tengah" },
  { trigger: "larangan", headline: "Jangan unggah sebelum dicek", accent: "dicek", sticker: "alert", visual: false },
] }, null, 2));
npm("paket posting (subtitle, thumbnail khusus, caption)", "posting", [NAME]);
rows.push({ langkah: "varian thumbnail", hasil: [1, 2].every((i) => existsSync(path.join(p.dir, "posting", `thumb-${i}.jpg`))) && existsSync(path.join(p.dir, "posting", "thumb-grid.jpg")) ? "LULUS" : "GAGAL", detik: 0, catatan: "posting/thumb-1..2.jpg + thumb-grid.jpg" });
rows.push({ langkah: "isi folder hasil", hasil: ["thumbnail.jpg", "caption.txt", `${NAME}.mp4`].every((f) => existsSync(path.join(p.resultDir, f))) ? "LULUS" : "GAGAL", detik: 0, catatan: "Result/<brand>/<nama>/: video, thumbnail.jpg, caption.txt" });
npm("ekspor 4:5 + 16:9", "export", [NAME, "--format=4x5,16x9"]);
// 5) versi: render ulang menyimpan versi lama
npm("render ulang (versi lama disimpan)", "html", [NAME]);
rows.push({ langkah: "versi tersimpan", hasil: existsSync(path.join(p.dir, "versions", "v1.mp4")) ? "LULUS" : "GAGAL", detik: 0, catatan: "Projects/<nama>/versions/v1.mp4" });
if (full) {
  if (hasMg4) {
    sb("mg4", { style: "clay-pop" });
    npm("render akhir mg4 + selfcheck", "mg4", [NAME]);
    npm("QA mg4", "qa", [NAME]);
  }
  writeFileSync(p.storyboard, JSON.stringify({ composition: "Pop", brand: { left: "SELFTEST", right: "" }, scenes: Array.from({ length: scenesN }, (_, i) => ({ key: `EX${i + 1}`, trans: i ? "slash" : "none" })) }, null, 2));
  npm("preview Pop + cek tata letak", "render", [NAME, "--preview"], { allowFail: true });
}
// 6) mesin edit footage (style ngobrol, dipanggil dengan nama lama "narration" untuk menguji alias), tanpa kredit: footage sintetis + suara sampel + transkrip sidecar
const NE = "00000000-02-selftest-edit";
const pe = P(NE);
const cleanEdit = () => {
  for (const d of [pe.dir, pe.work, pe.resultDir]) rmSync(d, { recursive: true, force: true });
  rmSync(path.join(ENGINE, "public", "audio", `${NE}.wav`), { force: true });
  const md = path.join(ENGINE, "public", "media", "edit");
  if (existsSync(md)) for (const f of readdirSync(md)) if (f.startsWith(NE)) rmSync(path.join(md, f), { force: true });
};
cleanEdit();
const raw = path.join(ENGINE, "work", "_edit-sample");
mkdirSync(raw, { recursive: true });
run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30", "-i", SAMPLE_AUDIO, "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(raw, "footage.mp4")]);
copyFileSync(SAMPLE_AUDIO.replace(/\.mp3$/, ".align.json"), path.join(raw, "footage.words.json"));
npm("edit: proyek baru (style ngobrol lewat alias narration)", "edit", [NE, "--new", "--style=narration", `--input=${path.join(raw, "footage.mp4")}`, "--force"]);
npm("edit: normalisasi + analisis konteks", "edit", [NE, "--analyze"]);
// aset AI (Higgsfield) lewat CLI tiruan: perkiraan biaya, batas kredit, unduh, cache -> klip penuh di kalimat ketiga
process.env.HIGGSFIELD_BIN = path.join(ENGINE, "scripts", "stub", "higgsfield.mjs");
mkdirSync(pe.dir, { recursive: true });
writeFileSync(path.join(pe.dir, "gen.json"), JSON.stringify({ budget: 40, items: [{ id: "klip", kind: "video", prompt: "slow dolly-in, empty desk, no text", aspect_ratio: "9:16", duration: 3 }] }));
npm("gen: aset Higgsfield (CLI tiruan, tanpa kredit)", "gen", [NE, "--yes"]);
rows.push({ langkah: "gen: klip tersimpan", hasil: existsSync(path.join(pe.assets, "gen", "klip.mp4")) ? "LULUS" : "GAGAL", detik: 0, catatan: "assets/gen/klip.mp4 + manifest" });
delete process.env.HIGGSFIELD_BIN;
const ej = path.join(pe.dir, "edit.json");
if (existsSync(ej)) {
  const plan = JSON.parse(readFileSync(ej, "utf8"));
  const [a, b, c] = plan.sentences;
  if (a) Object.assign(a, { intent: "hook", objects: [{ type: "keyword", kicker: "bikin video", keyword: "gampang", at: "gampang" }] });
  if (b) Object.assign(b, { intent: "langkah", mode: "broll", objects: [{ type: "keyword", kicker: "mulai dari", keyword: "naskah", at: "naskah" },
    { type: "doc", title: "alur.docx", at: "naskah", rows: [{ label: "Naskah", at: "naskah" }, { label: "Suara", at: "suara" }, { label: "Visual", at: "visual" }] }] });
  if (c) Object.assign(c, { intent: "hasil", punch: "strong", objects: [{ type: "clip", file: "assets/gen/klip.mp4", at: "start" }, { type: "chips", items: [{ text: "dicek otomatis", icon: "check", at: "dicek" }] }, { type: "card", kicker: "hasil", title: "siap diunggah", at: "diunggah" }] });
  writeFileSync(ej, JSON.stringify(plan, null, 2));
}
npm("edit: potong + grading + grafis + render + QA", "edit", [NE]);
rows.push({ langkah: "edit: hasil video", hasil: existsSync(pe.result) && /Semua pengecekan lolos/.test(step.last) ? "LULUS" : "GAGAL", detik: 0, catatan: "Result/umum/<nama>/<nama>.mp4 + QA" });
if (!keep) cleanEdit();
rmSync(raw, { recursive: true, force: true });

// 7) style lepas dari brand: style + identitas brand + warna brand/style, simpan proyek jadi style, catat selera
{
  const NS = "00000000-05-selftest-style", ps = P(NS);
  const SG = path.join(DIRS.styles, "zz-selftest-gaya"), SS = path.join(DIRS.styles, "zz-selftest-simpan"), BR = path.join(DIRS.brands, "zz-selftest-brand");
  const cleanStyle = () => { for (const d of [ps.dir, ps.work, ps.resultDir, SG, SS, BR]) rmSync(d, { recursive: true, force: true }); };
  cleanStyle();
  mkdirSync(SG, { recursive: true });
  mkdirSync(BR, { recursive: true });
  writeFileSync(path.join(SG, "style.json"), JSON.stringify({ name: "zz-selftest-gaya", title: "Uji Gaya", aliases: ["zz-gaya-lama"], kind: "animasi", jalur: "html", skill: "launch-video", warna: "brand",
    theme: { colors: { bg: "#010101", accent: "#AA0000" }, subtitle: { said: "accent", unsaid: "dim", key: "accent" }, fonts: { head: "Uji Head" } } }));
  writeFileSync(path.join(BR, "profile.json"), JSON.stringify({ nama: "Uji", brand: { left: "", right: "UJI" }, style: "zz-gaya-lama" }));
  writeFileSync(path.join(BR, "theme.json"), JSON.stringify({ colors: { accent: "#00BB00" }, subtitle: { said: "text" }, watermark: { parts: [["UJI", "accent"]] } }));
  const t1 = kitTheme({ brand: "zz-selftest-brand", style: "zz-gaya-lama" }).theme, t2 = kitTheme({ brand: "zz-selftest-brand", style: "zz-selftest-gaya", warna: "style" }).theme;
  const okMerge = t1.colors.accent === "#00BB00" && t1.colors.bg === "#010101" && t1.subtitle.said === "accent" && t1.fonts.head === "Uji Head" && t1.watermark?.parts?.[0]?.[0] === "UJI" && t1.storyboard.skill === "launch-video"
    && t2.colors.accent === "#AA0000" && t2.watermark?.parts?.[0]?.[0] === "UJI" && resolveStyle("narration") === "ngobrol" && resolveStyle("Uji Gaya") === "zz-selftest-gaya";
  rows.push({ langkah: "style: gabung tema (style < identitas brand < warna)", hasil: okMerge ? "LULUS" : "GAGAL", detik: 0, catatan: okMerge ? "alias, warna brand/style, watermark brand" : JSON.stringify({ a: t1.colors.accent, s: t1.subtitle, w: t2.colors.accent }).slice(0, 90) });
  npm("style: daftar", "style", ["list"]);
  mkdirSync(ps.dir, { recursive: true });
  copyFileSync(SAMPLE_MD, ps.script);
  writeFileSync(ps.script, readFileSync(ps.script, "utf8").replace(/^---\n/, "---\nprofile: zz-selftest-brand\n"));
  npm("style: proyek baru memakai style bawaan brand", "new", [NS]);
  const th = existsSync(path.join(ps.html, "theme.js")) ? readFileSync(path.join(ps.html, "theme.js"), "utf8") : "";
  const sbs = JSON.parse(existsSync(ps.storyboard) ? readFileSync(ps.storyboard, "utf8") : "{}");
  rows.push({ langkah: "style: theme.js & storyboard", hasil: th.includes("#00BB00") && th.includes("Uji Head") && sbs.style === "zz-selftest-gaya" && sbs.skill === "launch-video" ? "LULUS" : "GAGAL", detik: 0, catatan: `style ${sbs.style ?? "-"} · skill ${sbs.skill ?? "-"}` });
  npm("style: simpan proyek jadi style bernama", "style", ["save", NS, "zz-selftest-simpan", "--title=Uji Simpan"]);
  const saved = JSON.parse(existsSync(path.join(SS, "style.json")) ? readFileSync(path.join(SS, "style.json"), "utf8") : "{}");
  rows.push({ langkah: "style: hasil simpan tanpa identitas brand", hasil: saved.theme?.fonts?.head === "Uji Head" && !("watermark" in (saved.theme ?? {})) && saved.title === "Uji Simpan" ? "LULUS" : "GAGAL", detik: 0, catatan: "Styles/<slug>/style.json" });
  npm("style: catat selera (nama tampilan)", "style", ["selera", "Uji Simpan", "contoh catatan selera"]);
  if (!keep) cleanStyle();
}

// 8) kanvas lain + bab (v0.8): HTML 16:9 dengan bab kartu (voice -> preview -> render -> QA -> posting YouTube -> ekspor 9:16),
//    contoh 4:5 & 1:1, edit footage 16:9 dari footage mendatar, dan syarat bab YouTube
{
  const NF = "00000000-08-selftest-format", pf = P(NF);
  const NE2 = "00000000-09-selftest-edit169", pe2 = P(NE2);
  const cleanF = () => {
    for (const d of [pf.dir, pf.work, pf.resultDir, pe2.dir, pe2.work, pe2.resultDir]) rmSync(d, { recursive: true, force: true });
    for (const n of [NF, NE2]) for (const x of [".wav", ".mix.wav"]) rmSync(path.join(ENGINE, "public", "audio", `${n}${x}`), { force: true });
    const md = path.join(ENGINE, "public", "media", "edit");
    if (existsSync(md)) for (const f of readdirSync(md)) if (f.startsWith(NE2)) rmSync(path.join(md, f), { force: true });
  };
  cleanF();
  const layoutRow = (label) => {
    const l = step.last.split("\n").findLast((x) => /Cek tata letak/.test(x)) ?? "";
    rows.push({ langkah: label, hasil: /Cek tata letak: 0 error/.test(l) ? "LULUS" : "GAGAL", detik: 0, catatan: l.trim().slice(0, 90) });
  };
  const probe = (f) => (existsSync(f) ? run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).trim().match(/^\d+,\d+/)?.[0] ?? "?" : "-");
  mkdirSync(pf.work, { recursive: true });
  mkdirSync(pf.dir, { recursive: true });
  writeFileSync(pf.script, readFileSync(SAMPLE_MD, "utf8").replace(/^(## (\d))$/gm, (m, h, n) => `${h}\n> bab: Bagian ${n}`));
  copyFileSync(SAMPLE_AUDIO, path.join(pf.work, "src.mp3"));
  copyFileSync(SAMPLE_AUDIO.replace(/\.mp3$/, ".align.json"), path.join(pf.work, "src.align.json"));
  npm("format: proyek HTML 16:9 + bab kartu", "new", [NF, "--format=16:9", "--bab=kartu"]);
  writeFileSync(path.join(pf.html, "scenes.js"), `const LABEL = [];
${lines.map((l, i) => `scene(${i});\n{ const s = ${i}; big(540, 420, "${l.key.toUpperCase()}", C.accent, cue(s, "${l.key}"), 150); }`).join("\n")}
`);
  npm("format: voice (audio contoh)", "voice", [NF, `--audio=${path.join(pf.work, "src.mp3")}`]);
  npm("format: sound", "sound", [NF]);
  npm("format: preview 16:9 + cek tata letak", "html", [NF, "--preview"]);
  layoutRow("format: tata letak 16:9 tanpa error");
  rows.push({ langkah: "format: kartu bab di preview", hasil: existsSync(path.join(pf.preview, "bab-02.png")) ? "LULUS" : "GAGAL", detik: 0, catatan: "preview/bab-NN.png" });
  npm("format: render 16:9", "html", [NF]);
  rows.push({ langkah: "format: video 1920x1080", hasil: probe(pf.result) === "1920,1080" ? "LULUS" : "GAGAL", detik: 0, catatan: probe(pf.result) });
  npm("format: QA 16:9", "qa", [NF]);
  mkdirSync(path.join(pf.dir, "posting"), { recursive: true });
  writeFileSync(path.join(pf.dir, "posting", "caption.md"), "Bikin video itu gampang, kalau alurnya jelas.\n\nNaskah, suara, dan visual dibuat sinkron.\n\nTonton sampai habis!\n\n#contentcreator #youtube #tips\n");
  writeFileSync(path.join(pf.dir, "posting", "thumbnail.json"), JSON.stringify({ pick: 1, variants: [{ trigger: "kontras", kicker: "VIDEO PANJANG", headline: "Ternyata gampang kok", accent: "gampang", sticker: "check" }, { trigger: "larangan", headline: "Jangan unggah sebelum dicek", accent: "dicek", visual: false }] }));
  npm("format: posting YouTube (thumbnail 1280x720, deskripsi)", "posting", [NF]);
  rows.push({ langkah: "format: thumbnail YouTube", hasil: probe(path.join(pf.resultDir, "thumbnail.jpg")) === "1280,720" ? "LULUS" : "GAGAL", detik: 0, catatan: probe(path.join(pf.resultDir, "thumbnail.jpg")) });
  npm("format: ekspor 16:9 -> 9:16", "export", [NF, "--format=9x16"]);
  rows.push({ langkah: "format: ekspor 9x16", hasil: probe(pf.result.replace(/\.mp4$/, ".9x16.mp4")) === "1080,1920" ? "LULUS" : "GAGAL", detik: 0, catatan: "<nama>.9x16.mp4" });
  for (const f of ["4:5", "1:1"]) {
    npm(`format: ganti kanvas ke ${f}`, "new", [NF, `--format=${f}`]);
    npm(`format: preview ${f}`, "html", [NF, "--preview"]);
    layoutRow(`format: tata letak ${f} tanpa error`);
  }
  const yc = youtubeChapters([{ start: 0, title: "a" }, { start: 42, title: "b" }, { start: 130, title: "c" }], 300), bad = youtubeChapters([{ start: 0, title: "a" }, { start: 5, title: "b" }, { start: 30, title: "c" }], 60);
  rows.push({ langkah: "format: syarat bab YouTube", hasil: yc.ok && !bad.ok ? "LULUS" : "GAGAL", detik: 0, catatan: bad.alasan.slice(0, 90) });
  // edit footage 16:9 dari footage mendatar (tanpa wajah: potong di tengah), bab label
  const raw2 = path.join(ENGINE, "work", "_edit-sample-169");
  mkdirSync(raw2, { recursive: true });
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=30", "-i", SAMPLE_AUDIO, "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(raw2, "footage.mp4")]);
  copyFileSync(SAMPLE_AUDIO.replace(/\.mp3$/, ".align.json"), path.join(raw2, "footage.words.json"));
  npm("edit 16:9: proyek baru", "edit", [NE2, "--new", "--style=ngobrol", "--format=16:9", `--input=${path.join(raw2, "footage.mp4")}`, "--force"]);
  npm("edit 16:9: analisis", "edit", [NE2, "--analyze"]);
  const ej2 = path.join(pe2.dir, "edit.json");
  if (existsSync(ej2)) {
    const plan = JSON.parse(readFileSync(ej2, "utf8"));
    plan.bab = "label";
    const [a, b, c] = plan.sentences;
    if (a) Object.assign(a, { chapter: "Pembuka", objects: [{ type: "keyword", kicker: "bikin video", keyword: "gampang", at: "gampang" }] });
    if (b) Object.assign(b, { chapter: "Alur", mode: "broll", objects: [{ type: "doc", title: "alur.docx", at: "naskah", rows: [{ label: "Naskah", at: "naskah" }, { label: "Suara", at: "suara" }] }] });
    if (c) Object.assign(c, { objects: [{ type: "chips", items: [{ text: "dicek otomatis", icon: "check", at: "dicek" }] }] });
    writeFileSync(ej2, JSON.stringify(plan, null, 2));
  }
  npm("edit 16:9: render + QA", "edit", [NE2]);
  rows.push({ langkah: "edit 16:9: video 1920x1080 + QA", hasil: probe(pe2.result) === "1920,1080" && /Semua pengecekan lolos/.test(step.last) ? "LULUS" : "GAGAL", detik: 0, catatan: probe(pe2.result) });
  rmSync(raw2, { recursive: true, force: true });
  if (!keep) cleanF();
}

// 9) podcast multi-kamera + identifikasi pembicara + klip pendek (v0.9)
podcastTest({ npm, rows, step, keep, sampleAudio: SAMPLE_AUDIO });

// 10) rekaman layar/tutorial + vlog/montase (v0.10)
layarTest({ npm, rows, step, keep, sampleAudio: SAMPLE_AUDIO, sampleMd: SAMPLE_MD });

// 11) unggah TikTok (v0.11): halaman TikTok tiruan lokal, tanpa jaringan & tanpa akun
await tiktokTest({ npm, rows, step, keep });

if (keep) console.log(`Proyek uji disimpan: ${path.relative(ROOT, p.dir)}`);
else clean();
finish();
