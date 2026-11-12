---
description: Pasang atau perbarui workspace content-creator di komputer ini (mesin render, dependensi, pengaturan; whisper opsional)
argument-hint: "[path workspace] [--with-whisper]"
---

Pasang atau perbarui workspace content-creator untuk pengguna. Bahasa kerja: Indonesia, bahasa awam.

1. Tentukan path workspace: argumen `$ARGUMENTS` bila ada; kalau tidak, isi `~/.config/content-creator/workspace` bila ada;
   kalau belum pernah diatur, tanyakan ke pengguna (rekomendasi: `~/ContentCreator`, atau folder project video yang sudah ada).
2. Jalankan: `bash "${CLAUDE_PLUGIN_ROOT}/bin/setup.sh" "<path workspace>" [--with-whisper]` (opsi `--…` dari `$ARGUMENTS`
   diteruskan apa adanya, bukan dianggap path) (bila `${CLAUDE_PLUGIN_ROOT}` tidak terisi, cari
   `bin/setup.sh` di folder plugin content-creator di bawah `~/.claude/plugins/`). Proses pertama bisa lama (unduh
   dependensi dan browser): jalankan di background dan beri kabar. Whisper (±1,8 GB) hanya dipasang bila pengguna
   memintanya (`--with-whisper`, untuk QA kejelasan kata gratis / offline / VoiceStudio).
3. Skrip memasang sendiri semua komponen pendukung (Node, ffmpeg, uv/Python, rclone, paket, Chromium). Bila ia
   berhenti, itu hanya karena butuh hak admin: macOS tanpa Homebrew (pengguna menjalankan installer Homebrew sendiri karena
   meminta password) atau Linux tanpa root/sudo (tampilkan perintah `sudo` yang dicetaknya). Setelah itu jalankan ulang.
4. Setelah selesai, bantu pengguna menyelesaikan yang tercetak di "Langkah berikutnya", satu per satu, sesuai keinginannya:
   - key ElevenLabs lewat `npx -y @elevenlabs/cli@latest onboard init` di root workspace (ikuti petunjuk yang dicetaknya;
     jangan pernah meminta key di chat);
   - voice default di `Engine/config.local.json` (tawarkan audisi `npm run voices`);
   - Google Drive (opsional): `rclone config create gdrive drive scope=drive root_folder_id=<ID>` lalu isi
     `drive.rootFolderId`; klik izin di browser dilakukan pengguna sendiri;
   - skill motion-graphics-v4 (opsional, milik Anthropic) untuk jalur B.
5. Panduan rinci untuk setiap langkah dan pola tim: `${CLAUDE_PLUGIN_ROOT}/docs/SETUP.md`.
6. Akhiri dengan `. ~/.config/content-creator/env.sh && cd "<workspace>/Engine" && npm run selftest` dan laporkan hasilnya apa adanya.
