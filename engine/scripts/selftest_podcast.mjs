// Bagian selftest v0.9: podcast multi-kamera + identifikasi pembicara lokal + klip pendek, tanpa kredit.
// Rekaman buatan: suara sampel dibagi per kalimat dan dibacakan bergantian oleh "A" (asli) dan "B" (nada digeser),
// rekaman lebar dua warna (kiri = A, kanan = B) + dua kamera dekat yang mulai merekam pada waktu berbeda.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, run } from "./lib.mjs";

export function podcastTest({ npm, rows, step, keep, sampleAudio }) {
  const NP = "00000000-10-selftest-podcast", pp = P(NP);
  const ND = "00000000-11-selftest-diar", pd = P(ND);
  const NC = `${NP}-k1`, pc = P(NC);
  const raw = path.join(ENGINE, "work", "_podcast-sample");
  const row = (langkah, ok, catatan = "") => rows.push({ langkah, hasil: ok ? "LULUS" : "GAGAL", detik: 0, catatan: String(catatan).slice(0, 90) });
  const probe = (f) => (existsSync(f) ? run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).trim().match(/^\d+,\d+/)?.[0] ?? "?" : "-");
  const json = (f, d = null) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
  const clean = () => {
    for (const q of [pp, pd, pc]) for (const d of [q.dir, q.work, q.resultDir]) rmSync(d, { recursive: true, force: true });
    for (const n of [NP, ND, NC]) for (const x of [".wav", ".mix.wav"]) rmSync(path.join(ENGINE, "public", "audio", `${n}${x}`), { force: true });
    const md = path.join(ENGINE, "public", "media", "edit");
    if (existsSync(md)) for (const f of readdirSync(md)) if ([NP, ND].some((n) => f.startsWith(n))) rmSync(path.join(md, f), { force: true });
    rmSync(raw, { recursive: true, force: true });
  };
  clean();
  mkdirSync(raw, { recursive: true });

  // 1) percakapan buatan: kalimat sampel 1-3 oleh A, lalu 1-3 oleh B (A B A B A B)
  const words = json(sampleAudio.replace(/\.mp3$/, ".align.json"), []);
  const sents = [];
  let cur = [];
  for (const w of words) { cur.push(w); if (/[.?!]$/.test(w.w)) { sents.push(cur); cur = []; } }
  if (cur.length) sents.push(cur);
  const order = [[0, "A"], [1, "B"], [2, "A"], [0, "B"], [1, "A"], [2, "B"]].filter(([k]) => sents[k]);
  const PRE = 0.08, POST = 0.12, GAP = 0.35, R = 1.22;
  const fc = [`[0:a]aresample=48000,aformat=channel_layouts=mono,asplit=2[a0][b0]`, `[b0]asetrate=${48000 * R},aresample=48000,atempo=${(1 / R).toFixed(4)}[bx]`,
    `[a0]asplit=${order.filter(([, s]) => s === "A").length}${order.filter(([, s]) => s === "A").map((_, i) => `[A${i}]`).join("")}`,
    `[bx]asplit=${order.filter(([, s]) => s === "B").length}${order.filter(([, s]) => s === "B").map((_, i) => `[B${i}]`).join("")}`];
  const conv = [];
  let t = 0;
  const use = { A: 0, B: 0 };
  order.forEach(([k, who], i) => {
    const s0 = Math.max(0, sents[k][0].s - PRE), s1 = sents[k].at(-1).e + POST;
    fc.push(`[${who}${use[who]++}]atrim=start=${s0}:end=${s1},asetpts=PTS-STARTPTS,apad=pad_dur=${GAP}[s${i}]`);
    for (const w of sents[k]) conv.push({ w: w.w, s: +(w.s - s0 + t).toFixed(3), e: +(w.e - s0 + t).toFixed(3), truth: who });
    t += s1 - s0 + GAP;
  });
  fc.push(`${order.map((_, i) => `[s${i}]`).join("")}concat=n=${order.length}:v=0:a=1[out]`);
  const convWav = path.join(raw, "conv.wav");
  run("ffmpeg", ["-v", "error", "-y", "-i", sampleAudio, "-filter_complex", fc.join(";"), "-map", "[out]", "-ar", "48000", convWav]);
  const dur = +t.toFixed(2);
  const enc = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"];
  // rekaman lebar (master suara): kiri merah = A, kanan biru = B
  const wide = path.join(raw, "lebar.mp4");
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=0xB03A2E:s=960x1080:r=30:d=${dur}`, "-f", "lavfi", "-i", `color=c=0x1F618D:s=960x1080:r=30:d=${dur}`, "-i", convWav,
    "-filter_complex", "[0:v][1:v]hstack=inputs=2[v]", "-map", "[v]", "-map", "2:a", ...enc, wide]);
  writeFileSync(wide.replace(/\.mp4$/, ".words.json"), JSON.stringify(conv.map(({ w, s, e, truth }) => ({ w, s, e, spk: truth }))));
  // kamera dekat A mulai 1,3 dtk setelah master (offset +1,3); kamera B mulai 0,7 dtk sebelumnya (offset -0,7)
  const camA = path.join(raw, "kamA.mp4"), camB = path.join(raw, "kamB.mp4");
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=1920x1080:r=30:d=${dur}`, "-ss", "1.3", "-i", convWav, "-af", "lowpass=f=5000,volume=0.8", ...enc, camA]);
  run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc=s=1920x1080:r=30:d=${dur + 0.7}`, "-i", convWav, "-af", "adelay=700:all=1,highpass=f=120,volume=1.1", "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", camB]);

  // 2) podcast multi-kamera: sinkron dari suara, pembicara dari transkrip, kamera per pembicara, nama pembicara
  npm("podcast: proyek baru (style siniar, 3 kamera, 2 pembicara)", "edit", [NP, "--new", "--style=siniar", "--speakers=2", "--multicam", `--input=${wide},${camA},${camB}`, "--force"]);
  npm("podcast: perkiraan kuota transkrip (gratis)", "edit", [NP, "--analyze", "--estimate"]);
  row("podcast: tanpa kredit (sidecar + kamera tambahan)", /Perkiraan Speech to Text: 0\.0 menit/.test(step.last), step.last.split("\n").at(-1));
  npm("podcast: analisis (sinkron kamera + pembicara)", "edit", [NP, "--analyze"]);
  const ej = path.join(pp.dir, "edit.json");
  const plan = json(ej, { sources: [], sentences: [], speakers: [] });
  const off = plan.sources.map((s) => s.offset ?? 0);
  row("podcast: sinkron kamera dari suara", Math.abs(off[1] - 1.3) < 0.04 && Math.abs(off[2] + 0.7) < 0.04, `offset ${off.join(" / ")} (harus 0 / 1.3 / -0.7)`);
  const spks = plan.sentences.map((s) => s.spk).join("");
  row("podcast: kalimat per pembicara", spks === order.map(([, s]) => s).join("") && plan.speakers.length === 2, `urutan ${spks}`);
  plan.speakers = plan.speakers.map((sp) => ({ ...sp, ...(sp.id === "A" ? { name: "Rina", title: "Pembawa acara", cam: 2 } : { name: "Budi", title: "Tamu", cam: 3 }) }));
  plan.sentences[0] && (plan.sentences[0].chapter = "Pembuka");
  writeFileSync(ej, JSON.stringify(plan, null, 2));
  npm("podcast: potong + pindah kamera + render + QA", "edit", [NP]);
  const qaOk = /Semua pengecekan lolos/.test(step.last);
  const props = json(path.join(pp.work, "edit", "props.json"), {});
  // kamera A baru merekam 1,3 dtk setelah master: awal kalimat pertama memakai rekaman lebar (tanpa nama), lalu A
  const shots = (props.shots ?? []).map((s) => s.on ?? "").join("");
  row("podcast: kamera ikut pembicara", shots === order.map(([, s]) => s).join(""), `shot ${shots || "-"} (kamera ${(props.shots ?? []).map((s) => s.cam + 1).join("")})`);
  row("podcast: nama pembicara muncul sekali per orang", (props.names ?? []).length === 2, `${(props.names ?? []).map((n) => n.name).join(", ")}`);
  row("podcast: video 1920x1080 + QA", probe(pp.result) === "1920,1080" && qaOk, probe(pp.result));

  // 3) identifikasi pembicara lokal (tanpa label di transkrip): sidik suara + pengelompokan
  const wideNoSpk = path.join(raw, "lebar2.mp4");
  run("ffmpeg", ["-v", "error", "-y", "-i", wide, "-c", "copy", wideNoSpk]);
  writeFileSync(wideNoSpk.replace(/\.mp4$/, ".words.json"), JSON.stringify(conv.map(({ w, s, e }) => ({ w, s, e }))));
  npm("diarisasi: proyek baru (2 pembicara, tanpa label)", "edit", [ND, "--new", "--style=siniar", "--speakers=2", `--input=${wideNoSpk}`, "--force"]);
  npm("diarisasi: analisis lokal (resemblyzer)", "edit", [ND, "--analyze"]);
  const dw = json(path.join(pd.work, "edit", "src1.words.json"), { words: [] }).words;
  const same = dw.filter((w, i) => conv[i] && w.spk === conv[i].truth).length, swap = dw.filter((w, i) => conv[i] && w.spk && w.spk !== conv[i].truth).length;
  const acc = dw.length ? Math.max(same, swap) / conv.length : 0;
  row("diarisasi: ketepatan per kata ≥ 90%", acc >= 0.9, `${Math.round(acc * 100)}% dari ${conv.length} kata`);

  // 4) klip pendek: kandidat -> klip.json -> proyek anak 9:16 (kotak manual dari rekaman lebar) -> render + QA
  npm("klip: kandidat dari transkrip", "clips", [NP, "--min=5", "--max=15"]);
  const kand = json(path.join(pp.dir, "klip", "kandidat.json"), []);
  const list = Array.isArray(kand) ? kand : kand.candidates ?? [];
  row("klip: ada kandidat", list.length > 0, `${list.length} kandidat`);
  const s0 = plan.sentences[0]?.id, s2 = plan.sentences[2]?.id;
  writeFileSync(path.join(pp.dir, "klip.json"), JSON.stringify({ style: "ngobrol", format: "9:16", lengthSec: [5, 15], clips: [{ id: "k1", title: "Alur bikin video", hook: "Bikin video pendek itu gampang", why: "pembuka kuat, akhir tuntas", from: s0, to: s2 }] }, null, 2));
  npm("klip: cek klip.json", "clips", [NP, "--check"]);
  npm("klip: buat proyek anak", "clips", [NP, "--make=k1", "--force"]);
  const cj = path.join(pc.dir, "edit.json");
  const child = json(cj, null);
  row("klip: proyek anak 9:16 dari induk", !!child && (child.format ?? "9:16") === "9:16" && child.parent === NP && child.sentences.length === 3, child ? `${child.sentences.length} kalimat · ${child.format ?? "9:16"} · footage ${child.sources.length}` : "edit.json tidak ada");
  if (child) {
    // tanpa kamera dekat: potong per orang dari rekaman lebar (kotak manual kiri/kanan)
    const w = child.sources.findIndex((s) => /lebar/.test(s.file)) + 1;
    child.speakers = child.speakers.map((sp) => ({ ...sp, cam: undefined, box: sp.id === "A" ? [0.05, 0.1, 0.4, 0.8] : [0.55, 0.1, 0.4, 0.8], boxSrc: w || 1 }));
    writeFileSync(cj, JSON.stringify(child, null, 2));
    npm("klip: render 9:16 + QA", "edit", [NC]);
    row("klip: video 1080x1920 + QA", probe(pc.result) === "1080,1920" && /Semua pengecekan lolos/.test(step.last), probe(pc.result));
  }
  if (!keep) clean();
}
