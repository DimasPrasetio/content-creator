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
3. Skrip memasang sendiri semua komponen pendukung (Node, ffmpeg, uv/Python, rclone, CLI Higgsfield, paket, Chromium).
   Bila ia berhenti, itu hanya karena butuh hak admin: macOS tanpa Homebrew (pengguna menjalankan installer Homebrew
   sendiri karena meminta password) atau Linux/WSL tanpa root/sudo. Untuk Linux/WSL, sarankan pengguna menjalankan setup
   sekali di terminalnya sendiri (`! bash "<plugin>/bin/setup.sh" "<workspace>"`): skrip lalu meminta password sudo satu kali.
   Setelah itu jalankan ulang bila perlu.
4. **Akun, satu per satu.** Jalankan `. ~/.config/content-creator/env.sh && cd "<workspace>/Engine" && npm run akun -- --json`
   lalu pandu item yang statusnya `perlu`/`opsional` berurutan: ElevenLabs (wajib untuk voice over) → voice default
   (tawarkan audisi `npm run voices`) → Higgsfield (opsional) → Google Drive (opsional) → TikTok per brand (opsional) →
   whisper/motion-graphics-v4 (opsional).
   Untuk setiap item: jelaskan gunanya dalam satu kalimat, tanyakan "atur sekarang atau lewati?" (`AskUserQuestion`), lalu
   tampilkan perintah dari kolom `langkah`. Login/izin selalu dilakukan **pengguna sendiri**: perintah yang membuka browser
   atau meminta isian (`npx -y @elevenlabs/cli@latest onboard init`, `higgsfield auth login`, `rclone config create ...`,
   `npm run tiktok -- login <brand>`; sebutkan sekali bahwa unggah TikTok memakai robot browser tidak resmi)
   diketik pengguna di terminalnya atau di kotak obrolan dengan awalan `!` (mis. `! cd "<workspace>" && npx -y @elevenlabs/cli@latest onboard init`).
   **Jangan pernah meminta, menerima, atau menampilkan key/token/kode di obrolan**, dan jangan membuka `.env.local`.
   Untuk Drive, minta pengguna menempel **link folder** tujuan (bukan token), ambil ID-nya, tulis `drive.rootFolderId` di
   `Engine/config.local.json`. Setelah tiap item, jalankan `npm run akun` lagi dan laporkan hasilnya apa adanya.
   Windows: setup hanya lewat WSL2, ikuti `${CLAUDE_PLUGIN_ROOT}/docs/WINDOWS.md`.
5. Panduan rinci untuk setiap langkah dan pola tim: `${CLAUDE_PLUGIN_ROOT}/docs/SETUP.md`.
6. Akhiri dengan `. ~/.config/content-creator/env.sh && cd "<workspace>/Engine" && npm run selftest` dan laporkan hasilnya apa adanya.
