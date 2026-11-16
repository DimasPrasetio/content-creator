# Changelog

## 0.5.0
- **Mesin edit footage berbasis style** (`npm run edit`): footage talking-head yang sudah ada → video 1080×1920 sesuai
  style. Normalisasi (30 fps tetap, HDR → SDR lewat zscale / VideoToolbox, potong 9:16 mengikuti wajah untuk footage
  horizontal), transkrip per kata (Scribe atau sidecar `.words.json`), analisis wajah & titik mulut/mata (OpenCV YuNet),
  gerak tangan, cahaya, kulit, noise → `edit/konteks.md` untuk agent.
- Rencana `edit.json` per kalimat (maksud, buang/A-roll/B-roll/dim, objek, alasan) dengan glosarium salah dengar;
  potong per kata (jeda & kata pengisi dibuang, ambil ulang & kalimat terpotong ditandai), punch-in bertumpu di wajah.
- **Grading terkalibrasi**: tiap sumber diukur ulang sampai luma p1/p50/p99 dan chroma kulit mencapai target style
  (maks 4 putaran); suara dibersihkan sesuai noise, de-ess, kompresi, loudness linear ke target style.
- Komposisi Remotion `Edit`: kata kunci kotak + kicker tulisan tangan (Caveat), kata besar, chip, anotasi berpanah ke
  wajah, bingkai fokus, kartu dokumen, chat HP, prompt diketik, berkas, kartu hasil, HP CTA berisi klip, gambar aset,
  panel B-roll dengan PiP wajah, subtitle karaoke; penempatan sadar wajah & zona subtitle.
- Cek: teks layar = ucapan, kata pemicu, objek menutup wajah / zona subtitle, porsi & panjang B-roll, layar diam, tempo,
  grading, tata letak, QA. Style bawaan `narration` (`Engine/styles/`), style workspace `Styles/<slug>/`.
- Setup memasang OpenCV; plugin membawa model YuNet (MIT) dan font Caveat (OFL); `npm run check` memeriksa wajah, font,
  dan kemampuan HDR ffmpeg. Selftest menguji mesin edit tanpa kredit.

## 0.4.2
- **Thumbnail khusus, bukan frame video**: `npm run thumbnail` (otomatis lewat `posting` bila
  `Projects/<nama>/posting/thumbnail.json` ada) merender 1-4 varian sampul dari tema brand (`kit/thumb/thumb.html`):
  kicker, headline besar dengan kata stabilo, sub, stiker (question/alert/cross/check/arrow), potongan frame video atau
  gambar aset. Layout `atas` (teks atas + kartu visual) dan `tengah` (frame penuh digelapkan).
- Pemicu psikologis per varian (penasaran, takut-rugi/larangan, angka, tantangan, kontras) dengan pagar kejujuran:
  angka harus diucapkan di video, klaim mutlak (dijamin, gratis, 100%, terbukti, rahasia, ...) harus ada di naskah/brief.
- Cek keterbacaan: headline ≥ 100 px, teks di pita aman y 300-1500 (grid 3:4 TikTok & 4:5 Instagram), stiker tidak
  menimpa teks; `posting/thumb-grid.jpg` = simulasi grid profil untuk diperiksa agent.
- Agent menulis 3 varian, memilih yang terkuat (`pick`), dua lainnya disimpan untuk uji A/B manual.

## 0.4.1
- **Zona aman TikTok menjadi standar** (1080×1920, 9:16): semua teks & brand di **x 60–940 · y 220–1440**. Atas 220 px
  tertutup status bar + tab "Mengikuti/Untuk Anda" + ikon cari, kanan 140 px kolom tombol, bawah 480 px nama akun,
  caption, dan musik.
- Kit HTML: progress bar y 232, label bab & watermark y 254–296 (watermark berakhir di x 940), subtitle y 1244–1414
  (lebar 880, 50 px). Zona visual tetap ditulis sebagai SVG 1080×1000 (scenes.js lama tetap jalan) dan ditampilkan
  diskalakan 0,9 di tengah area aman (layar y 316–1171); stabilo `question()` dan kit kamera ikut skala yang sama.
  Tema `"layout": "penuh"` mengembalikan tata letak lama.
- Cek tata letak (`src/probe/measure.js`, jalur A & C): teks atau brand pojok di luar zona aman = **error**
  (sebelumnya hanya peringatan y < 220 / y > 1500, error baru di y > 1700).
- Brand pojok `brand_png.py` (jalur B & HTML non-kit) dan header Pop/Video pindah ke y 226–276, sisi kanan berakhir di x 940.

## 0.4.0
- **Kit kamera (gaya "produk-kamera")** `engine/kit/html/kit-camera.js`: lapisan DOM "dunia" per scene dengan kamera sendiri
  (`shot(s)`, `S.cam` maju / ikut aksi / mundur / meluncur dengan zoom-out), komponen UI produk (jendela aplikasi, ponsel,
  kartu, chip, tombol, dokumen, progres, kursor macOS, riak ketuk, cap/segel brand, garis cahaya sinkron, label dunia) dan
  `statement()` (pernyataan besar + stabilo + kamera maju). Ikut crossfade scene dengan larut-blur; bisa dicampur dengan
  scene SVG. Teknik dari explainer-default (Barty-Bart/motion-graphics, MIT).
- **Motion blur adaptif** di `html_render.py` (`--subframes`, storyboard/tema `motionBlur`): rana 180°, 16 sub-frame
  dirata-rata hanya untuk frame yang bergerak cepat (`window.__motion`); halaman tanpa kit kamera tidak berubah.
- Tema: blok `ui` (palet layar produk + `stamp` file cap brand, disalin `npm run new` ke `html/stamp.*`) dan `motionBlur`.
- Cek tata letak: teks di lapisan kamera yang terpotong tepi bingkai kamera tidak dihitung error (disengaja).
- **Render HTML lebih tahan & merata**: video dibagi potongan 2 dtk yang diambil bergiliran oleh worker yang kosong (adegan
  berat tidak menumpuk di satu worker). Worker yang gagal tidak lagi menggagalkan render: worker lain menghabiskan antrean,
  potongan yang belum jadi diulang paralel tanpa GPU, lalu 1 worker; laporan menyebut pengulangan yang terjadi.
- **Perbaikan**: server lokal renderer kini menerima 128 koneksi antre (bawaan Python 5). Halaman dengan banyak file kadang
  gagal memuat skrip (`ERR_CONNECTION_RESET`) sehingga `window.seek` tidak pernah ada, render paralel timeout lalu jatuh ke
  1 worker tanpa GPU (video 71 dtk ber-kit kamera: 509-731 → 78 dtk). Tunggu halaman siap memakai polling timer (bukan rAF).

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
