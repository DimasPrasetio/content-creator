---
description: Pasang atau perbarui workspace content-creator di komputer ini (mesin render, dependensi, model, pengaturan)
argument-hint: "[path workspace]"
---

Pasang atau perbarui workspace content-creator untuk pengguna. Bahasa kerja: Indonesia, bahasa awam.

1. Tentukan path workspace: argumen `$ARGUMENTS` bila ada; kalau tidak, isi `~/.config/content-creator/workspace` bila ada;
   kalau belum pernah diatur, tanyakan ke pengguna (rekomendasi: `~/ContentCreator`, atau folder project video yang sudah ada).
2. Jalankan: `bash "${CLAUDE_PLUGIN_ROOT}/bin/setup.sh" "<path workspace>"` (bila `${CLAUDE_PLUGIN_ROOT}` tidak terisi, cari
   `bin/setup.sh` di folder plugin content-creator di bawah `~/.claude/plugins/`). Proses pertama bisa lama (unduh
   dependensi, browser, dan model ±1,6 GB): jalankan di background dan beri kabar.
3. Bila skrip berhenti karena alat dasar kurang, tunjukkan perintah pemasangan yang dicetaknya. Pemasangan dengan `sudo`
   dijalankan oleh pengguna sendiri; perintah `brew` boleh dijalankan setelah pengguna setuju.
4. Setelah selesai, bantu pengguna menyelesaikan yang tercetak di "Langkah berikutnya", satu per satu, sesuai keinginannya:
   - key ElevenLabs lewat `npx -y @elevenlabs/cli@latest onboard init` di root workspace (ikuti petunjuk yang dicetaknya;
     jangan pernah meminta key di chat);
   - voice default di `Engine/config.local.json` (tawarkan audisi `npm run voices`);
   - Google Drive (opsional): `rclone config create gdrive drive scope=drive root_folder_id=<ID>` lalu isi
     `drive.rootFolderId`; klik izin di browser dilakukan pengguna sendiri;
   - skill motion-graphics-v4 (opsional, milik Anthropic) untuk jalur B.
5. Akhiri dengan `cd "<workspace>/Engine" && npm run selftest` dan laporkan hasilnya apa adanya.
