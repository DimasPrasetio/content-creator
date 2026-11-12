// Audisi & pengelolaan voice ElevenLabs untuk memilih suara yang cocok SEBELUM voice over dibuat.
//
//   npm run voices                         daftar voice di akun + unduh preview (gratis) ke Engine/work/_voice-preview/
//   npm run voices -- --library [--gender=female] [--use=advertisement] [--search=kata]
//                                          cari voice berbahasa Indonesia di Voice Library + unduh preview (gratis)
//   npm run voices -- --sample=George,Sarah --text="Kalimat hook naskah" [--profile=<slug>]
//                                          audisi dengan kalimat ASLI (memakai kredit ±jumlah karakter × jumlah voice)
//   npm run voices -- --add=<public_owner_id>:<voice_id>:<Nama>
//                                          tambahkan voice library ke akun + config.local.json (ubah akun: minta izin pengguna)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DIRS, ENGINE, LOCAL_CONFIG, brandProfile, config, readJson } from "./lib.mjs";
import { eleven, errText, isPaidPlanError, quota, ttsToFile } from "./eleven.mjs";

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const client = eleven();
const cfgPath = LOCAL_CONFIG; // voice tambahan milik workspace
const cfg = config();
const el = cfg.elevenlabs ?? {};
const DIR = path.join(DIRS.work, "_voice-preview"); // unduhan audisi, aman dihapus
mkdirSync(DIR, { recursive: true });
const safe = (s) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
const download = async (url, file) => {
  if (!url || existsSync(file)) return existsSync(file);
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) return false;
  writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return true;
};
const sub = await quota();
const free = sub.tier === "free";
console.log(`Paket ${sub.tier}, sisa ${sub.left}/${sub.limit} karakter.\n`);

const row = (v, extra = {}) => ({
  nama: v.name.split(" - ")[0].slice(0, 22),
  gender: v.labels?.gender ?? v.gender ?? "",
  umur: v.labels?.age ?? v.age ?? "",
  aksen: `${v.labels?.language ?? v.language ?? ""}/${v.labels?.accent ?? v.accent ?? ""}`,
  karakter: v.labels?.descriptive ?? v.descriptive ?? "",
  kegunaan: v.labels?.use_case ?? v.useCase ?? v.use_case ?? "",
  ...extra,
});

if (opt("add")) {
  const [owner, id, nama] = opt("add").split(":");
  if (!owner || !id || !nama) throw new Error("Format: --add=<public_owner_id>:<voice_id>:<Nama>");
  let voice_id;
  try {
    ({ voiceId: voice_id } = await client.voices.share(owner, id, { newName: nama }));
  } catch (e) {
    throw new Error(`Gagal menambah voice: ${errText(e)}`);
  }
  const raw = readJson(cfgPath, {});
  raw.elevenlabs = { ...(raw.elevenlabs ?? {}), voices: { ...(raw.elevenlabs?.voices ?? {}), [nama]: voice_id } };
  writeFileSync(cfgPath, JSON.stringify(raw, null, 2) + "\n");
  console.log(`Voice "${nama}" ditambahkan ke akun dan config.local.json (${voice_id}).`);
} else if (opt("sample")) {
  // audisi dengan teks asli: setiap voice membaca kalimat yang sama dengan pengaturan yang sama
  const text = opt("text");
  if (!text) throw new Error('Butuh --text="kalimat hook"');
  const prof = brandProfile(opt("profile"))?.voice ?? {};
  const s = { ...el, ...prof };
  const names = opt("sample").split(",").map((x) => x.trim());
  const need = text.length * names.length;
  if (sub.left < need) throw new Error(`Kuota tidak cukup untuk audisi (butuh ${need}).`);
  for (const n of names) {
    const hit = Object.keys(s.voices ?? {}).find((k) => k.toLowerCase() === n.toLowerCase());
    const id = hit ? s.voices[hit] : n;
    const body = {
      modelId: s.model ?? "eleven_v4",
      voiceSettings: { stability: s.stability ?? 0.5, similarityBoost: s.similarityBoost ?? 0.75 },
      outputFormat: s.outputFormat ?? "mp3_44100_128",
      ...(s.languageCode ? { languageCode: s.languageCode } : {}),
      ...(s.seed !== undefined ? { seed: s.seed } : {}),
    };
    const h = createHash("sha1").update(JSON.stringify([id, text, body])).digest("hex").slice(0, 8);
    const f = path.join(DIR, `audisi-${safe(hit ?? n)}-${h}.mp3`);
    if (!existsSync(f)) {
      try {
        await ttsToFile(id, text, body, f);
      } catch (e) {
        console.log(`  ${hit ?? n}: GAGAL ${isPaidPlanError(e) ? "(voice library butuh paket berbayar)" : errText(e)}`);
        continue;
      }
    }
    console.log(`  ${hit ?? n}: ${path.relative(process.cwd(), f)}`);
  }
} else if (args.includes("--library")) {
  const { voices } = await client.voices.getShared({
    language: "id",
    pageSize: 30,
    sort: "trending",
    ...(opt("gender") ? { gender: opt("gender") } : {}),
    ...(opt("use") ? { useCases: opt("use") } : {}),
    ...(opt("search") ? { search: opt("search") } : {}),
  });
  const libDir = path.join(DIR, "library");
  mkdirSync(libDir, { recursive: true });
  const rows = [];
  for (const v of voices) {
    const f = path.join(libDir, `${safe(v.name.split(" - ")[0])}.mp3`);
    const ok = await download(v.previewUrl, f);
    rows.push(row(v, { preview: ok ? path.relative(ENGINE, f) : "-", tambah: `${v.publicOwnerId}:${v.voiceId}` }));
  }
  console.table(rows.map(({ tambah, ...r }) => r));
  console.log("\nUntuk menambah ke akun (butuh izin pengguna & paket berbayar untuk dipakai lewat API):");
  rows.slice(0, 30).forEach((r) => console.log(`  ${r.nama}: npm run voices -- --add=${r.tambah}:${safe(r.nama)}`));
} else {
  const { voices } = await client.voices.search({ pageSize: 100 });
  const mapped = Object.fromEntries(Object.entries(el.voices ?? {}).map(([n, id]) => [id, n]));
  const rows = [];
  for (const v of voices) {
    const nama = mapped[v.voiceId] ?? v.name.split(" - ")[0];
    const f = path.join(DIR, `${safe(nama)}.mp3`);
    const ok = await download(v.previewUrl, f);
    rows.push(
      row(v, {
        nama,
        bisaAPI: free && v.category !== "premade" ? "perlu upgrade" : "ya",
        diConfig: mapped[v.voiceId] ? "ya" : "-",
        preview: ok ? path.relative(ENGINE, f) : "-",
      }),
    );
  }
  rows.sort((a, b) => (a.aksen.startsWith("id") ? -1 : 0) - (b.aksen.startsWith("id") ? -1 : 0));
  console.table(rows);
  console.log("Preview gratis (bahasa contoh bisa Inggris). Audisi dengan kalimat naskah: --sample=Nama1,Nama2 --text=\"...\"");
}
