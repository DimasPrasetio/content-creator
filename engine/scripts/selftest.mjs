// Uji alur utuh content-creator pada proyek sementara, lalu dibersihkan.
//
//   npm run selftest                tanpa kredit: suara dari video contoh (--audio), semua mesin & langkah pasca-produksi
//   npm run selftest -- --full      + render akhir mg4 dan preview Pop (lebih lama, ±6-8 menit)
//   npm run selftest -- --real-voice   suara dibuat ElevenLabs (voice default, ±120 karakter kredit) untuk menguji
//                                   jalur API sungguhan; hanya setelah pengguna setuju
//   --keep                          proyek uji tidak dihapus (untuk diperiksa)
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DIRS, ENGINE, P, ROOT, mg4Skill, run } from "./lib.mjs";

const args = process.argv.slice(2);
const full = args.includes("--full");
const real = args.includes("--real-voice");
const keep = args.includes("--keep");
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
rows.push({ langkah: "track musik terpakai", hasil: /track ElevenLabs/.test(step.last) ? "LULUS" : "GAGAL", detik: 0, catatan: "sound.py memakai work/<nama>/music.wav" });
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
// 6) mesin edit footage (style narration), tanpa kredit: footage sintetis + suara sampel + transkrip sidecar
const NE = "00000000-02-selftest-edit";
const pe = P(NE);
const cleanEdit = () => {
  for (const d of [pe.dir, pe.work, pe.resultDir]) rmSync(d, { recursive: true, force: true });
  for (const f of [path.join(ENGINE, "public", "audio", `${NE}.wav`), path.join(ENGINE, "public", "media", "edit", `${NE}.mp4`)]) rmSync(f, { force: true });
};
cleanEdit();
const raw = path.join(ENGINE, "work", "_edit-sample");
mkdirSync(raw, { recursive: true });
run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30", "-i", SAMPLE_AUDIO, "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(raw, "footage.mp4")]);
copyFileSync(SAMPLE_AUDIO.replace(/\.mp3$/, ".align.json"), path.join(raw, "footage.words.json"));
npm("edit: proyek baru (style narration)", "edit", [NE, "--new", "--style=narration", `--input=${path.join(raw, "footage.mp4")}`, "--force"]);
npm("edit: normalisasi + analisis konteks", "edit", [NE, "--analyze"]);
const ej = path.join(pe.dir, "edit.json");
if (existsSync(ej)) {
  const plan = JSON.parse(readFileSync(ej, "utf8"));
  const [a, b, c] = plan.sentences;
  if (a) Object.assign(a, { intent: "hook", objects: [{ type: "keyword", kicker: "bikin video", keyword: "gampang", at: "gampang" }] });
  if (b) Object.assign(b, { intent: "langkah", mode: "broll", objects: [{ type: "keyword", kicker: "mulai dari", keyword: "naskah", at: "naskah" },
    { type: "doc", title: "alur.docx", at: "naskah", rows: [{ label: "Naskah", at: "naskah" }, { label: "Suara", at: "suara" }, { label: "Visual", at: "visual" }] }] });
  if (c) Object.assign(c, { intent: "hasil", punch: "strong", objects: [{ type: "chips", items: [{ text: "dicek otomatis", icon: "check", at: "dicek" }] }, { type: "card", kicker: "hasil", title: "siap diunggah", at: "diunggah" }] });
  writeFileSync(ej, JSON.stringify(plan, null, 2));
}
npm("edit: potong + grading + grafis + render + QA", "edit", [NE]);
rows.push({ langkah: "edit: hasil video", hasil: existsSync(pe.result) && /Semua pengecekan lolos/.test(step.last) ? "LULUS" : "GAGAL", detik: 0, catatan: "Result/umum/<nama>/<nama>.mp4 + QA" });
if (!keep) cleanEdit();
rmSync(raw, { recursive: true, force: true });

console.table(rows);
const failed = rows.filter((r) => r.hasil === "GAGAL").length;
if (keep) console.log(`Proyek uji disimpan: ${path.relative(ROOT, p.dir)}`);
else clean();
console.log(failed ? `\n${failed} langkah GAGAL.` : "\nSemua langkah lulus.");
process.exit(failed ? 1 : 0);
