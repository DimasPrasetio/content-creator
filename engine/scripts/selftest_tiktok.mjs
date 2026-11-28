// Bagian selftest v0.11: unggah TikTok tanpa jaringan dan tanpa akun. Pustaka tiktok-uploader diuji sambungannya
// (selfcheck), lalu login (impor cookie tiruan), cek, latihan, dan unggah dijalankan terhadap halaman TikTok TIRUAN lokal
// (Engine/selftest/tiktok-mock.html, lewat CC_TIKTOK_MOCK). Unggahan ke TikTok sungguhan hanya dengan akun uji pengguna.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ENGINE, P, run } from "./lib.mjs";

export async function tiktokTest({ npm, rows, step, keep }) {
  const NAME = "00000000-30-selftest-tiktok";
  const p = P(NAME);
  const base = path.join(ENGINE, "work", "_tiktok-akun-uji");
  const row = (langkah, ok, catatan = "") => rows.push({ langkah, hasil: ok ? "LULUS" : "GAGAL", detik: 0, catatan: String(catatan).slice(0, 90) });
  const json = (f, d = null) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };
  const env0 = { dir: process.env.CC_TIKTOK_DIR, mock: process.env.CC_TIKTOK_MOCK };
  delete process.env.CC_TIKTOK_MOCK_COVER;
  delete process.env.CC_TIKTOK_MOCK_CAPTCHA;
  delete process.env.CC_TIKTOK_MOCK_JADWAL;
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
    const cap5 = m.tiktokCaption("Teks #a ok.\n\n#b #c #A #d #e #f #g\n#h");
    const now = Date.UTC(2026, 10, 23, 5, 0);
    const s1 = m.parseSchedule("2026-11-23 13:07", now);
    let tooClose = false, tooFar = false;
    try { m.parseSchedule("2026-11-23 12:15", now); } catch { tooClose = true; }
    try { m.parseSchedule("2026-12-05 12:00", now); } catch { tooFar = true; }
    row("tiktok: caption rapi, maks 5 tagar + jadwal WIB (5 menit, 20 mnt-10 hr)",
      cap === "Hook kuat!\n\nManfaat satu. #belajar\n#fyp #tips" && cap5 === "Teks #a ok.\n\n#b #c #d #e" && s1.utc === "2026-11-23T06:10:00.000Z" && s1.local === "2026-11-23 13:10" && tooClose && tooFar,
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
    // tanpa thumbnail.jpg = ditolak (video TikTok wajib bersampul khusus)
    const thumbAway = p.thumbnail + ".pindah";
    renameSync(p.thumbnail, thumbAway);
    npm("tiktok: tolak bila thumbnail tidak ada", "tiktok", [NAME, "--cek", "--sekarang"], { allowFail: true });
    renameSync(thumbAway, p.thumbnail);
    row("tiktok: tanpa thumbnail.jpg tidak diunggah", /thumbnail\.jpg tidak ada/.test(step.last));
    npm("tiktok: cek lolos (sekarang)", "tiktok", [NAME, "--cek", "--sekarang"]);
    row("tiktok: rencana unggah benar", /label AI\s+: tidak/.test(step.last) && /sampul\s+: thumbnail\.jpg/.test(step.last) && /@akun_uji/.test(step.last));

    // proyek beraset AI -> label otomatis
    mkdirSync(path.join(p.assets, "gen"), { recursive: true });
    writeFileSync(path.join(p.assets, "gen", "manifest.json"), JSON.stringify({ items: { meja: { kind: "video", credits: 0 } } }));
    npm("tiktok: latihan (formulir terisi, tanpa Post) + label AI", "tiktok", [NAME, "--latihan", "--sekarang"]);
    const shot = path.join(p.dir, "posting", "tiktok-latihan.png");
    row("tiktok: latihan tidak memposting", existsSync(shot) && /Latihan selesai.*label AI tercentang/.test(step.last) && /TIDAK diposting/.test(step.last));

    // sampul gagal terpasang -> dibatalkan, tidak pernah diposting dengan sampul bawaan
    process.env.CC_TIKTOK_MOCK_COVER = "gagal";
    npm("tiktok: sampul gagal -> batal", "tiktok", [NAME, "--sekarang"], { allowFail: true });
    delete process.env.CC_TIKTOK_MOCK_COVER;
    const g = (json(path.join(p.dir, "tiktok.json"), { unggahan: [] }).unggahan.at(-1)) ?? {};
    row("tiktok: tanpa sampul khusus tidak diposting", g.ok === false && g.alasan === "sampul" && g.sampul === false && /TIDAK diunggah/.test(step.last), `${g.alasan} · ${g.pesan ?? ""}`);

    // CAPTCHA di browser tersembunyi (bawaan) -> berhenti, tidak ditembus, saran --jendela
    process.env.CC_TIKTOK_MOCK_CAPTCHA = "ya";
    npm("tiktok: CAPTCHA -> berhenti", "tiktok", [NAME, "--sekarang"], { allowFail: true });
    delete process.env.CC_TIKTOK_MOCK_CAPTCHA;
    const c = (json(path.join(p.dir, "tiktok.json"), { unggahan: [] }).unggahan.at(-1)) ?? {};
    row("tiktok: CAPTCHA di headless -> batal + saran --jendela", c.ok === false && c.alasan === "captcha" && /--jendela/.test(step.last) && /TIDAK diunggah/.test(step.last), `${c.alasan} · ${c.pesan ?? ""}`);

    // pemilih jadwal: besok 10:45 WIB, diisi lewat tiap tampilan TikTok yang dikenal lalu DIBACA ULANG dari formulir.
    // Tampilan yang tidak dikenali -> batal + diagnostik, video tidak pernah tayang langsung (kegagalan 2026-11-28).
    const J = `${new Date(Date.now() + 864e5 + 7 * 36e5).toISOString().slice(0, 10)} 10:45`;
    const jd = new Date(m.parseSchedule(J).utc), two = (n) => String(n).padStart(2, "0");
    const lokal = `${jd.getFullYear()}-${two(jd.getMonth() + 1)}-${two(jd.getDate())} ${two(jd.getHours())}:${two(jd.getMinutes())}`; // zona browser
    const lastEntry = () => (json(path.join(p.dir, "tiktok.json"), { unggahan: [] }).unggahan.at(-1)) ?? {};
    for (const v of ["lama", "baru-macet"]) {
      process.env.CC_TIKTOK_MOCK_JADWAL = v;
      npm(`tiktok: latihan jadwal (pemilih ${v})`, "tiktok", [NAME, "--latihan", `--jadwal=${J}`], { allowFail: true });
      delete process.env.CC_TIKTOK_MOCK_JADWAL;
      const e = lastEntry();
      row(`tiktok: jadwal terpasang & terbaca ulang (pemilih ${v})`, e.ok === true && e.latihan === true && e.jadwalTerbaca === lokal && /dibaca ulang dari formulir/.test(step.last), `${e.jadwalTerbaca ?? e.pesan ?? "?"} vs ${lokal}`);
    }
    process.env.CC_TIKTOK_MOCK_JADWAL = "aneh";
    npm("tiktok: pemilih jadwal tak dikenal -> batal", "tiktok", [NAME, `--jadwal=${J}`], { allowFail: true });
    delete process.env.CC_TIKTOK_MOCK_JADWAL;
    const ja = lastEntry();
    row("tiktok: jadwal gagal -> tidak diposting + diagnostik", ja.ok === false && ja.alasan === "jadwal" && !ja.tiruan && existsSync(path.join(p.dir, "posting", "tiktok-jadwal-gagal.html")) && /TIDAK diunggah/.test(step.last), `${ja.alasan} · ${ja.pesan ?? ""}`);

    npm("tiktok: unggah terjadwal ke halaman tiruan (--headless lama tetap diterima)", "tiktok", [NAME, `--jadwal=${J}`, "--headless"]);
    const rec = json(path.join(p.dir, "tiktok.json"), { unggahan: [] });
    const last = rec.unggahan.at(-1) ?? {};
    row("tiktok: tercatat di tiktok.json", last.ok === true && !last.latihan && last.labelAI === true && last.akun === "@akun_uji" && rec.unggahan.length === 7, `${rec.unggahan.length} entri`);
    const t = last.tiruan ?? {};
    row("tiktok: popup ditutup; caption, sampul (Edit cover), komentar/reuse, label AI terisi", /Video uji unggah otomatis!/.test(t.caption ?? "") && /#belajar #fyp/.test(t.caption ?? "") && !/nama-file-video/.test(t.caption ?? "") && t.cover && last.sampul === true && t.ai && t.comment && t.reuse && last.interaksi?.Comment === "ya" && !t.checksOn, JSON.stringify(t.caption ?? "").slice(0, 60));
    row("tiktok: jadwal ikut terposting (pemilih combobox)", t.jadwal === lokal && last.jadwalTerbaca === lokal && /Terjadwal tayang/.test(step.last), `${t.jadwal} vs ${lokal}`);
    row("tiktok: tidak ada cookie di keluaran", !/nilai-uji|sessionid/i.test(step.last));

    npm("tiktok: tolak unggah ganda", "tiktok", [NAME, "--sekarang"], { allowFail: true });
    row("tiktok: video yang sama tidak terunggah dua kali", /sudah diunggah/.test(step.last));

    npm("tiktok: logout", "tiktok", ["logout", "umum"]);
    row("tiktok: login terhapus", !existsSync(path.join(base, "umum")));
  } finally {
    if (env0.dir === undefined) delete process.env.CC_TIKTOK_DIR; else process.env.CC_TIKTOK_DIR = env0.dir;
    if (env0.mock === undefined) delete process.env.CC_TIKTOK_MOCK; else process.env.CC_TIKTOK_MOCK = env0.mock;
    if (!keep) clean();
  }
}
