# Brands

Satu folder per brand/klien: `Brands/<slug>/` = **identitas** (nama, brand pojok, logo/watermark, warna brand, CTA,
penutup, kamus pelafalan) + **suara**. Dipakai naskah lewat frontmatter `profile: <slug>` agar **suara dan identitas
tetap sama di semua video brand itu**. Rasa video (tata letak, gerak, huruf, subtitle, musik) ada di **style**
(`Styles/`, `npm run style -- list`); brand hanya menyimpan style bawaan sebagai rekomendasi.

```
Brands/<slug>/
  profile.json   voice ElevenLabs + pengaturan, rekomendasi brand pojok & style bawaan, kamus pelafalan, catatan
  theme.json     identitas untuk kit HTML: colors (warna brand), watermark, mark, cta, closing, ui (opsional)
  brand.md       siapa brand ini, penonton, yang dipromosikan, rasa, aset (dari skill brand-intake)
  MOTION.md      aturan identitas: warna wajib, logo, larangan (dari brand-intake; rasa yang bisa dipakai ulang -> style)
  logo/          file logo (SVG/PNG); dipakai lewat "logoLeft"/"logoRight" di storyboard
  examples/      3-5 frame referensi gaya brand ini
Brands/_selera.md  riwayat brand, suara, pelafalan, isi yang disukai/ditolak (selera visual: Styles/<slug>/selera.md)
```

## Perintah

```bash
npm run brand -- new <slug> --name="Nama" --left="TEKS KIRI" --voice=<voice> [--style=<style>]   # buat profil
npm run brand -- list
npm run brand -- pack <slug> [--scenes=<file>.tsx]    # paket untuk anggota tim (tanpa key/token/video)
npm run brand -- unpack <file>.brand.tar.gz           # pasang paket dari anggota tim
```

## profile.json

```json
{
  "nama": "Nama brand",
  "brand":  { "left": "TEKS KIRI", "right": "TEKS KANAN", "logoLeft": "logo.png" },
  "voice":  { "voice": "George", "model": "eleven_v4", "stability": 0.7, "similarityBoost": 0.5, "seed": 4242 },
  "style": "papan-tulis",
  "pronounce": { "istilah": "cara baca" },
  "asrAlias": { "ejaan-salah-asr": "Ejaan Benar" },
  "encode": { "crf": 23, "maxrate": "8M" },
  "tiktok": { "akun": "@handle", "comment": true, "duet": true, "stitch": true },
  "catatan": ["selera yang disetujui / ditolak, beserta tanggal"]
}
```

- `voice` menimpa `config.json` → `elevenlabs` untuk video ber-profil ini. Naskah yang memakai voice lain
  diberi peringatan saat `npm run voice`.
- `brand` dan `style` hanya **rekomendasi** untuk agent content-creator; brand pojok tetap ditanyakan setiap video, dan
  brand boleh memakai style lain. Profil lama dengan `visual.style` tetap dibaca bila namanya cocok dengan alias style.
- `tiktok` (opsional): pengaturan unggah `npm run tiktok` untuk brand ini. `akun` = pengaman: unggahan dibatalkan bila
  browser ternyata login sebagai akun lain. Login TikTok-nya sendiri tidak disimpan di sini (dan tidak ikut `brand pack`),
  melainkan di `~/.config/content-creator/tiktok/<slug>/` lewat `npm run tiktok -- login <slug>`.
- Agent memperbarui `catatan` setelah video disetujui (apa yang disukai/ditolak pengguna).
