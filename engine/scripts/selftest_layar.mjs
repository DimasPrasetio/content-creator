// Bagian selftest v0.10: rekaman layar/tutorial (zoom otomatis, loading dipercepat/dibuang, kamera wajah, voice over AI)
// dan vlog/montase (potongan pada ketukan musik, momen terbaik, voice over AI), tanpa kredit.
// Rekaman buatan: layar gelap dengan "ketikan" di kiri atas saat kalimat 1, loading 6 dtk tanpa suara, lalu ketikan di
// kanan bawah saat kalimat 2-3; suara = sampel selftest. Montase: 4 klip uji + musik buatan 120 BPM.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, run } from "./lib.mjs";

export function layarTest({ npm, rows, step, keep, sampleAudio, sampleMd, only }) {
  const N = { cepat: "00000000-20-selftest-layar", buang: "00000000-21-selftest-layar-buang", wajah: "00000000-22-selftest-layar-wajah",
    ai: "00000000-23-selftest-layar-ai", v916: "00000000-27-selftest-layar-916", vlog: "00000000-26-selftest-vlog", musik: "00000000-24-selftest-kilas", vo: "00000000-25-selftest-kilas-ai" };
  const raw = path.join(ENGINE, "work", "_layar-sample");
  const row = (langkah, ok, catatan = "") => rows.push({ langkah, hasil: ok ? "LULUS" : "GAGAL", detik: 0, catatan: String(catatan).slice(0, 90) });
  const probe = (f) => (existsSync(f) ? run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).trim().match(/^\d+,\d+/)?.[0] ?? "?" : "-");
  const dur = (f) => (existsSync(f) ? Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim()) : 0);
  const json = (f, d = null) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
  const qaOk = () => /Semua pengecekan lolos/.test(step.last);
  const clean = () => {
    for (const n of Object.values(N)) {
      const q = P(n);
      for (const d of [q.dir, q.work, q.resultDir]) rmSync(d, { recursive: true, force: true });
      for (const x of [".wav", ".mix.wav"]) rmSync(path.join(ENGINE, "public", "audio", `${n}${x}`), { force: true });
    }
    const md = path.join(ENGINE, "public", "media", "edit");
    if (existsSync(md)) for (const f of readdirSync(md)) if (Object.values(N).some((n) => f.startsWith(n))) rmSync(path.join(md, f), { force: true });
    rmSync(raw, { recursive: true, force: true });
  };
  clean();
  mkdirSync(raw, { recursive: true });
  const want = (k) => !only || only === k || (only === "layar" && ["cepat", "buang", "wajah", "ai", "v916"].includes(k)) || (only === "montase" && ["musik", "vo", "vlog"].includes(k));

  // 1) rekaman layar buatan: kalimat 1 (ketikan kiri atas) -> loading 6 dtk tanpa suara (spinner tengah) -> kalimat 2-3 (kanan bawah)
  const words = json(sampleAudio.replace(/\.mp3$/, ".align.json"), []);
  const s1 = words.find((w) => /[.?!]$/.test(w.w));
  const CUT = +(s1.e + 0.25).toFixed(3), IDLE = 6, END = +(dur(sampleAudio) + IDLE).toFixed(3), T2 = CUT + IDLE;
  const speech = path.join(raw, "suara.wav");
  run("ffmpeg", ["-v", "error", "-y", "-i", sampleAudio, "-filter_complex",
    `[0:a]aresample=48000,asplit=2[a][b];[a]atrim=0:${CUT},asetpts=PTS-STARTPTS,apad=pad_dur=${IDLE}[p];[b]atrim=start=${CUT},asetpts=PTS-STARTPTS[q];[p][q]concat=n=2:v=0:a=1[o]`,
    "-map", "[o]", "-ac", "1", speech]);
  const sw = words.map((w) => (w.s >= CUT ? { ...w, s: +(w.s + IDLE).toFixed(3), e: +(w.e + IDLE).toFixed(3) } : w));
  const enc = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"];
  // kursor ketik 40x30 bergerak 8x/dtk dalam kotak (18 kolom x 4 baris); spinner berkedip 1x/dtk
  const typer = (x0, y0) => `x='${x0}+mod(floor(t*8),18)*40':y='${y0}+mod(floor(t*8/18),4)*40'`;
  const screenVf = (d) => [
    `color=c=0x1E2430:s=1920x1080:r=30:d=${d},drawbox=x=0:y=0:w=1920:h=56:c=0x2E3646:t=fill,drawbox=x=60:y=100:w=820:h=220:c=0x262D3A:t=fill,drawbox=x=1060:y=680:w=820:h=220:c=0x262D3A:t=fill[bg]`,
    `color=c=white:s=40x30:r=30:d=${d}[k1]`, `color=c=0x4FB3FF:s=40x30:r=30:d=${d}[k2]`, `color=c=0x4FB3FF:s=60x60:r=30:d=${d}[sp]`,
    `[bg][k1]overlay=${typer(96, 120)}:enable='between(t,0.2,${CUT})':eval=frame[v1]`,
    `[v1][sp]overlay=x=930:y=510:enable='between(t,${CUT},${T2})*lt(mod(t,1),0.5)':eval=frame[v2]`,
    `[v2][k2]overlay=${typer(1096, 700)}:enable='between(t,${T2},${d})':eval=frame[v]`].join(";");
  const scr = path.join(raw, "layar.mp4");
  run("ffmpeg", ["-v", "error", "-y", "-i", speech, "-filter_complex", screenVf(END), "-map", "[v]", "-map", "0:a", ...enc, "-c:a", "aac", "-shortest", scr]);
  writeFileSync(scr.replace(/\.mp4$/, ".words.json"), JSON.stringify(sw.map(({ w, s, e }) => ({ w, s, e }))));
  const speechWords = words.reduce((a, w) => a + (w.e - w.s), 0);

  const layar = (key, label, args) => {
    const n = N[key], q = P(n);
    npm(`${label}: proyek baru`, "edit", [n, "--new", "--style=layar", ...args, "--force"]);
    npm(`${label}: analisis (aktivitas layar)`, "edit", [n, "--analyze"]);
    npm(`${label}: potong + zoom + render + QA`, "edit", [n]);
    return { q, ok: qaOk(), props: json(path.join(q.work, "edit", "props.json"), {}), plan: json(path.join(q.dir, "edit.json"), {}) };
  };
  // zoom: kunci pertama (kalimat 1) ke kiri atas, kunci terakhir ke kanan bawah
  const zoomRow = (label, props) => {
    const keys = (props.screen?.keys ?? []).filter((k) => k.box);
    const c = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];
    const a = keys[0]?.box && c(keys[0].box), z = keys.at(-1)?.box && c(keys.at(-1).box);
    row(`${label}: zoom ikut bagian yang berubah`, !!a && !!z && a[0] < 0.4 && a[1] < 0.4 && z[0] > 0.6 && z[1] > 0.6 && keys[0].box[2] < 0.9,
      keys.length ? `${keys.length} kunci · awal ${keys[0].box.map((x) => x.toFixed(2)).join(",")} · akhir ${keys.at(-1).box.map((x) => x.toFixed(2)).join(",")}` : "tanpa kunci zoom");
  };

  if (want("cepat")) {
    const r = layar("cepat", "layar", [`--input=${scr}`]);
    zoomRow("layar", r.props);
    const sl = r.props.speedLabels ?? [];
    row("layar: loading dipercepat + label", sl.length === 1 && sl[0].x >= 2, sl.map((x) => `${x.x}x ${((x.f1 - x.f0) / 30).toFixed(1)} dtk`).join(", ") || "tanpa label");
    const d = dur(r.q.result);
    row("layar: video 1920x1080 + QA", probe(r.q.result) === "1920,1080" && r.ok, `${probe(r.q.result)} · ${d.toFixed(1)} dtk (rekaman ${END.toFixed(1)})`);
    row("layar: durasi = ucapan + loading ≤ 2,5 dtk", d > speechWords && d < END - IDLE + 2.5 + 1.2, `${d.toFixed(1)} dtk`);
  }
  if (want("buang")) {
    const r = layar("buang", "layar buang", [`--input=${scr}`, "--idle=buang"]);
    const d = dur(r.q.result);
    row("layar buang: loading dibuang", !(r.props.speedLabels ?? []).length && d < END - IDLE + 0.8 && r.ok, `${d.toFixed(1)} dtk · QA ${r.ok ? "lolos" : "gagal"}`);
  }
  if (want("v916")) {
    // tutorial untuk Reels: layar di area antara brand pojok dan subtitle, zoom memakai rasio area itu
    const r = layar("v916", "layar 9:16", [`--input=${scr}`, "--format=9:16"]);
    const ar = r.props.screen?.area;
    row("layar 9:16: layar di atas subtitle", !!ar && ar[1] + ar[3] <= (r.props.canvas?.subY ?? 1244) && (r.props.screen?.keys ?? []).some((k) => k.box), ar ? `area y ${ar[1]}-${ar[1] + ar[3]} · subtitle ${r.props.canvas?.subY}` : "tanpa area");
    row("layar 9:16: video 1080x1920 + QA", probe(r.q.result) === "1080,1920" && r.ok, probe(r.q.result));
  }
  if (want("wajah")) {
    // kamera wajah mulai merekam 0,8 dtk lebih dulu (suara terlambat 0,8 dtk)
    const cam = path.join(raw, "wajah.mp4");
    run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=1280x720:r=30:d=${END + 0.8}`, "-i", speech, "-af", "adelay=800:all=1,lowpass=f=6000,volume=0.8", "-map", "0:v", "-map", "1:a", ...enc, "-c:a", "aac", cam]);
    const r = layar("wajah", "layar + wajah", [`--input=${scr},${cam}`, "--facecam=2"]);
    const off = (r.plan.sources ?? []).map((s) => s.offset ?? 0);
    row("layar + wajah: sinkron kamera wajah dari suara", Math.abs((off[1] ?? 0) + 0.8) < 0.05, `offset ${off.join(" / ")} (harus 0 / -0.8)`);
    const cf = path.join(r.q.work, "edit", "facecam.mp4");
    row("layar + wajah: kamera wajah bulat + QA", !!r.props.facecam && probe(cf) === "480,480" && r.ok, `${probe(cf)} · QA ${r.ok ? "lolos" : "gagal"}`);
  }
  if (want("ai")) {
    // rekaman layar bisu (tanpa trek suara) + voice over AI dari naskah (suara = audio contoh, tanpa kredit)
    const mute = path.join(raw, "layar-bisu.mp4");
    run("ffmpeg", ["-v", "error", "-y", "-filter_complex", screenVf(END), "-map", "[v]", ...enc, mute]);
    const n = N.ai, q = P(n);
    npm("layar AI: proyek baru (--narasi=ai)", "edit", [n, "--new", "--style=layar", `--input=${mute}`, "--narasi=ai", "--force"]);
    writeFileSync(q.script, readFileSync(sampleMd, "utf8"));
    mkdirSync(q.work, { recursive: true });
    run("ffmpeg", ["-v", "error", "-y", "-i", sampleAudio, "-c", "copy", path.join(q.work, "src.mp3")]);
    writeFileSync(path.join(q.work, "src.align.json"), readFileSync(sampleAudio.replace(/\.mp3$/, ".align.json")));
    npm("layar AI: analisis", "edit", [n, "--analyze"]);
    npm("layar AI: voice over (audio contoh)", "voice", [n, `--audio=${path.join(q.work, "src.mp3")}`]);
    npm("layar AI: draft (kalimat + rentang layar otomatis)", "edit", [n, "--draft"]);
    const plan = json(path.join(q.dir, "edit.json"), {});
    plan.sentences = (plan.sentences ?? []).map((s, i) => (i === 1 ? { ...s, screen: [CUT, T2 + 1] } : s));
    writeFileSync(path.join(q.dir, "edit.json"), JSON.stringify(plan, null, 2));
    npm("layar AI: layar ikut kalimat + render + QA", "edit", [n]);
    const ok = qaOk(), props = json(path.join(q.work, "edit", "props.json"), {});
    const vd = dur(q.result), ad = dur(q.voice);
    row("layar AI: koreksi \"screen\" dipakai", (json(path.join(q.dir, "edit.json"), {}).sentences ?? [])[1]?.screen?.[0] === CUT, "kalimat 2 = rentang loading");
    row("layar AI: durasi = voice over", Math.abs(vd - ad) < 0.15 && ad > 5, `video ${vd.toFixed(2)} · suara ${ad.toFixed(2)}`);
    row("layar AI: bagian panjang dipercepat + QA", (props.speedLabels ?? []).length >= 1 && ok, `${(props.speedLabels ?? []).map((x) => `${x.x}x`).join(", ") || "tanpa label"} · QA ${ok ? "lolos" : "gagal"}`);
  }

  // 2) montase: 4 klip uji (gerak berbeda, tanpa suara) + musik 120 BPM (ketukan tiap 0,5 dtk)
  const clips = [];
  if (want("musik") || want("vo") || want("vlog")) {
    const srcs = [["testsrc2=s=1920x1080:r=30", null], ["mandelbrot=s=1280x720:r=30", "scale=1920:1080"],
      ["life=s=640x360:r=30:mold=10:ratio=0.5:death_color=#203040:life_color=#F0C040", "scale=1920:1080:flags=neighbor"], ["smptehdbars=s=1920x1080:r=30", "hue=H=2*PI*t/6"]];
    srcs.forEach(([src, vf], i) => {
      const f = path.join(raw, `klip${i + 1}.mp4`);
      run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", src, ...(vf ? ["-vf", vf] : []), "-t", "6", ...enc, f]);
      clips.push(f);
    });
  }
  const music = path.join(raw, "musik120.wav");
  if (want("musik") || want("vlog"))
    run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "aevalsrc='0.8*sin(2*PI*55*t)*exp(-14*mod(t,0.5))+0.25*sin(2*PI*330*t)*exp(-9*mod(t+0.25,0.5))+0.08*sin(2*PI*220*t)':s=44100:d=18", "-ac", "2", music]);
  if (want("musik")) {
    const n = N.musik, q = P(n);
    npm("montase: proyek baru (style kilas, 4 klip, musik 120 BPM)", "edit", [n, "--new", "--style=kilas", `--input=${clips.join(",")}`, `--music=${music}`, "--duration=12", "--force"]);
    npm("montase: analisis (momen terbaik per klip)", "edit", [n, "--analyze"]);
    npm("montase: board (draft)", "edit", [n, "--draft"]);
    const plan = json(path.join(q.dir, "edit.json"), {});
    const shots = plan.montage?.shots ?? [];
    const onBeat = shots.slice(1).filter((s) => { const r = (s.t[0] / 0.5) % 1; return Math.min(r, 1 - r) < 0.12; }).length;
    row("montase: potongan pada ketukan 120 BPM", shots.length >= 4 && onBeat >= (shots.length - 1) * 0.8, `${shots.length} potongan · ${onBeat}/${shots.length - 1} pada ketukan · tempo ${plan.montage?.tempo}`);
    row("montase: semua klip terpakai", new Set(shots.map((s) => s.src)).size === 4, `klip ${[...new Set(shots.map((s) => s.src))].sort().join(",")}`);
    npm("montase: render + QA", "edit", [n]);
    const ok = qaOk(), d = dur(q.result);
    row("montase: video 1080x1920 ±12 dtk + QA", probe(q.result) === "1080,1920" && d > 7 && d < 17 && ok, `${probe(q.result)} · ${d.toFixed(1)} dtk · QA ${ok ? "lolos" : "gagal"}`);
  }
  if (want("vo")) {
    const n = N.vo, q = P(n);
    npm("montase AI: proyek baru (--narasi=ai)", "edit", [n, "--new", "--style=kilas", `--input=${clips.join(",")}`, "--narasi=ai", "--force"]);
    writeFileSync(q.script, readFileSync(sampleMd, "utf8"));
    mkdirSync(q.work, { recursive: true });
    run("ffmpeg", ["-v", "error", "-y", "-i", sampleAudio, "-c", "copy", path.join(q.work, "src.mp3")]);
    writeFileSync(path.join(q.work, "src.align.json"), readFileSync(sampleAudio.replace(/\.mp3$/, ".align.json")));
    npm("montase AI: analisis", "edit", [n, "--analyze"]);
    npm("montase AI: voice over (audio contoh)", "voice", [n, `--audio=${path.join(q.work, "src.mp3")}`]);
    npm("montase AI: potong per kalimat + render + QA", "edit", [n]);
    const ok = qaOk(), plan = json(path.join(q.dir, "edit.json"), {});
    const sids = new Set((plan.montage?.shots ?? []).map((s) => s.sid));
    const vd = dur(q.result), ad = dur(q.voice);
    row("montase AI: potongan per kalimat", sids.size === 3, `${(plan.montage?.shots ?? []).length} potongan untuk ${sids.size} kalimat`);
    row("montase AI: durasi = voice over + QA", Math.abs(vd - ad) < 0.15 && ok, `video ${vd.toFixed(2)} · suara ${ad.toFixed(2)} · QA ${ok ? "lolos" : "gagal"}`);
  }
  if (want("vlog")) {
    // vlog bicara + B-roll + musik latar: talking-head (style ngobrol) dengan sisipan klip B-roll pada kata "naskah"
    const n = N.vlog, q = P(n), th = path.join(raw, "bicara.mp4");
    run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30", "-i", sampleAudio, "-shortest", ...enc, "-c:a", "aac", th]);
    writeFileSync(th.replace(/\.mp4$/, ".words.json"), readFileSync(sampleAudio.replace(/\.mp3$/, ".align.json")));
    npm("vlog: proyek baru (ngobrol + B-roll + musik)", "edit", [n, "--new", "--style=ngobrol", `--input=${th}`, `--broll=${clips[1]}`, `--music=${music}`, "--force"]);
    npm("vlog: analisis (+ momen B-roll)", "edit", [n, "--analyze"]);
    const ej = path.join(q.dir, "edit.json"), plan = json(ej, {});
    const s2 = (plan.sentences ?? []).find((x) => /naskah/.test(x.text));
    if (s2) s2.objects = [{ type: "clip", file: plan.broll?.[0]?.file, from: 1, at: "naskah", fit: "full" }];
    writeFileSync(ej, JSON.stringify(plan, null, 2));
    npm("vlog: render + QA", "edit", [n]);
    const ok = qaOk(), props = json(path.join(q.work, "edit", "props.json"), {});
    const clip = (props.objects ?? []).find((o) => o.type === "clip");
    row("vlog: sisipan B-roll dari --broll", !!clip && !!s2, clip ? `klip ${((clip.until - clip.at) / 30).toFixed(1)} dtk` : "tanpa objek clip");
    const sb = json(path.join(q.dir, "storyboard.json"), {});
    row("vlog: musik latar di bawah suara + QA", (sb.scenes ?? []).every((x) => x.music === "pad") && existsSync(path.join(q.work, "music.wav")) && ok, `musik ${(sb.scenes ?? []).map((x) => x.music).join(",")} · QA ${ok ? "lolos" : "gagal"}`);
  }
  if (!keep) clean();
}
