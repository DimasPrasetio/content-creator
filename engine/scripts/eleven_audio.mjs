// Audio tambahan dari ElevenLabs (SDK): kit SFX natural dan musik latar per video. Keduanya MEMAKAI KREDIT,
// jadi hanya jalan dengan --yes (agent wajib minta izin pengguna dulu, sebut perkiraan biayanya).
//
//   npm run sfxkit [-- --types=whoosh,boom] --yes
//       buat ulang kit SFX (public/sfx/eleven/<jenis>.wav, model eleven_text_to_sound_v3). Aktifkan dengan
//       config.json "sound": {"sfxKit": "eleven"}; sound.py otomatis kembali ke SFX sintetis bila file tidak ada.
//   npm run music -- <nama> --prompt="upbeat lo-fi, warm, no vocals" --yes
//       musik instrumental sepanjang voice over -> Engine/work/<nama>/music.wav; dipakai `npm run sound` berikutnya
//       (diatur per scene oleh "music": full/build/pad/off dan di-duck di bawah narasi).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, ROOT, readJson, resolveName, run } from "./lib.mjs";
import { eleven, errText, quota } from "./eleven.mjs";

const args = process.argv.slice(2);
const mode = args[0];
const rest = args.slice(1);
const opt = (k) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const yes = rest.includes("--yes");

const KIT = {
  whoosh: ["Fast cinematic whoosh transition, clean, short air swipe", 0.8],
  riser: ["Short tension riser building up, cinematic, ends abruptly", 1.6],
  boom: ["Deep cinematic boom hit with sub bass, short tail", 1.5],
  scratch: ["Vinyl record scratch, quick comedic stop", 0.6],
  impact: ["Punchy cartoon impact hit, comic slap, tight", 0.6],
  pop: ["Soft bubbly UI pop, cute, very short", 0.4],
  boing: ["Cartoon boing spring sound, playful", 0.7],
  stamp: ["Rubber stamp slammed on paper, thud", 0.6],
  ding: ["Bright success ding chime, clean, short", 0.9],
  click: ["Crisp mouse click, single, close mic", 0.3],
  tape: ["Masking tape ripped off a roll, quick", 0.6],
  ticks: ["Fast clock ticking, ticking seconds, tight", 1.2],
  typing: ["Fast mechanical keyboard typing burst", 1.2],
  sparkle: ["Magical sparkle shimmer, glittery, short", 0.9],
};

const toWav = (src, dst) => run("ffmpeg", ["-v", "error", "-y", "-i", src, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", dst]);
const save = async (stream, file) => {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  writeFileSync(file, Buffer.concat(chunks));
};

const q0 = await quota();
console.log(`ElevenLabs ${q0.tier}: sisa ${q0.left}/${q0.limit} kredit.`);

if (mode === "sfx") {
  const types = (opt("types") ?? Object.keys(KIT).join(",")).split(",").filter((t) => KIT[t]);
  const secs = types.reduce((t, k) => t + KIT[k][1], 0);
  console.log(`Kit SFX: ${types.length} jenis, total ±${secs.toFixed(1)} dtk audio.`);
  if (!yes) {
    console.log("Belum dijalankan: perintah ini memakai kredit. Tambahkan --yes setelah pengguna setuju.");
    process.exit(1);
  }
  const dir = path.join(ENGINE, "public", "sfx", "eleven");
  mkdirSync(dir, { recursive: true });
  for (const t of types) {
    const [text, durationSeconds] = KIT[t];
    process.stdout.write(`  ${t}: `);
    try {
      const mp3 = path.join(dir, `${t}.mp3`);
      await save(await eleven().textToSoundEffects.convert({ text, durationSeconds, promptInfluence: 0.6, modelId: "eleven_text_to_sound_v3" }), mp3);
      toWav(mp3, path.join(dir, `${t}.wav`));
      run("rm", [mp3]);
      console.log("ok");
    } catch (e) {
      console.log(`GAGAL ${errText(e)}`);
    }
  }
  console.log(`Selesai: ${path.relative(ROOT, dir)}/. Aktifkan: config.local.json "sound": {"sfxKit": "eleven"}`);
} else if (mode === "music") {
  const name = resolveName(rest.find((a) => !a.startsWith("--")));
  const paths = P(name);
  const timing = readJson(paths.timing);
  if (!timing) throw new Error(`Timing belum ada: jalankan npm run voice -- ${name}`);
  const prompt = opt("prompt");
  if (!prompt) throw new Error('Butuh --prompt="gaya musik, tempo, suasana" (instrumental)');
  const ms = Math.round((timing.totalFrames / timing.fps) * 1000);
  console.log(`Musik ${(ms / 1000).toFixed(1)} dtk untuk ${name}: "${prompt}"`);
  if (!yes) {
    console.log("Belum dijalankan: perintah ini memakai kredit. Tambahkan --yes setelah pengguna setuju.");
    process.exit(1);
  }
  mkdirSync(paths.work, { recursive: true });
  const mp3 = path.join(paths.work, "music.mp3");
  try {
    await save(await eleven().music.compose({ prompt, musicLengthMs: Math.max(10000, ms), forceInstrumental: true }), mp3);
  } catch (e) {
    throw new Error(`Musik gagal: ${errText(e)}`);
  }
  toWav(mp3, path.join(paths.work, "music.wav"));
  console.log(`Selesai: ${path.relative(ROOT, path.join(paths.work, "music.wav"))}. Jalankan npm run sound -- ${name}`);
} else {
  console.log("Pemakaian: node scripts/eleven_audio.mjs sfx|music ...");
  process.exit(1);
}
const q1 = await quota();
console.log(`Kredit terpakai: ${q0.left - q1.left} (sisa ${q1.left}).`);
