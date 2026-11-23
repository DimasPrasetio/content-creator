// Status akun & layanan luar + langkah berikutnya, untuk pengguna yang baru memasang content-creator.
//
//   npm run akun            ringkasan: ElevenLabs (wajib), Higgsfield, Google Drive, TikTok, skill motion-graphics-v4, whisper (opsional)
//   npm run akun -- --json  sama, dalam JSON (dibaca skill setup untuk memandu satu per satu)
//
// Tidak pernah mencetak key/token. Login selalu dilakukan pengguna sendiri (perintah di kolom "langkah").
import { existsSync } from "node:fs";
import path from "node:path";
import { ENGINE, ROOT, config, mg4Skill, run, whisperReady } from "./lib.mjs";

const asJson = process.argv.includes("--json");
const cfg = config();
const env = `. ~/.config/content-creator/env.sh && `;
const q = (s) => `"${s}"`;
const items = [];
const add = (o) => items.push(o);

// 1) ElevenLabs (wajib untuk voice over; edit footage tanpa voice over tetap bisa)
{
  const it = { id: "elevenlabs", nama: "ElevenLabs (voice over)", wajib: true };
  const onboard = `cd ${q(ROOT)} && npx -y @elevenlabs/cli@latest onboard init`;
  if ((cfg.provider ?? "elevenlabs").toLowerCase() !== "elevenlabs") add({ ...it, status: "lewati", info: `provider ${cfg.provider} (bukan ElevenLabs)` });
  else if (!process.env.ELEVENLABS_API_KEY)
    add({ ...it, status: "perlu", info: "belum ada key di .env.local workspace",
      langkah: [onboard, "ikuti petunjuknya: buat API key di elevenlabs.io (Profile → API Keys), tempel di terminal itu, bukan di obrolan"] });
  else
    try {
      const { eleven, quota } = await import("./eleven.mjs");
      const qt = await quota();
      const el = cfg.elevenlabs ?? {};
      const id = el.voices?.[el.voice] ?? el.voice;
      let vj = null;
      try { vj = await eleven().voices.get(id); } catch {}
      const info = `paket ${qt.tier}, sisa ${qt.left}/${qt.limit} karakter`;
      if (!vj) add({ ...it, status: "perlu", info: `${info}; voice default "${el.voice}" tidak ada di akun`, langkah: [`cd ${q(ENGINE)} && npm run voices`, "pilih voice lalu tulis namanya di Engine/config.local.json → elevenlabs.voice"] });
      else if (qt.tier === "free" && vj.category !== "premade")
        add({ ...it, status: "perlu", info: `${info}; voice "${el.voice}" (${vj.category}) butuh paket berbayar lewat API`, langkah: ["upgrade paket di elevenlabs.io, atau pakai voice premade (npm run voices)"] });
      else add({ ...it, status: "siap", info: `${info}; voice default ${el.voice}` });
    } catch (e) {
      add({ ...it, status: "perlu", info: `key ada tetapi gagal dipakai: ${String(e.message).split("\n")[0]}`, langkah: [onboard] });
    }
}

// 2) Higgsfield (opsional, aset AI berbayar kredit)
{
  const it = { id: "higgsfield", nama: "Higgsfield (aset AI, opsional)", wajib: false };
  try {
    const { account, version } = await import("./higgsfield.mjs");
    const v = version();
    if (!v) add({ ...it, status: "perlu", info: "CLI belum terpasang", langkah: ["jalankan ulang /content-creator:setup"] });
    else {
      const a = account();
      if (a.ok) add({ ...it, status: "siap", info: `${a.email ?? "akun"}${a.plan ? `, paket ${a.plan}` : ""}${Number.isFinite(a.credits) ? `, ${a.credits} kredit` : ""}` });
      else add({ ...it, status: "opsional", info: a.error, langkah: [`${env}higgsfield auth login`, "login di browser yang terbuka (sekali per komputer)"] });
    }
  } catch (e) {
    add({ ...it, status: "opsional", info: e.message });
  }
}

// 3) Google Drive (opsional, simpan hasil yang disetujui)
{
  const it = { id: "drive", nama: "Google Drive (simpan hasil, opsional)", wajib: false };
  const d = cfg.drive ?? {};
  const remote = d.remote ?? "gdrive";
  let remotes = null;
  try { remotes = run("rclone", ["listremotes"]); } catch {}
  if (remotes === null) add({ ...it, status: "perlu", info: "rclone belum terpasang", langkah: ["jalankan ulang /content-creator:setup"] });
  else if (!d.rootFolderId)
    add({ ...it, status: "opsional", info: "folder tujuan belum diatur",
      langkah: ["buka folder Drive tujuan di browser; ID = bagian URL setelah /folders/",
        `tulis di Engine/config.local.json: "drive": {"remote": "${remote}", "rootFolderId": "<ID>"}`,
        `${env}rclone config create ${remote} drive scope=drive root_folder_id=<ID>   (izinkan di browser)`] });
  else if (!remotes.split("\n").includes(`${remote}:`))
    add({ ...it, status: "opsional", info: `remote rclone "${remote}" belum ada`, langkah: [`${env}rclone config create ${remote} drive scope=drive root_folder_id=${d.rootFolderId}   (izinkan di browser)`] });
  else
    try {
      run("rclone", ["lsjson", `${remote}:`, "--dirs-only", "--max-depth", "1"]);
      add({ ...it, status: "siap", info: `remote ${remote}, folder ${d.rootFolderId}` });
    } catch {
      add({ ...it, status: "perlu", info: "folder Drive tidak bisa diakses", langkah: [`${env}rclone config reconnect ${remote}:`, "pastikan akun Google Anda Editor di folder itu"] });
    }
}

// 4) TikTok (opsional, unggah hasil yang disetujui; login per brand oleh pengguna sendiri)
{
  const it = { id: "tiktok", nama: "TikTok (unggah, opsional)", wajib: false };
  try {
    const { tiktokStatus } = await import("./tiktok.mjs");
    const st = tiktokStatus();
    const on = st.brands.filter((b) => b.status === "login" || b.status === "segera kedaluwarsa");
    const stale = st.brands.filter((b) => b.status === "kedaluwarsa" || b.status === "segera kedaluwarsa");
    if (!st.lib) add({ ...it, status: "perlu", info: "tiktok-uploader belum terpasang", langkah: ["jalankan ulang /content-creator:setup"] });
    else if (!on.length) add({ ...it, status: "opsional", info: "belum ada brand yang login", langkah: [`cd ${q(ENGINE)} && npm run tiktok -- login <brand>   (Anda login sendiri di jendela browser; QR dari aplikasi TikTok paling mudah)`] });
    else add({ ...it, status: stale.length ? "perlu" : "siap", info: `login: ${on.map((b) => `${b.brand}${b.akun ? ` (${b.akun})` : ""}`).join(", ")}${stale.length ? `; perlu login ulang: ${stale.map((b) => b.brand).join(", ")}` : ""}`,
      ...(stale.length ? { langkah: stale.map((b) => `cd ${q(ENGINE)} && npm run tiktok -- login ${b.brand}`) } : {}) });
  } catch (e) {
    add({ ...it, status: "opsional", info: e.message });
  }
}

// 5) skill motion-graphics-v4 (opsional, milik Anthropic, untuk jalur B)
add(mg4Skill()
  ? { id: "mg4", nama: "skill motion-graphics-v4 (jalur B, opsional)", wajib: false, status: "siap", info: "terpasang" }
  : { id: "mg4", nama: "skill motion-graphics-v4 (jalur B, opsional)", wajib: false, status: "opsional", info: "tidak terpasang; jalur A (Komik) & C (HTML) tetap jalan", langkah: ["pasang skill motion-graphics-v4 dari Anthropic ke ~/.claude/skills/ bila ingin jalur B"] });

// 6) whisper (opsional, QA kejelasan kata gratis/offline)
add(whisperReady()
  ? { id: "whisper", nama: "whisper lokal (opsional)", wajib: false, status: "siap", info: "QA kejelasan kata offline" }
  : { id: "whisper", nama: "whisper lokal (opsional)", wajib: false, status: "opsional", info: "tidak dipasang (QA kejelasan lewat ElevenLabs)", langkah: ["/content-creator:setup --with-whisper   (±1,8 GB)"] });

if (asJson) {
  console.log(JSON.stringify({ workspace: ROOT, items }, null, 2));
} else {
  const icon = { siap: "OK  ", perlu: "PERLU", opsional: "  - ", lewati: "  - " };
  console.log(`Akun & layanan content-creator (workspace ${ROOT})\n`);
  for (const i of items) {
    console.log(`  ${icon[i.status]} ${i.nama}: ${i.info ?? ""}`);
    for (const l of i.langkah ?? []) console.log(`         → ${l}`);
  }
  const wajib = items.filter((i) => i.wajib && i.status === "perlu");
  console.log(wajib.length ? `\nBelum siap: ${wajib.map((i) => i.nama).join(", ")}. Jalankan langkah di atas di terminal Anda sendiri, lalu npm run akun lagi.` : "\nSemua yang wajib sudah siap. Yang opsional boleh diatur kapan saja.");
  if (!existsSync(path.join(ROOT, ".env.local")) && process.env.ELEVENLABS_API_KEY) console.log("(key ElevenLabs dibaca dari environment, bukan .env.local)");
}
