// Bagian selftest v0.11: unggah TikTok tanpa jaringan dan tanpa akun. Pustaka tiktok-uploader diuji sambungannya
// (selfcheck), lalu login (impor cookie tiruan), cek, latihan, dan unggah dijalankan terhadap halaman TikTok TIRUAN lokal
// (Engine/selftest/tiktok-mock.html, lewat CC_TIKTOK_MOCK). Unggahan ke TikTok sungguhan hanya dengan akun uji pengguna.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, run } from "./lib.mjs";

export async function tiktokTest({ npm, rows, step, keep }) {
  const NAME = "00000000-30-selftest-tiktok";
  const p = P(NAME);
  const base = path.join(ENGINE, "work", "_tiktok-akun-uji");
  const row = (langkah, ok, catatan = "") => rows.push({ langkah, hasil: ok ? "LULUS" : "GAGAL", detik: 0, catatan: String(catatan).slice(0, 90) });
  const json = (f, d = null) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
  const env0 = { dir: process.env.CC_TIKTOK_DIR, mock: process.env.CC_TIKTOK_MOCK };
  const clean = () => {
    for (const d of [p.dir, p.work, p.resultDir, base]) rmSync(d, { recursive: true, force: true });
  };
  clean();
  process.env.CC_TIKTOK_DIR = base;
  process.env.CC_TIKTOK_MOCK = path.join(ENGINE, "selftest", "tiktok-mock.html");
  try {
    // pustaka & titik sambung
    step("tiktok: pustaka tiktok-uploader + pengaman cookie", path.join(ENGINE, ".venv", "bin", "python"), [path.join(ENGINE, "scripts", "tiktok_upload.py"), "selfcheck"]);

    // fungsi murni: caption & jadwal
    const m = await import("./tiktok.mjs");
    const cap = m.tiktokCaption("Hook kuat!\r\n\n\n\nManfaat  satu.#belajar\n#fyp   #tips");
    const now = Date.UTC(2026, 10, 23, 5, 0);
    const s1 = m.parseSchedule("2026-11-23 13:07", now);
    let tooClose = false, tooFar = false;
    try { m.parseSchedule("2026-11-23 12:15", now); } catch { tooClose = true; }
    try { m.parseSchedule("2026-12-05 12:00", now); } catch { tooFar = true; }
    row("tiktok: caption rapi + jadwal WIB (5 menit, 20 mnt-10 hr)",
      cap === "Hook kuat!\n\nManfaat satu. #belajar\n#fyp #tips" && s1.utc === "2026-11-23T06:10:00.000Z" && s1.local === "2026-11-23 13:10" && tooClose && tooFar,
      `${JSON.stringify(cap).slice(0, 40)} · ${s1.local}`);

    // hasil jadi tiruan (9:16) di Result/umum/<nama>/
    mkdirSync(p.dir, { recursive: true });
    mkdirSync(p.resultDir, { recursive: true });
    run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=2", "-f", "lavfi", "-i", "sine=f=440:d=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", p.result]);
    run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x223344:s=1080x1920", "-frames:v", "1", p.thumbnail]);
    writeFileSync(p.caption, "Video uji unggah otomatis!\n\nDibuat content-creator. #belajar #fyp\n");

    npm("tiktok: tolak bila brand belum login", "tiktok", [NAME, "--cek", "--sekarang"], { allowFail: true });
    row("tiktok: pesan belum login jelas", /belum punya login TikTok/.test(step.last) && /npm run tiktok -- login umum/.test(step.last));

    const ck = path.join(p.dir, "cookies-uji.txt");
    writeFileSync(ck, "# Netscape HTTP Cookie File\n.tiktok.com\tTRUE\t/\tTRUE\t4102444800\tsessionid\tnilai-uji\n.tiktok.com\tTRUE\t/\tTRUE\t0\ttt_csrf_token\tx\n");
    npm("tiktok: login impor cookie (tiruan)", "tiktok", ["login", "umum", `--cookies=${ck}`]);
    const acc = json(path.join(base, "umum", "akun.json"), {});
    row("tiktok: login tersimpan di luar workspace, cookie tidak tercetak", acc.akun === "@akun_uji" && !/nilai-uji/.test(step.last), `${acc.akun} · ${acc.sesiBerakhir?.slice(0, 10)}`);

    npm("tiktok: wajib pilih waktu tayang", "tiktok", [NAME, "--cek"], { allowFail: true });
    row("tiktok: tanpa --sekarang/--jadwal ditolak", /pilih waktu tayang/.test(step.last));
    npm("tiktok: cek lolos (sekarang)", "tiktok", [NAME, "--cek", "--sekarang"]);
    row("tiktok: rencana unggah benar", /label AI\s+: tidak/.test(step.last) && /sampul\s+: thumbnail\.jpg/.test(step.last) && /@akun_uji/.test(step.last));

    // proyek beraset AI -> label otomatis
    mkdirSync(path.join(p.assets, "gen"), { recursive: true });
    writeFileSync(path.join(p.assets, "gen", "manifest.json"), JSON.stringify({ items: { meja: { kind: "video", credits: 0 } } }));
    npm("tiktok: latihan (formulir terisi, tanpa Post) + label AI", "tiktok", [NAME, "--latihan", "--sekarang", "--headless"]);
    const shot = path.join(p.dir, "posting", "tiktok-latihan.png");
    row("tiktok: latihan tidak memposting", existsSync(shot) && /Latihan selesai.*label AI tercentang/.test(step.last) && /TIDAK diposting/.test(step.last));

    npm("tiktok: unggah ke halaman tiruan", "tiktok", [NAME, "--sekarang", "--headless"]);
    const rec = json(path.join(p.dir, "tiktok.json"), { unggahan: [] });
    const last = rec.unggahan.at(-1) ?? {};
    row("tiktok: tercatat di tiktok.json", last.ok === true && !last.latihan && last.labelAI === true && last.akun === "@akun_uji" && rec.unggahan.length === 2, `${rec.unggahan.length} entri`);
    const t = last.tiruan ?? {};
    row("tiktok: caption, sampul, label AI terisi di formulir", /Video uji unggah otomatis!/.test(t.caption ?? "") && /#belajar #fyp/.test(t.caption ?? "") && !/nama-file-video/.test(t.caption ?? "") && t.cover && t.ai && t.comment, JSON.stringify(t.caption ?? "").slice(0, 60));
    row("tiktok: tidak ada cookie di keluaran", !/nilai-uji|sessionid/i.test(step.last));

    npm("tiktok: tolak unggah ganda", "tiktok", [NAME, "--sekarang", "--headless"], { allowFail: true });
    row("tiktok: video yang sama tidak terunggah dua kali", /sudah diunggah/.test(step.last));

    npm("tiktok: logout", "tiktok", ["logout", "umum"]);
    row("tiktok: login terhapus", !existsSync(path.join(base, "umum")));
  } finally {
    if (env0.dir === undefined) delete process.env.CC_TIKTOK_DIR; else process.env.CC_TIKTOK_DIR = env0.dir;
    if (env0.mock === undefined) delete process.env.CC_TIKTOK_MOCK; else process.env.CC_TIKTOK_MOCK = env0.mock;
    if (!keep) clean();
  }
}
