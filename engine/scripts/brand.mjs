// Profil brand: buat, lihat, dan bagikan ke anggota tim (suara & gaya brand tetap sama siapa pun pembuatnya).
//
//   npm run brand -- list
//   npm run brand -- new <slug> [--name="Nama Brand"] [--left="TEKS KIRI"] [--right="TEKS KANAN"] [--voice=<voice>]
//   npm run brand -- pack <slug> [--scenes=a.tsx,b.tsx]   -> Brands/_export/<slug>.brand.tar.gz
//        isi: Brands/<slug>/ (profile.json, brand.md, MOTION.md, logo/, examples/) + scene Pop khusus brand (opsional)
//   npm run brand -- unpack <file.brand.tar.gz> [--force]  -> pasang di workspace ini (Brands/<slug>/ + Engine/src/pop/custom/)
// Paket TIDAK berisi key, token, atau hasil video. Kirim lewat jalur yang Anda percaya (drive tim, repo privat, dsb.).
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DIRS, ENGINE, ROOT, config, readJson, run } from "./lib.mjs";

const [cmd, arg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const opt = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const CUSTOM = path.join(ENGINE, "src", "pop", "custom");

if (cmd === "list" || !cmd) {
  const rows = (existsSync(DIRS.brands) ? readdirSync(DIRS.brands) : [])
    .filter((d) => existsSync(path.join(DIRS.brands, d, "profile.json")))
    .map((slug) => {
      const p = readJson(path.join(DIRS.brands, slug, "profile.json"), {});
      const has = (f) => (existsSync(path.join(DIRS.brands, slug, f)) ? "ya" : "-");
      return { slug, nama: p.nama ?? "", voice: p.voice?.voice ?? "", jalur: p.visual?.jalur ?? "", brandMd: has("brand.md"), motionMd: has("MOTION.md"), logo: has("logo") };
    });
  rows.length ? console.table(rows) : console.log("Belum ada profil brand. Buat: npm run brand -- new <slug>");
} else if (cmd === "new") {
  if (!arg || !SLUG.test(arg)) throw new Error("Slug wajib: huruf kecil/angka/minus, mis. npm run brand -- new tokobaju");
  const dir = path.join(DIRS.brands, arg);
  if (existsSync(path.join(dir, "profile.json"))) throw new Error(`Brand ${arg} sudah ada`);
  mkdirSync(path.join(dir, "logo"), { recursive: true });
  mkdirSync(path.join(dir, "examples"), { recursive: true });
  const el = config().elevenlabs ?? {};
  const prof = {
    nama: opt("name") ?? arg,
    brand: { left: opt("left") ?? "", right: opt("right") ?? "" },
    voice: { voice: opt("voice") ?? el.voice ?? "George", model: el.model ?? "eleven_v4", stability: el.stability ?? 0.7, similarityBoost: el.similarityBoost ?? 0.5, seed: el.seed ?? 4242 },
    visual: { jalur: null, style: null, palette: {} },
    pronounce: {},
    asrAlias: {},
    catatan: [`${new Date().toISOString().slice(0, 10)}: profil dibuat`],
  };
  writeFileSync(path.join(dir, "profile.json"), JSON.stringify(prof, null, 2) + "\n");
  console.log(`Dibuat: ${path.relative(ROOT, dir)}/ (profile.json, logo/, examples/). Lengkapi brand.md + MOTION.md lewat skill brand-intake.`);
} else if (cmd === "pack") {
  if (!arg || !existsSync(path.join(DIRS.brands, arg, "profile.json"))) throw new Error(`Brand tidak ada: Brands/${arg}/profile.json`);
  const scenes = (opt("scenes") ?? "").split(",").filter(Boolean);
  for (const s of scenes) if (!existsSync(path.join(CUSTOM, s))) throw new Error(`Scene tidak ada: Engine/src/pop/custom/${s}`);
  const stage = path.join(ENGINE, "work", `_brandpack-${arg}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(path.join(stage, "Brands"), { recursive: true });
  run("cp", ["-R", path.join(DIRS.brands, arg), path.join(stage, "Brands", arg)]);
  if (scenes.length) {
    mkdirSync(path.join(stage, "custom"), { recursive: true });
    for (const s of scenes) run("cp", [path.join(CUSTOM, s), path.join(stage, "custom", s)]);
  }
  writeFileSync(path.join(stage, "brand-pack.json"), JSON.stringify({ slug: arg, scenes, at: new Date().toISOString(), format: 1 }, null, 2));
  const outDir = path.join(DIRS.brands, "_export");
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${arg}.brand.tar.gz`);
  run("tar", ["-czf", out, "--exclude", ".DS_Store", "-C", stage, "."]);
  rmSync(stage, { recursive: true, force: true });
  console.log(`Paket brand: ${path.relative(ROOT, out)}${scenes.length ? ` (+ ${scenes.length} scene Pop)` : ""}. Kirim ke anggota tim; mereka: npm run brand -- unpack <file>`);
} else if (cmd === "unpack") {
  if (!arg || !existsSync(arg)) throw new Error("File paket tidak ditemukan");
  const stage = path.join(ENGINE, "work", `_brandunpack-${Date.now()}`);
  mkdirSync(stage, { recursive: true });
  run("tar", ["-xzf", path.resolve(arg), "-C", stage]);
  const meta = readJson(path.join(stage, "brand-pack.json"), null);
  if (!meta?.slug || !SLUG.test(meta.slug)) throw new Error("Bukan paket brand content-creator");
  const dst = path.join(DIRS.brands, meta.slug);
  if (existsSync(dst) && !process.argv.includes("--force")) throw new Error(`Brands/${meta.slug} sudah ada; tambahkan --force untuk menimpa`);
  rmSync(dst, { recursive: true, force: true });
  run("cp", ["-R", path.join(stage, "Brands", meta.slug), dst]);
  let n = 0;
  for (const s of meta.scenes ?? []) {
    const to = path.join(CUSTOM, path.basename(s));
    if (existsSync(to) && !process.argv.includes("--force")) console.warn(`! scene ${s} sudah ada, dilewati (pakai --force untuk menimpa)`);
    else (run("cp", [path.join(stage, "custom", path.basename(s)), to]), n++);
  }
  rmSync(stage, { recursive: true, force: true });
  console.log(`Terpasang: Brands/${meta.slug}/${n ? ` + ${n} scene Pop` : ""}. Pakai di naskah: profile: ${meta.slug}${n ? " (jalankan npm run typecheck)" : ""}`);
} else {
  throw new Error("Perintah: list | new <slug> | pack <slug> [--scenes=a.tsx] | unpack <file> [--force]");
}
