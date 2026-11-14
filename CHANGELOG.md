# Changelog

## 0.3.2
- Kit: `ctaBio()` memberi jangkar (kerangka chip & panah samar sejak awal scene), sehingga scene CTA tidak separuh kosong
  sampai kata "link".
- QA [7]: kata awal yang waktunya ditebak (mis. "AI" dibaca "Ei Ai") menggeser batas kata pertama +15 frame per kata;
  menghilangkan positif palsu "kata pertama tidak dalam 0-12 frame".

## 0.3.1
- **Timing tepat secara konteks, bukan tepat buta**: kit HTML kini memakai *jangkar scene* (`start(s)`, `at(s, f)`: objek
  utama hadir sejak scene dimulai), antisipasi `cue()` 0,12 dtk sebelum kata (`timing.lead`), dan crossfade sungguhan antar
  scene (`timing.crossfade`, scene lama tetap tampil sampai scene baru masuk). README kit aturan 1 ditulis ulang.
- `scripts/visual_gaps.py` + tahap "Cek layar kosong" di `npm run produce`: mengukur rentang layar kosong (≥ 0,4 dtk) dan
  separuh zona kosong (≥ 1 dtk) dari video jadi. Contoh: video edukasi 46 dtk turun dari 4,9 dtk kosong + 8,5 dtk separuh
  kosong menjadi 0 + 0.

## 0.3.0
- **Produksi jalur C ±4x lebih cepat, kualitas sama**: `npm run html` merender paralel (4 browser) + rasterisasi GPU
  (video 50 dtk: 117 → ±22 dtk; SSIM 0,999 terhadap render lama), otomatis kembali ke 1 worker SwiftShader bila gagal.
  `sound.py` memakai rata-rata bergerak O(n) (42 → 5 dtk, mix identik bit demi bit).
- **Kit HTML standar untuk semua brand** (`engine/kit/html/`): tema per brand `Brands/<slug>/theme.json` (warna, font,
  watermark, stabilo, subtitle, CTA, penutup), komponen kamus visual (laptop, ponsel, browser, server, database, kalender,
  pill, bar, panah, ✓/✗, lampu error, CTA, penutup), **subtitle karaoke** (kata menyala tepat saat diucapkan) dan aturan
  timing & kejelasan. Font Poppins & Inter ikut di `engine/fonts/`; rute `/kit/` di server render.
- `npm run new` (proyek dari kit + tema) dan `npm run produce` (voice → cek cue → sound → preview + board → render →
  QA ‖ posting dalam satu perintah; `cover.at: "auto"`; cue yang tidak cocok menghentikan render).
- Skill: pertanyaan hanya di penyamaan persepsi; setelah itu produksi otomatis tanpa izin, satu pertanyaan penutup untuk
  unggah Google Drive.

## 0.2.1
- **Ukuran file wajar**: semua jalur (Pop, mg4, HTML, ekspor, subtitle ditanam) memakai encode *capped CRF* dari satu
  setelan `encode` (bawaan CRF 23, maks 8 Mbps, preset slow; bisa per brand/storyboard). Video bergrain 1 menit turun
  dari ±125-450 MB menjadi ±30-60 MB tanpa beda yang terlihat.
- Jalur HTML dikompres final sekali saja (perantara kualitas tinggi), tidak lagi dua kali CRF 18.
- Hasil selalu yuv420p rentang standar (tv); sebelumnya video HTML bisa keluar rentang penuh (yuvj420p).
- `npm run compress -- <nama> [--target=MB] [--all] [--file=]`: kecilkan hasil lama atau capai ukuran target (two-pass).
- QA [1] memeriksa bitrate video terhadap batas `maxrate`.

## 0.2.0
- **Setup memasang semua komponen pendukung otomatis**: Node.js 22, ffmpeg (libx264), uv + Python 3.12, rclone, paket npm &
  Python, Chromium (Playwright + Remotion), library sistem Chromium di Linux (root/sudo). Lewat Homebrew
  (macOS), apt (Linux root/sudo), atau unduhan resmi ke folder pengguna tanpa sudo (checksum diverifikasi bila tersedia).
- Linux: PyTorch versi CPU (±200 MB, bukan CUDA ±2,5 GB); `webrtcvad-wheels` sehingga tidak butuh compiler.
- Penyalin mesin tanpa rsync (`bin/sync-engine.mjs`); alat di folder pengguna otomatis masuk PATH.
- `npm run check` memeriksa Google Drive (rclone, remote, akses folder).
- `npm run brand -- list | new | pack | unpack`: buat dan bagikan profil brand (+ scene Pop khusus brand) ke anggota tim.
- Panduan lengkap `docs/SETUP.md`, termasuk akun ElevenLabs/Drive per orang vs tim dan masalah umum.
- **Sinkron kata dari timestamps ElevenLabs** (ikut panggilan TTS, tanpa biaya tambahan) menggantikan transkripsi whisper:
  lebih tepat (awal kata jatuh di ujung jeda), ejaan mengikuti naskah, dan setup tidak lagi mengunduh model ±1,6 GB.
  Cadangan otomatis: whisper (bila terpasang) lalu forced alignment ElevenLabs. Pilihan `sync: auto | eleven | whisper`.
- Whisper kini opsional (`setup --with-whisper`); QA kejelasan kata `--asr=auto | whisper | eleven | off`.

## 0.1.0
- Rilis pertama: agent content-creator, grill-me, 15 motion-graphics-skills, mesin render portabel, workspace terpisah.
