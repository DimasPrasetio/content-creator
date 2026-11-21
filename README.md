# content-creator

Plugin Claude Code untuk membuat **video pendek vertikal (Reels/TikTok, 1080×1920) dari ide sampai MP4 siap upload**:
wawancara penyamaan persepsi → contoh frame gaya dari naskah Anda sendiri → audisi suara → naskah disetujui → voice over
ElevenLabs yang konsisten → visual sinkron per kata → sound effect → render → QA otomatis → thumbnail + caption → Google Drive.

*A Claude Code plugin that turns an idea into a finished vertical short video (TikTok/Reels): interview, script, ElevenLabs
voice-over, word-synced motion graphics, SFX, render, automatic QA, thumbnail + caption, and Google Drive upload.
Docs and prompts are in Indonesian.*

## Fitur
- **Style bernama, lepas dari brand**: rasa video (tata letak, huruf, peran warna, gerak, subtitle, musik, color
  grading) disimpan sebagai style dengan nama yang mudah diingat (bawaan **Komik** dan **Ngobrol**; buat sendiri dari
  video referensi, video yang sudah jadi, obrolan + contoh frame, atau moodboard). Brand hanya identitas (logo,
  watermark, warna brand, CTA, penutup) + suara, dan boleh memakai style mana pun dengan warna brand atau warna style
  (`npm run style`, [template/Styles/README.md](template/Styles/README.md)). Arah berikutnya: [docs/ROADMAP.md](docs/ROADMAP.md).
- **Edit footage yang sudah ada, berbasis style** (bukan brand): rekaman talking-head (vertikal/horizontal, termasuk HDR
  iPhone) → potong rapat per kata, grading dikalibrasi ke target style, suara dibersihkan, panel motion graphic & objek
  yang ditempatkan sadar wajah, subtitle per kata. Agent memutuskan isi visual dari konteks tiap kalimat. Style bawaan
  `ngobrol` (dulu `narration`); style baru bisa dibedah dari video referensi Anda (`Styles/<slug>/`). Lihat
  [engine/styles/README.md](engine/styles/README.md).
- **Tiga jalur visual**, dipilih dari contoh frame naskah Anda:
  - **A · Pop cinematic** (Remotion): poster komik-pop, transisi grafis, grain, scene khusus per video.
  - **B · Motion graphics v4**: 5 gaya explainer teks (butuh skill Anthropic `motion-graphics-v4` terpasang terpisah).
  - **C · HTML motion** (15 skill dari [motion-graphics-skills](https://github.com/charlie947/motion-graphics-skills)):
    launch video premium, explainer dokumenter, keynote ala Apple, chart animasi, milestone, efek UI, opener 3D.
    Plus **kit kamera** (gaya produk-kamera): UI produk dibangun ulang dan difilmkan kamera yang maju, mengikuti aksi,
    mundur, dan meluncur, dengan motion blur adaptif.
- **Suara ElevenLabs** lewat SDK resmi, satu voice per video, profil suara per brand, seed tetap, jangkar konsistensi suara.
- **Sinkron per kata**: waktu tiap kata langsung dari ElevenLabs (timestamps, tanpa biaya tambahan); elemen muncul tepat
  saat katanya diucapkan. Whisper lokal opsional (`--with-whisper`) untuk QA kejelasan kata gratis / offline.
- **QA otomatis**: format, loudness, konsistensi suara, kejelasan, sinkron, dan **cek tata letak** (teks terpotong, keluar
  bingkai, menabrak brand pojok, tertutup UI Reels).
- **Paket posting**: subtitle SRT/VTT, caption + hashtag, ekspor 4:5 / 1:1 / 16:9, dan **thumbnail khusus**: 3 varian
  sampul berpemicu psikologis (penasaran, angka, larangan, ...) dari tema brand, dicek keterbacaannya di grid profil dan
  kejujurannya (angka & klaim harus ada di video).
- **Ukuran file wajar**: encode *capped CRF* (±30-60 MB per menit untuk video bergrain, jauh lebih kecil untuk video
  bersih); `npm run compress` untuk mengecilkan hasil lama atau mencapai ukuran target.
- **Hasil per brand**: `Result/<brand>/<nama>/` dan, setelah disetujui, salinan ke Google Drive (rclone).
- **Aset AI Higgsfield (opsional)**: gambar & klip B-roll dari model Higgsfield (Seedance, GPT Image, ...) lewat CLI resmi
  yang dipasang setup (`npm run gen`): perkiraan kredit gratis, batas kredit per proyek, cache, manifest. Dipakai sebagai
  klip cutaway di edit footage, aset jalur C, dan latar thumbnail. MCP Higgsfield untuk Claude Code opsional
  (`--with-higgsfield-mcp`).

## Kebutuhan
- [Claude Code](https://claude.com/claude-code), macOS (dengan [Homebrew](https://brew.sh)) atau Linux (Ubuntu/Debian; root atau sudo tanpa password paling mulus)
- 4 CPU, RAM 8 GB+, disk kosong ±4 GB (+1,8 GB bila memakai whisper); GPU tidak perlu
- **Semua komponen pendukung dipasang otomatis oleh setup**: Node.js, ffmpeg, uv + Python 3.12, rclone, paket npm/Python,
  Chromium, library sistem Chromium (Linux), CLI Higgsfield. Tidak ada model besar yang wajib diunduh.
- Yang Anda siapkan sendiri hanya **akun**: ElevenLabs (wajib; voice Voice Library butuh paket berbayar), Google
  Drive (opsional), Higgsfield (opsional, paket berbayar untuk aset AI), dan skill Anthropic `motion-graphics-v4`
  (opsional, jalur B).

Panduan lengkap, termasuk pola tim: **[docs/SETUP.md](docs/SETUP.md)** · Windows (WSL2): **[docs/WINDOWS.md](docs/WINDOWS.md)** ·
status akun kapan saja: `npm run akun`

## Pasang
Di Claude Code:
```
/plugin marketplace add DimasPrasetio/content-creator
/plugin install content-creator@content-creator
/content-creator:setup
```
`/content-creator:setup` memasang semuanya ke folder **workspace** Anda (bawaan `~/ContentCreator`), lalu memandu login
ElevenLabs (`elevenlabs onboard`, klik Authorize di browser), voice default, dan (opsional) Google Drive. Profil brand
bisa dibagikan antar anggota tim dengan `npm run brand -- pack/unpack`.
Tanpa Claude Code, setup bisa dijalankan langsung: `bash bin/setup.sh ~/ContentCreator`.

## Pakai
Buka Claude Code di folder mana pun, lalu:
```
/content-creator buatkan video 45 detik tentang ...
```
Agent menanyakan hal yang perlu (tujuan, penonton, hook, CTA, rasa visual, rasa suara, brand pojok), menunjukkan contoh
frame + audisi suara, meminta persetujuan naskah sebelum memakai kredit, lalu memproduksi sampai `Result/<brand>/<nama>/`.

Perintah mesin (dari `<workspace>/Engine`): `npm run check`, `voice`, `render`, `mg4`, `html`, `edit`, `sound`, `qa`, `posting`, `thumbnail`, `compress`,
`export`, `drive`, `voices`, `brand`, `selftest`. Rincian: [engine/README.md](engine/README.md).

## Struktur
```
content-creator/            (plugin ini)
  skills/                   content-creator, grill-me, + 15 motion-graphics-skills
  agents/ commands/         agent content-creator, /content-creator:setup
  engine/                   mesin render (disalin ke workspace oleh setup)
  template/                 kerangka workspace (CLAUDE.md, README folder)
  bin/setup.sh              pasang/perbarui di macOS & Linux

<workspace>/                (data Anda, tidak pernah ditimpa update plugin)
  Projects/<nama>/  Brands/<slug>/  References/  Result/<brand>/<nama>/  .env.local
  Engine/                   salinan mesin + config.local.json, src/pop/custom/, voices/, work/
```
Memperbarui plugin: `/plugin update content-creator`, lalu `/content-creator:setup` lagi (data workspace aman).

## Lisensi
MIT untuk kode plugin ini. Komponen pihak ketiga dan ketentuannya (termasuk lisensi Remotion untuk organisasi): lihat
[THIRD_PARTY.md](THIRD_PARTY.md).
