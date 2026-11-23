// Unggah hasil video yang SUDAH DISETUJUI pengguna ke TikTok, ke akun milik brand video itu (Result/<brand>/<nama>/).
// Lewat tiktok-uploader (robot browser, TIDAK RESMI: bisa rusak bila TikTok mengubah tampilan web; akun bisa dibatasi).
//
//   npm run tiktok -- status [--json]                  status login TikTok tiap brand
//   npm run tiktok -- login <brand> [--cookies=<file>]  PENGGUNA login sendiri di jendela browser (QR dari aplikasi
//                                                       TikTok paling mudah); cadangan: impor cookies.txt (format
//                                                       Netscape) yang diekspor pengguna dari Chrome
//   npm run tiktok -- logout <brand>                   hapus login tersimpan brand itu
//   npm run tiktok -- <nama> --sekarang | --jadwal="YYYY-MM-DD HH:MM"   (jam WIB; 20 menit - 10 hari ke depan)
//        [--privat] (hanya saya, untuk akun uji)  [--file=<nama>.16x9.mp4]  [--label-ai=ya|tidak] (bawaan: ya bila
//        proyek memakai aset AI Higgsfield)  [--latihan] (isi formulir, tanpa klik Post)  [--cek] (periksa saja, tanpa
//        browser)  [--headless]  [--ulang] (unggah lagi walau sudah pernah)  [--akun=<brand>]
//
// Login tersimpan per brand di ~/.config/content-creator/tiktok/<brand>/ (profil browser, di luar repo & workspace;
// tidak pernah dicetak, tidak ikut `npm run brand -- pack`). Riwayat unggah: Projects/<nama>/tiktok.json.
// Pengaturan per brand (opsional) di Brands/<slug>/profile.json → "tiktok": {"comment": true, "duet": true,
// "stitch": true, "akun": "@handle"} ("akun" = pengaman: unggah dibatalkan bila browser login sebagai akun lain).
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DIRS, ENGINE, P, ROOT, brandProfile, config, readJson, resolveName, run } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k) => args.includes(`--${k}`);
const BASE = process.env.CC_TIKTOK_DIR ?? path.join(os.homedir(), ".config", "content-creator", "tiktok");
const PY = path.join(ENGINE, ".venv", "bin", "python");
const HELPER = path.join(ENGINE, "scripts", "tiktok_upload.py");
const TZ_OFFSET_MIN = (config().tiktok?.utcOffsetMin ?? 420); // WIB = UTC+7
const accDir = (slug) => path.join(BASE, slug);
const account = (slug) => readJson(path.join(accDir(slug), "akun.json"), null);
const slugOk = (s) => /^[a-z0-9][a-z0-9-]*$/.test(s ?? "");

const libReady = () => existsSync(PY) && spawnSync(PY, ["-c", "import tiktok_uploader"], { stdio: "ignore" }).status === 0;
const needLib = () => {
  if (!libReady()) throw new Error("tiktok-uploader belum terpasang: jalankan ulang /content-creator:setup (atau bash bin/setup.sh)");
};
// pembantu Python; keluaran dialirkan langsung (baris berisi "cookie" disaring sebagai pengaman), hasil = baris "HASIL {json}"
const helper = (a) =>
  new Promise((resolve) => {
    const ch = spawn(PY, [HELPER, ...a], { cwd: ENGINE, stdio: ["inherit", "pipe", "pipe"] });
    let res = null;
    const tail = [];
    const pipe = (stream, isErr) => {
      let buf = "";
      stream.setEncoding("utf8");
      stream.on("data", (d) => {
        buf += d;
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const l of lines) {
          if (l.startsWith("HASIL ")) { try { res = JSON.parse(l.slice(6)); } catch {} continue; }
          if (/cookie|sessionid/i.test(l) || !l.trim()) continue;
          const clean = l.replace(/\x1b\[[0-9;]*m/g, "");
          if (isErr) tail.push(clean), tail.length > 20 && tail.shift();
          console.log(isErr ? `  · ${clean}` : clean);
        }
      });
    };
    pipe(ch.stdout, false);
    pipe(ch.stderr, true);
    ch.on("close", (status) => resolve({ status, res, err: tail.join("\n") }));
  });
const ageDays = (iso) => (iso ? (Date.now() - Date.parse(iso)) / 864e5 : Infinity);
const statusOf = (slug) => {
  const a = account(slug);
  if (!a) return { brand: slug, status: "belum login" };
  const exp = a.sesiBerakhir ? Date.parse(a.sesiBerakhir) : null;
  const left = exp ? Math.floor((exp - Date.now()) / 864e5) : null;
  return {
    brand: slug,
    akun: a.akun ?? null,
    status: exp && exp < Date.now() ? "kedaluwarsa" : left !== null && left < 7 ? "segera kedaluwarsa" : "login",
    loginAt: a.loginAt,
    sesiBerakhir: a.sesiBerakhir ?? null,
    sisaHari: left,
  };
};

/** Status semua brand (dipakai juga oleh npm run akun). */
export const tiktokStatus = () => {
  const brands = existsSync(DIRS.brands) ? readdirSync(DIRS.brands).filter((d) => !d.startsWith("_") && existsSync(path.join(DIRS.brands, d, "profile.json"))) : [];
  const logged = existsSync(BASE) ? readdirSync(BASE).filter((d) => existsSync(path.join(BASE, d, "akun.json"))) : [];
  return { lib: libReady(), base: BASE, brands: [...new Set([...brands, ...logged])].sort().map(statusOf) };
};

/** Jadwal "YYYY-MM-DD HH:MM" (jam lokal brand, bawaan WIB) -> Date UTC, dibulatkan ke 5 menit berikutnya. */
export const parseSchedule = (s, now = Date.now(), offsetMin = TZ_OFFSET_MIN) => {
  const m = String(s ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2})[:.](\d{2})$/);
  if (!m) throw new Error(`Format jadwal "${s}" tidak dikenali: pakai --jadwal="YYYY-MM-DD HH:MM" (jam WIB)`);
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - offsetMin * 60e3;
  const r = t % 300e3;
  if (r) t += 300e3 - r; // TikTok hanya menerima kelipatan 5 menit
  if (t < now + 20 * 60e3) throw new Error(`Jadwal ${s} terlalu dekat: TikTok minimal 20 menit dari sekarang (beri jeda ±25 menit)`);
  if (t > now + 10 * 864e5) throw new Error(`Jadwal ${s} terlalu jauh: TikTok maksimal 10 hari ke depan`);
  const local = new Date(t + offsetMin * 60e3).toISOString().slice(0, 16).replace("T", " ");
  return { utc: new Date(t).toISOString(), local };
};

/** Caption TikTok dari caption.txt: spasi rapi, tagar selalu dipisah spasi (diketik per kata oleh tiktok_upload.py). */
export const tiktokCaption = (txt) =>
  String(txt)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/(\S)(#[\p{L}\p{N}_]+)/gu, "$1 $2")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const usesAI = (dir) => {
  // gambar/video AI (audio AI tidak perlu label visual)
  const man = readJson(path.join(dir, "assets", "gen", "manifest.json"), null);
  return Object.values(man?.items ?? {}).some((m) => ["image", "video"].includes(m?.kind));
};

const main = async () => {
  const cmd = args.find((a) => !a.startsWith("--"));
  if (!cmd || cmd === "status") {
    const st = tiktokStatus();
    if (flag("json")) return console.log(JSON.stringify(st, null, 2));
    console.log(`TikTok (tiktok-uploader ${st.lib ? "terpasang" : "BELUM terpasang: jalankan ulang /content-creator:setup"}; login di ${st.base})\n`);
    for (const b of st.brands)
      console.log(`  ${b.brand.padEnd(16)} ${b.status}${b.akun ? ` · ${b.akun}` : ""}${b.sisaHari !== null && b.sisaHari !== undefined ? ` · sesi ±${b.sisaHari} hari lagi` : ""}`);
    if (!st.brands.length) console.log("  (belum ada brand)");
    console.log(`\nLogin: npm run tiktok -- login <brand>   (Anda sendiri yang login di jendela browser)`);
    return;
  }
  if (cmd === "login" || cmd === "logout") {
    const slug = args.filter((a) => !a.startsWith("--"))[1];
    if (!slugOk(slug)) throw new Error(`Sebutkan brand: npm run tiktok -- ${cmd} <brand> (slug huruf kecil, mis. tokosaya)`);
    if (cmd === "logout") {
      rmSync(accDir(slug), { recursive: true, force: true });
      return console.log(`Login TikTok brand ${slug} dihapus dari komputer ini.`);
    }
    needLib();
    if (!existsSync(path.join(DIRS.brands, slug, "profile.json")) && slug !== "umum")
      console.log(`Catatan: Brands/${slug}/profile.json belum ada; login tetap disimpan untuk slug "${slug}".`);
    mkdirSync(accDir(slug), { recursive: true, mode: 0o700 });
    const ck = opt("cookies");
    if (ck && !existsSync(ck.replace(/^~/, os.homedir()))) throw new Error(`File cookies tidak ditemukan: ${ck}`);
    console.log(ck ? `Mengimpor cookie TikTok untuk brand ${slug} (isinya tidak ditampilkan) ...` : `Membuka jendela login TikTok untuk brand ${slug} ...`);
    const { status, res, err } = await helper(["login", "--dir", accDir(slug), ...(ck ? ["--cookies", ck.replace(/^~/, os.homedir())] : [])]);
    if (status !== 0 || !res?.ok) throw new Error(`Login TikTok ${slug} belum berhasil${err ? `: ${err.split("\n").at(-1)}` : ""}`);
    console.log(`\nLogin TikTok brand ${slug} tersimpan${res.akun ? ` (${res.akun})` : ""}${res.sesiBerakhir ? `, sesi berlaku sampai ${res.sesiBerakhir.slice(0, 10)}` : ""}.`);
    if (ck) console.log(`Hapus file ${ck} sekarang bila tidak dipakai lagi (berisi sesi login Anda).`);
    return;
  }

  // ===== unggah satu video =====
  const name = resolveName(cmd);
  const p = P(name);
  const slug = opt("akun") ?? p.brand;
  const prof = brandProfile(slug) ?? {};
  const tcfg = { comment: true, duet: true, stitch: true, ...(prof.tiktok ?? {}) };
  const problems = [];
  const notes = [];
  const now = flag("sekarang");
  const jadwal = opt("jadwal");
  if (!now && !jadwal) problems.push("pilih waktu tayang: --sekarang atau --jadwal=\"YYYY-MM-DD HH:MM\" (WIB)");
  if (now && jadwal) problems.push("pilih salah satu: --sekarang atau --jadwal");
  let sched = null;
  if (jadwal) try { sched = parseSchedule(jadwal); } catch (e) { problems.push(e.message); }

  const video = path.join(p.resultDir, opt("file") ?? `${name}.mp4`);
  if (!existsSync(p.resultDir)) problems.push(`folder hasil belum ada: ${path.relative(ROOT, p.resultDir)} (render + npm run posting dulu)`);
  if (!existsSync(video)) problems.push(`video tidak ada: ${path.relative(ROOT, video)}`);
  if (!existsSync(p.caption)) problems.push(`caption.txt belum ada (npm run posting -- ${name})`);
  const caption = existsSync(p.caption) ? tiktokCaption(readFileSync(p.caption, "utf8")) : "";
  if (existsSync(p.caption) && !caption) problems.push("caption.txt kosong");
  if (caption.length > 4000) problems.push(`caption ${caption.length} karakter, batas TikTok 4000`);
  else if (caption.length > 2200) notes.push(`caption ${caption.length} karakter (panjang; TikTok lama membatasi 2200)`);
  const cover = existsSync(p.thumbnail) ? p.thumbnail : null;
  if (!cover) notes.push("thumbnail.jpg tidak ada: sampul dipilih TikTok dari frame video");

  let info = null;
  if (existsSync(video)) {
    const [w, h, d] = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "default=nw=1:nk=1", video]).trim().split("\n").map(Number);
    info = { w, h, dur: d, mb: statSync(video).size / 1048576 };
    if (!(d > 0)) problems.push("durasi video tidak terbaca");
    if (d > 60 * 60) problems.push(`video ${Math.round(d / 60)} menit; TikTok web maksimal 60 menit`);
    if (info.mb > 4096) problems.push(`video ${Math.round(info.mb)} MB; batas TikTok 4 GB`);
    if (w && h && Math.abs(w / h - 9 / 16) > 0.02) notes.push(`video ${w}x${h} (bukan 9:16): tetap diunggah, tampil dengan bilah hitam di TikTok`);
  }

  const labelOpt = opt("label-ai");
  const autoAI = usesAI(p.dir);
  const labelAI = labelOpt ? /^(ya|yes|true|1)$/i.test(labelOpt) : autoAI;
  if (autoAI && labelOpt && !labelAI) notes.push("proyek memakai aset AI tetapi label AI dimatikan (--label-ai=tidak): pastikan klipnya tidak tampak nyata");

  const st = statusOf(slug);
  if (st.status === "belum login") problems.push(`brand ${slug} belum punya login TikTok: pengguna menjalankan npm run tiktok -- login ${slug}`);
  else if (st.status === "kedaluwarsa") problems.push(`login TikTok brand ${slug} kedaluwarsa: npm run tiktok -- login ${slug}`);
  else if (st.status === "segera kedaluwarsa") notes.push(`sesi login ${slug} berakhir ±${st.sisaHari} hari lagi`);
  if (tcfg.akun && st.akun && tcfg.akun.toLowerCase() !== st.akun.toLowerCase())
    problems.push(`profil brand ${slug} mengharapkan akun ${tcfg.akun}, tetapi login tersimpan = ${st.akun}`);

  const recPath = path.join(p.dir, "tiktok.json");
  const rec = readJson(recPath, { unggahan: [] });
  const vsha = existsSync(video) ? sha(video) : null;
  const done = rec.unggahan.find((u) => u.ok && !u.latihan && u.sha256 === vsha);
  if (done && !flag("ulang") && !flag("latihan"))
    problems.push(`video ini sudah diunggah ${done.at.slice(0, 16).replace("T", " ")} UTC ke ${done.akun ?? slug} (pakai --ulang bila memang ingin unggah lagi)`);
  if (!flag("cek") && !libReady()) problems.push("tiktok-uploader belum terpasang: jalankan ulang /content-creator:setup");

  console.log(`TikTok · ${name}`);
  console.log(`  akun      : brand ${slug}${st.akun ? ` (${st.akun})` : ""} · ${st.status}`);
  console.log(`  video     : ${path.relative(ROOT, video)}${info ? ` · ${info.w}x${info.h} · ${info.dur.toFixed(1)} dtk · ${info.mb.toFixed(1)} MB` : ""}`);
  console.log(`  sampul    : ${cover ? "thumbnail.jpg" : "-"}`);
  console.log(`  tayang    : ${sched ? `jadwal ${sched.local} WIB` : now ? "sekarang" : "?"}${flag("privat") ? " · privat (hanya saya)" : " · publik"}`);
  console.log(`  label AI  : ${labelAI ? "ya" : "tidak"}${autoAI ? " (proyek memakai aset AI)" : ""}`);
  console.log(`  interaksi : komentar ${tcfg.comment ? "ya" : "tidak"} · duet ${tcfg.duet ? "ya" : "tidak"} · stitch ${tcfg.stitch ? "ya" : "tidak"}`);
  console.log(`  caption   : ${caption.split("\n")[0].slice(0, 90)}${caption.length > 90 ? " …" : ""} (${caption.length} karakter)`);
  for (const n of notes) console.log(`  catatan   : ${n}`);
  if (problems.length) {
    for (const x of problems) console.log(`  MASALAH   : ${x}`);
    throw new Error(`${problems.length} hal perlu dibereskan sebelum unggah TikTok`);
  }
  if (flag("cek")) return console.log("\nCek lolos (tanpa membuka browser). Unggah: jalankan tanpa --cek.");

  needLib();
  const posting = path.join(p.dir, "posting");
  mkdirSync(posting, { recursive: true });
  const job = {
    dir: accDir(slug),
    video,
    caption,
    cover,
    jadwalUTC: sched?.utc ?? null,
    jadwalLokal: sched?.local ?? null,
    privat: flag("privat"),
    labelAI,
    latihan: flag("latihan"),
    headless: flag("headless") ? true : null,
    comment: !!tcfg.comment,
    duet: !!tcfg.duet,
    stitch: !!tcfg.stitch,
    akunDiharapkan: tcfg.akun ?? null,
    screenshot: path.join(posting, "tiktok-latihan.png"),
    screenshotGagal: path.join(posting, "tiktok-gagal.png"),
  };
  const jobFile = path.join(p.work, "tiktok-job.json");
  mkdirSync(p.work, { recursive: true });
  writeFileSync(jobFile, JSON.stringify(job, null, 2));
  const t0 = Date.now();
  const { status, res, err } = await helper(["upload", jobFile]);
  rmSync(jobFile, { force: true });
  const entry = {
    at: new Date().toISOString(),
    ok: !!res?.ok,
    latihan: job.latihan || undefined,
    brand: slug,
    akun: res?.akun ?? st.akun ?? null,
    file: path.basename(video),
    sha256: vsha,
    tayang: sched ? { jadwalWIB: sched.local, utc: sched.utc } : "sekarang",
    privat: job.privat || undefined,
    labelAI: res?.labelAI ?? false,
    detik: Math.round((Date.now() - t0) / 1000),
    ...(res?.tiruan ? { tiruan: res.tiruan } : {}), // selftest: isi formulir halaman tiruan
    ...(res?.ok ? {} : { alasan: res?.alasan ?? "unggah", pesan: res?.pesan ?? err.split("\n").at(-1) ?? null }),
  };
  rec.unggahan.push(entry);
  writeFileSync(recPath, JSON.stringify(rec, null, 2) + "\n");
  if (status === 0 && res?.ok) {
    if (job.latihan) return console.log(`\nLatihan selesai: formulir terisi${entry.labelAI ? " + label AI tercentang" : ""}, TIDAK diposting. Tangkapan: ${path.relative(ROOT, job.screenshot)}`);
    return console.log(`\n${sched ? `Terjadwal tayang ${sched.local} WIB` : "Terunggah"} di TikTok ${entry.akun ?? slug}${entry.labelAI ? " (berlabel konten AI)" : ""}. Tercatat di ${path.relative(ROOT, recPath)}.`);
  }
  const why = {
    login: `login TikTok brand ${slug} tidak berlaku lagi: pengguna menjalankan npm run tiktok -- login ${slug}`,
    akun: `browser login sebagai akun lain (${res?.pesan ?? ""}); login ulang dengan akun yang benar`,
    labelAI: "label konten AI tidak bisa dicentang otomatis, jadi video TIDAK diunggah. Unggah manual lewat aplikasi/web TikTok dan nyalakan label AI",
  }[entry.alasan] ?? `${entry.pesan ?? "gagal"}. Bisa karena tampilan TikTok berubah, CAPTCHA, atau jaringan; lihat ${path.relative(ROOT, job.screenshotGagal)}`;
  throw new Error(`Unggah TikTok gagal: ${why}`);
};

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain)
  main().catch((e) => {
    console.error(`\n${e.message}`);
    process.exit(1);
  });
