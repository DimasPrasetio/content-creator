# content-creator

Plugin Claude Code untuk membuat **video pendek vertikal (Reels/TikTok, 1080×1920) dari ide sampai MP4 siap upload**:
wawancara penyamaan persepsi → contoh frame gaya dari naskah Anda sendiri → audisi suara → naskah disetujui → voice over
ElevenLabs yang konsisten → visual sinkron per kata → sound effect → render → QA otomatis → thumbnail + caption → Google Drive.

*A Claude Code plugin that turns an idea into a finished vertical short video (TikTok/Reels): interview, script, ElevenLabs
voice-over, word-synced motion graphics, SFX, render, automatic QA, thumbnail + caption, and Google Drive upload.
Docs and prompts are in Indonesian.*

## Fitur
- **Tiga jalur visual**, dipilih dari contoh frame naskah Anda:
  - **A · Pop cinematic** (Remotion): poster komik-pop, transisi grafis, grain, scene khusus per video.
  - **B · Motion graphics v4**: 5 gaya explainer teks (butuh skill Anthropic `motion-graphics-v4` terpasang terpisah).
  - **C · HTML motion** (15 skill dari [motion-graphics-skills](https://github.com/charlie947/motion-graphics-skills)):
    launch video premium, explainer dokumenter, keynote ala Apple, chart animasi, milestone, efek UI, opener 3D.
- **Suara ElevenLabs** lewat SDK resmi, satu voice per video, profil suara per brand, seed tetap, jangkar konsistensi suara.
- **Sinkron per kata**: transkripsi faster-whisper; elemen muncul tepat saat katanya diucapkan.
- **QA otomatis**: format, loudness, konsistensi suara, kejelasan, sinkron, dan **cek tata letak** (teks terpotong, keluar
  bingkai, menabrak brand pojok, tertutup UI Reels).
- **Paket posting**: subtitle SRT/VTT, thumbnail, caption + hashtag; ekspor 4:5 / 1:1 / 16:9.
- **Hasil per brand**: `Result/<brand>/<nama>/` dan, setelah disetujui, salinan ke Google Drive (rclone).

## Kebutuhan
- [Claude Code](https://claude.com/claude-code)
- macOS atau Linux (Ubuntu 22.04/24.04 diuji untuk VPS), Node.js ≥ 20, ffmpeg (libx264), Python 3.12 lewat [uv](https://docs.astral.sh/uv/), rsync
- Akun **ElevenLabs** (voice dari Voice Library butuh paket berbayar; paket free hanya voice premade)
- Opsional: `rclone` + akun Google untuk unggah Drive; skill Anthropic `motion-graphics-v4` untuk jalur B
- Disk ±5 GB (dependensi, browser render, model transkripsi ±1,6 GB), RAM 8 GB+

## Pasang
Di Claude Code:
```
/plugin marketplace add DimasPrasetio/content-creator
/plugin install content-creator@content-creator
/content-creator:setup
```
`/content-creator:setup` memandu: memasang mesin ke folder **workspace** Anda (bawaan `~/ContentCreator`), dependensi,
browser render, model transkripsi, key ElevenLabs (`elevenlabs onboard`), voice default, dan (opsional) Google Drive.
Tanpa Claude Code, setup bisa dijalankan langsung: `bash bin/setup.sh ~/ContentCreator`.

## Pakai
Buka Claude Code di folder mana pun, lalu:
```
/content-creator buatkan video 45 detik tentang ...
```
Agent menanyakan hal yang perlu (tujuan, penonton, hook, CTA, rasa visual, rasa suara, brand pojok), menunjukkan contoh
frame + audisi suara, meminta persetujuan naskah sebelum memakai kredit, lalu memproduksi sampai `Result/<brand>/<nama>/`.

Perintah mesin (dari `<workspace>/Engine`): `npm run check`, `voice`, `render`, `mg4`, `html`, `sound`, `qa`, `posting`,
`export`, `drive`, `voices`, `selftest`. Rincian: [engine/README.md](engine/README.md).

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
