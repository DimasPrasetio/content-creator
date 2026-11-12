# Panduan untuk Claude (workspace content-creator)

Workspace ini membuat video motion graphic vertikal (Reels/TikTok, 1080×1920) dari naskah, dengan plugin **content-creator**.
Mulai video baru dengan `/content-creator <ide video>`; skill itu memuat alur lengkapnya (wawancara grill-me → contoh frame
gaya + audisi suara → naskah disetujui → voice over ElevenLabs → visual → SFX → preview → render → QA → posting → Drive).

## Struktur folder
| Folder | Isi |
|---|---|
| `Projects/<nama>/` | satu folder per video: `brief.md`, `script.md`, `script.txt`, `storyboard.json`, `voice.wav`, `preview/`, `html/`, `assets/`, `posting/`, `versions/` |
| `Brands/<slug>/` | satu folder per brand: `profile.json`, `brand.md`, `MOTION.md`, `logo/`, `examples/`; `Brands/_selera.md` = riwayat selera |
| `References/` | contoh gaya (video/gambar) |
| `Result/<brand>/<nama>/` | hasil jadi saja: `<nama>.mp4`, `thumbnail.jpg`, `caption.txt` (+ format lain) |
| `Engine/` | mesin dari plugin (diganti setiap `/content-creator:setup`); milik workspace di dalamnya: `config.local.json`, `src/pop/custom/`, `voices/`, `work/` |

## Penamaan
`[tanggal]-[count]-[nama]` (mis. `20261103-01-pengenalan-produk`) = nama folder `Projects/<nama>/`, `Engine/work/<nama>/`,
`Result/<brand>/<nama>/`. `tanggal` = YYYYMMDD, `count` = urutan di tanggal itu, `nama` = huruf kecil + tanda minus.

## Aturan naskah (wajib)
- Hook kuat di 3 detik pertama, gaya bicara santai, kalimat pendek, ditulis seperti orang bicara.
- Koma = jeda singkat, titik = jeda panjang. `> jeda: 0.3-0.7` setelah punchline.
- Satu scene per heading `## `; baris `>` = catatan visual (tidak dibacakan). Target 20-45 detik, 5-9 scene (±2,5 kata/dtk).

## Aturan produksi
0. **Selalu tanya brand pojok atas** (kiri/kanan, boleh kosong) untuk setiap video; jangan memakai ulang tanpa bertanya.
1. Suara dulu, visual mengikuti suara, lalu SFX, baru render. Jangan memperlambat suara; panjang video diatur lewat naskah.
2. Satu voice untuk satu video; brand berulang memakai profil `Brands/<slug>/profile.json` (`profile:` di frontmatter).
3. Visual lewat salah satu jalur: A Pop (`npm run render`), B motion-graphics-v4 (`npm run mg4`, butuh skill Anthropic
   terpasang), C HTML motion-graphics-skills (`npm run html`). Baca `Brands/<slug>/MOTION.md` sebelum mendesain bila ada.
4. Wajib preview + cek tata letak + `npm run qa` lolos sebelum diserahkan; `npm run posting` menghasilkan thumbnail + caption.
5. Setelah pengguna menyetujui video final: `npm run drive -- <nama>` (bila Drive sudah diatur). Jangan unggah yang belum disetujui.
6. Jangan membuka, menampilkan, atau menyalin API key (`.env.local`).

Semua perintah `npm run ...` dijalankan dari `Engine/`. Rincian teknis: `Engine/README.md`.
