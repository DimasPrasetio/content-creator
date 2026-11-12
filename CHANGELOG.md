# Changelog

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
