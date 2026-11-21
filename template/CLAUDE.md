# Panduan untuk Claude (workspace content-creator)

Workspace ini membuat video (Reels/TikTok 9:16, feed 4:5/1:1, YouTube 16:9 pendek atau panjang) dengan plugin **content-creator**: video animasi dari naskah
dan edit footage milik pengguna. **Style = rasa** (`Styles/`, dipakai brand mana pun), **brand = identitas + suara** (`Brands/`).
Mulai video baru dengan `/content-creator <ide video>`; skill itu memuat alur lengkapnya (wawancara grill-me → contoh frame
gaya + audisi suara → lalu otomatis tanpa pertanyaan: naskah → voice over ElevenLabs → visual → SFX → preview → render → QA → posting;
satu-satunya pertanyaan setelah wawancara: simpan ke Google Drive?; untuk klip pendek dari video panjang juga: klip mana yang dibuat).
Jalur C: `npm run new` + `npm run produce` (kit `Engine/kit/html/`). Edit footage: `npm run edit` (talking-head; podcast 2-4 orang dengan
style Siniar, `--speakers=N [--multicam]`); klip pendek 9:16 dari video panjang: `npm run clips`.

## Struktur folder
| Folder | Isi |
|---|---|
| `Projects/<nama>/` | satu folder per video: `brief.md`, `script.md`, `script.txt`, `storyboard.json`, `voice.wav`, `preview/`, `html/`, `assets/`, `posting/`, `versions/`; proyek edit footage: `edit.json`, `edit/konteks.md`, `assets/raw/`, `klip.json` + `klip/` (usulan klip); klip = proyek anak `<nama>-<id>/` |
| `Styles/<slug>/` | style bernama (rasa video): `style.json`, `STYLE.md`, `selera.md` (selera visual), `examples/`; bawaan plugin di `Engine/styles/` (`npm run style -- list`) |
| `Brands/<slug>/` | satu folder per brand (identitas + suara): `profile.json`, `theme.json`, `brand.md`, `MOTION.md`, `logo/`, `examples/`; `Brands/_selera.md` = riwayat brand, suara, isi |
| `References/` | contoh gaya (video/gambar) |
| `Result/<brand>/<nama>/` | hasil jadi saja: `<nama>.mp4`, `thumbnail.jpg`, `caption.txt` (+ format lain) |
| `Engine/` | mesin dari plugin (diganti setiap `/content-creator:setup`); milik workspace di dalamnya: `config.local.json`, `src/pop/custom/`, `voices/`, `work/` |

## Penamaan
`[tanggal]-[count]-[nama]` (mis. `20261103-01-pengenalan-produk`) = nama folder `Projects/<nama>/`, `Engine/work/<nama>/`,
`Result/<brand>/<nama>/`. `tanggal` = YYYYMMDD, `count` = urutan di tanggal itu, `nama` = huruf kecil + tanda minus.

## Aturan naskah (wajib)
- Hook kuat di 3 detik pertama, gaya bicara santai, kalimat pendek, ditulis seperti orang bicara.
- Koma = jeda singkat, titik = jeda panjang. `> jeda: 0.3-0.7` setelah punchline.
- Satu scene per heading `## `; baris `>` = catatan visual (tidak dibacakan). Target 20-45 detik, 5-9 scene (±2,5 kata/dtk),
  kecuali pengguna meminta durasi lain (video panjang 2-20 menit: banyak scene, tetap satu ide per scene).
- Bab hanya bila disepakati per video: `> bab: Judul` di scene pertama tiap bab (tampil `label` atau `kartu`, `npm run new -- <nama> --bab=...`).

## Aturan produksi
0. **Selalu tanya brand pojok atas** (kiri/kanan, boleh kosong) untuk setiap video; jangan memakai ulang tanpa bertanya.
1. Suara dulu, visual mengikuti suara, lalu SFX, baru render. Jangan memperlambat suara; panjang video diatur lewat naskah.
2. Satu voice untuk satu video; brand berulang memakai profil `Brands/<slug>/profile.json` (`profile:` di frontmatter).
3. Visual lewat salah satu jalur: A Pop (`npm run render`), B motion-graphics-v4 (`npm run mg4`, butuh skill Anthropic
   terpasang), C HTML motion-graphics-skills (`npm run new -- <nama> --style=<style>` + `npm run produce`). Baca `STYLE.md`
   style itu dan `Brands/<slug>/MOTION.md` (bila ada) sebelum mendesain. Selera visual dicatat per style (`npm run style -- selera`).
   Kanvas ditanya per video: jalur C dan edit footage langsung dalam 9:16, 16:9, 4:5, atau 1:1 (`--format=`); jalur A/B 9:16 + `npm run export`.
4. Wajib preview + cek tata letak + `npm run qa` lolos sebelum diserahkan; `npm run posting` menghasilkan thumbnail (sampul khusus dari `posting/thumbnail.json`, 3 varian berpemicu psikologis yang jujur) + caption.
5. Setelah pengguna menyetujui video final: `npm run drive -- <nama>` (bila Drive sudah diatur). Jangan unggah yang belum disetujui.
6. Jangan membuka, menampilkan, atau menyalin API key (`.env.local`).
7. Aset AI Higgsfield (opsional, `npm run gen`): hanya dengan batas kredit yang disepakati pengguna; login hanya oleh pengguna
   (`higgsfield auth login`); tanpa teks, orang nyata, atau testimoni palsu di prompt; klip AI yang tampak nyata diberi label AI saat posting.

Semua perintah `npm run ...` dijalankan dari `Engine/`. Rincian teknis: `Engine/README.md`.
