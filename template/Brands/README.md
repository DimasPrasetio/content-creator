# Brands

Satu folder per brand/klien: `Brands/<slug>/`. Dipakai naskah lewat frontmatter `profile: <slug>` agar **suara
dan gaya tetap sama di semua video brand itu**.

```
Brands/<slug>/
  profile.json   voice ElevenLabs + pengaturan, rekomendasi brand pojok & gaya visual, kamus pelafalan, catatan
  brand.md       siapa brand ini, penonton, yang dipromosikan, rasa, aset (dari skill brand-intake)
  MOTION.md      warna, font, timing, gerak, larangan (dari brand-intake; dibaca sebelum mendesain apa pun)
  logo/          file logo (SVG/PNG); dipakai lewat "logoLeft"/"logoRight" di storyboard
  examples/      3-5 frame referensi gaya brand ini
Brands/_selera.md  riwayat gaya & suara yang disukai/ditolak pengguna (diisi agent setelah tiap video)
```

## Perintah

```bash
npm run brand -- new <slug> --name="Nama" --left="TEKS KIRI" --voice=<voice>   # buat profil
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
  "visual": { "jalur": "Pop | mg4 | html", "style": "gaya mg4 atau skill html (mis. launch-video) | null", "palette": { "accent": "#FFD21F" } },
  "pronounce": { "istilah": "cara baca" },
  "asrAlias": { "ejaan-salah-asr": "Ejaan Benar" },
  "catatan": ["selera yang disetujui / ditolak, beserta tanggal"]
}
```

- `voice` menimpa `config.json` → `elevenlabs` untuk video ber-profil ini. Naskah yang memakai voice lain
  diberi peringatan saat `npm run voice`.
- `brand` dan `visual` hanya **rekomendasi** untuk agent content-creator; brand pojok tetap ditanyakan setiap video.
- Agent memperbarui `catatan` setelah video disetujui (apa yang disukai/ditolak pengguna).
