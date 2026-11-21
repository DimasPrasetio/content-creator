// Cek kesiapan seluruh pipeline sebelum membuat video.
import { existsSync } from "node:fs";
import path from "node:path";
import { ensureBrowser } from "@remotion/renderer";
import { DIRS, ENGINE, ROOT, config, mg4Skill, run, whisperReady } from "./lib.mjs";

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
  if (!process.env.ELEVENLABS_API_KEY) fail("ELEVENLABS_API_KEY belum ada", "di folder workspace (bukan Engine/): npx -y @elevenlabs/cli@latest onboard init, lihat docs/SETUP.md");
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

// Google Drive (opsional): rclone + remote + akses ke folder tujuan
{
  const d = cfg.drive ?? {};
  const remote = d.remote ?? "gdrive";
  if (!d.rootFolderId) console.log("  -    Google Drive belum diatur (opsional): isi drive.rootFolderId di config.local.json, lihat docs/SETUP.md");
  else {
    let remotes = null;
    try {
      remotes = run("rclone", ["listremotes"]);
    } catch {
      fail("rclone belum terpasang", "jalankan ulang /content-creator:setup");
    }
    if (remotes !== null && !remotes.split("\n").includes(`${remote}:`))
      fail(`remote rclone "${remote}" belum ada`, `rclone config create ${remote} drive scope=drive root_folder_id=${d.rootFolderId}`);
    else if (remotes !== null)
      try {
        const dirs = JSON.parse(run("rclone", ["lsjson", `${remote}:`, "--dirs-only", "--max-depth", "1"]));
        ok(`Google Drive ${d.rootName || d.rootFolderId} bisa diakses (${dirs.length} folder brand)`);
      } catch (e) {
        fail(`Google Drive tidak bisa diakses: ${String(e.stderr || e.message).split("\n").find((l) => /ERROR|Failed|error/.test(l)) ?? "cek koneksi/izin"}`, "pastikan akun Google Anda punya akses Editor ke folder, lalu rclone config reconnect " + remote + ":");
      }
  }
}

try {
  run(path.join(ENGINE, ".venv", "bin", "python"), ["-c", "import resemblyzer, scipy, soundfile"]);
  ok("venv analisis audio (resemblyzer, scipy)");
} catch {
  fail("venv analisis audio belum siap", "lihat Engine/README.md bagian Persiapan");
}
// mesin edit footage: deteksi wajah (OpenCV + YuNet), font tulisan tangan, ffmpeg HDR -> SDR
try {
  run(path.join(ENGINE, ".venv", "bin", "python"), ["-c", "import cv2; cv2.FaceDetectorYN"]);
  existsSync(path.join(ENGINE, "models", "face_detection_yunet_2023mar.onnx")) ? ok("deteksi wajah (OpenCV + YuNet) untuk edit footage") : fail("model wajah YuNet tidak ada", "jalankan ulang /content-creator:setup");
} catch {
  fail("OpenCV belum terpasang (edit footage)", "jalankan ulang /content-creator:setup");
}
existsSync(path.join(ENGINE, "public", "fonts", "Caveat-Variable.ttf")) ? ok("font edit (Poppins, Caveat)") : fail("font edit tidak lengkap", "jalankan ulang /content-creator:setup");
{
  let f = "";
  try { f = run("ffmpeg", ["-hide_banner", "-filters"]); } catch {}
  const hdr = / zscale /.test(f) ? "zscale" : process.platform === "darwin" && / scale_vt /.test(f) ? "VideoToolbox" : null;
  hdr ? ok(`ffmpeg HDR -> SDR (${hdr}) untuk footage iPhone`) : console.log("  -    ffmpeg tanpa zscale/scale_vt: footage HDR akan dinormalisasi tanpa tone mapping (warna bisa pucat)");
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
const syncMode = config().sync ?? "auto";
if (whisperReady()) ok(`whisper large-v3-turbo (opsional): QA kejelasan kata & sinkron cadangan aktif · sinkron: ${syncMode}`);
else if (syncMode === "whisper") fail("config sync=whisper, tetapi model whisper belum dipasang", "jalankan setup dengan --with-whisper, atau hapus \"sync\" dari config.local.json");
else console.log("  -    whisper tidak dipasang (opsional): sinkron kata dari timestamps ElevenLabs; QA kejelasan kata lewat qa --asr=eleven");

try {
  await ensureBrowser();
  ok("browser render (Chrome Headless Shell)");
} catch (e) {
  fail(`browser render: ${e.message}`);
}

// Higgsfield (opsional, aset AI lewat npm run gen): informasi saja, tidak pernah menggagalkan
{
  const hfm = await import("./higgsfield.mjs");
  const v = hfm.version();
  if (!v) console.log("  -    CLI Higgsfield tidak terpasang (opsional, aset AI): jalankan ulang /content-creator:setup");
  else {
    const a = hfm.account();
    if (a.ok) ok(`Higgsfield CLI ${v} (${a.email ?? "akun"}${a.plan ? `, paket ${a.plan}` : ""}${Number.isFinite(a.credits) ? `, ${a.credits} kredit` : ""}) · aset AI: npm run gen`);
    else console.log(`  -    Higgsfield CLI ${v} belum siap (opsional, aset AI): ${a.error.replace(/^.*?: (?=jalankan)/, "")}`);
  }
}

console.log(bad ? `\n${bad} masalah ditemukan.` : "\nSemua siap. Pipeline bisa dipakai.");
process.exit(bad ? 1 : 0);
