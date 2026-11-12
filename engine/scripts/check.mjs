// Cek kesiapan seluruh pipeline sebelum membuat video.
import { existsSync } from "node:fs";
import path from "node:path";
import { ensureBrowser } from "@remotion/renderer";
import { DIRS, ENGINE, ROOT, config, mg4Skill, run } from "./lib.mjs";

const cfg = config();
let bad = 0;
const ok = (m) => console.log(`  OK   ${m}`);
const fail = (m, fix) => {
  bad++;
  console.log(`  GAGAL ${m}${fix ? `\n        -> ${fix}` : ""}`);
};

for (const [label, dir] of Object.entries(DIRS)) existsSync(dir) ? ok(`folder ${label}`) : label === "work" ? ok("folder work (dibuat otomatis)") : fail(`folder ${label} tidak ada`);
existsSync(path.join(ENGINE, "node_modules")) ? ok("dependensi Engine") : fail("node_modules belum ada", "cd Engine && npm install");

for (const tool of ["ffmpeg", "ffprobe"]) {
  try {
    run(tool, ["-version"]);
    ok(tool);
  } catch {
    fail(`${tool} tidak ditemukan`, "brew install ffmpeg");
  }
}

const provider = (cfg.provider ?? "voicestudio").toLowerCase();
if (provider === "elevenlabs") {
  if (!process.env.ELEVENLABS_API_KEY) fail("ELEVENLABS_API_KEY belum ada", "di root project: npx -y @elevenlabs/cli@latest onboard init");
  else
    try {
      const { eleven, quota } = await import("./eleven.mjs");
      const q = await quota();
      ok(`ElevenLabs SDK aktif (key dari ${process.env.ELEVENLABS_KEY_SOURCE}; ${q.tier}, sisa ${q.left}/${q.limit} karakter)`);
      if (q.left < 1500) console.log("        ! kuota hampir habis: ±1 video 45 dtk butuh ±700-900 karakter");
      const el = cfg.elevenlabs ?? {};
      const id = el.voices?.[el.voice] ?? el.voice;
      let vj = null;
      try {
        vj = await eleven().voices.get(id);
      } catch {}
      if (!vj) fail(`voice default "${el.voice}" tidak ada di akun`, "tambahkan: npm run voices -- --add=<owner>:<id>:<Nama>");
      else if (q.tier === "free" && vj.category !== "premade")
        fail(`voice default "${el.voice}" (${vj.category}) tidak bisa dipakai lewat API di paket free`, "upgrade paket ElevenLabs, atau pakai voice premade (mis. --voice=Sarah)");
      else ok(`voice default "${el.voice}" (${vj.category}, ${el.model})`);
    } catch (e) {
      fail(`ElevenLabs: ${e.message}`, "periksa koneksi internet / jalankan onboard check");
    }
} else {
  try {
    const h = await (await fetch(`${cfg.ttsUrl}/health`, { signal: AbortSignal.timeout(5000) })).json();
    ok(`VoiceStudio aktif (v${h.version}, GPU ${h.device})`);
  } catch {
    fail("VoiceStudio tidak merespons", "open -a VoiceStudio");
  }
  const ref = path.join(ENGINE, cfg.narrator?.ref ?? "");
  existsSync(ref) && existsSync(path.join(ENGINE, cfg.narrator?.refText ?? ""))
    ? ok(`referensi suara narator (${cfg.narrator.ref})`)
    : fail("referensi suara narator tidak ada", "lihat Engine/README.md bagian Suara narator");
}

try {
  run(path.join(ENGINE, ".venv", "bin", "python"), ["-c", "import faster_whisper, resemblyzer, scipy, soundfile"]);
  ok("venv analisis audio (faster-whisper, resemblyzer, scipy)");
} catch {
  fail("venv analisis audio belum siap", "lihat Engine/README.md bagian Persiapan");
}
const mg4 = mg4Skill();
if (!mg4) console.log("  -    motion-graphics-v4 (skill Anthropic) tidak terpasang: jalur B nonaktif, jalur A & C tetap bisa");
else
  try {
    const mg = JSON.parse(run(path.join(ENGINE, ".venv", "bin", "python"), [path.join(mg4, "scripts", "check_tools.py")]));
    mg.ok && mg.mode === "chromium" ? ok(`motion-graphics-v4 (${path.relative(process.env.HOME, mg4)})`) : fail(`motion-graphics-v4: ${mg.problems.join("; ")}`, "jalankan ulang /content-creator:setup");
  } catch (e) {
    fail(`motion-graphics-v4 tidak bisa dicek: ${e.message.split("\n")[0]}`);
  }
existsSync(path.join(process.env.HOME, ".cache/huggingface/hub/models--deepdml--faster-whisper-large-v3-turbo-ct2"))
  ? ok("model transkripsi (whisper large-v3-turbo)")
  : fail("model transkripsi belum ada", "jalankan /content-creator:setup (mengunduh model whisper large-v3-turbo, ±1,6 GB)");

try {
  await ensureBrowser();
  ok("browser render (Chrome Headless Shell)");
} catch (e) {
  fail(`browser render: ${e.message}`);
}

console.log(bad ? `\n${bad} masalah ditemukan.` : "\nSemua siap. Pipeline bisa dipakai.");
process.exit(bad ? 1 : 0);
