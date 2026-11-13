# Panduan setup content-creator

Panduan ini untuk orang yang baru memasang plugin, baik sendiri maupun sebagai anggota tim. Waktu yang dibutuhkan
±15-30 menit, sebagian besar menunggu unduhan.

## Ringkasan

| Langkah | Siapa | Otomatis? |
|---|---|---|
| 1. Pasang plugin | Anda | 2 perintah di Claude Code |
| 2. `/content-creator:setup` | Claude + skrip | **Ya**: semua komponen pendukung |
| 3. Login ElevenLabs | Anda (klik di browser) | Dipandu |
| 4. Pilih voice default | Anda | Dipandu (audisi gratis) |
| 5. Google Drive (opsional) | Anda (klik di browser) | Dipandu |
| 6. `npm run selftest` | Claude | Ya |

Plugin **tidak pernah** membawa key atau token siapa pun. Semua akses dibuat per orang dan disimpan hanya di komputernya.

## 1. Pasang plugin

Di Claude Code:
```
/plugin marketplace add DimasPrasetio/content-creator
/plugin install content-creator@content-creator
```

## 2. Jalankan setup

```
/content-creator:setup
```
Claude menanyakan lokasi workspace (bawaan `~/ContentCreator`), lalu menjalankan `bin/setup.sh`, yang **memasang sendiri**
semua yang belum ada:

| Komponen | Dipakai untuk | Cara dipasang |
|---|---|---|
| Node.js 22 | mesin render & script | Homebrew (macOS) · apt/unduhan resmi nodejs.org (Linux), checksum diverifikasi |
| ffmpeg + libx264 | audio & video | Homebrew · apt · build statis BtbN dari GitHub (Linux), SHA-256 diverifikasi |
| uv + Python 3.12 | analisis suara, motion graphics | Homebrew · installer resmi astral.sh |
| rclone | unggah Google Drive | Homebrew · unduhan resmi rclone.org |
| Paket npm & Python | Remotion, ElevenLabs SDK, Playwright, resemblyzer, dll. | otomatis |
| Chromium (Playwright + Remotion) | render & cek tata letak | otomatis |
| Library sistem Chromium (Linux) | menjalankan browser di server | otomatis bila root / sudo tanpa password |
| *(opsional)* whisper large-v3-turbo (±1,8 GB) | QA kejelasan kata gratis, sinkron offline, VoiceStudio | hanya dengan `--with-whisper` |

Catatan per sistem:
- **macOS**: butuh [Homebrew](https://brew.sh). Bila belum ada, setup berhenti dan menampilkan perintah pemasangannya;
  Homebrew meminta password Mac Anda, jadi langkah itu Anda jalankan sendiri, lalu jalankan setup lagi.
- **Linux (VPS)**: paling mulus bila dijalankan sebagai **root** atau user dengan sudo tanpa password. Tanpa itu, semua
  tetap terpasang di folder pengguna, kecuali library sistem Chromium; setup mencetak satu perintah `sudo` untuk admin.
- Alat yang dipasang ke folder pengguna (`~/.local/share/content-creator/tools`) ditambahkan ke PATH lewat profil shell.
  Buka terminal/sesi baru setelah setup bila perintah `node`/`ffmpeg` belum dikenali.
- Spesifikasi minimum: 4 CPU, 8 GB RAM, disk kosong ±4 GB. GPU tidak diperlukan.
- **Sinkron kata** (visual muncul saat katanya diucapkan) memakai **timestamps ElevenLabs** yang ikut dikirim bersama suara,
  tanpa biaya tambahan, jadi tidak perlu model transkripsi. Whisper lokal hanya tambahan opsional:
  `/content-creator:setup --with-whisper` (atau `bash bin/setup.sh --with-whisper`). Tanpa whisper, QA kejelasan kata
  dilewati kecuali dijalankan `npm run qa -- <nama> --asr=eleven` (Speech to Text ElevenLabs, memakai kuota STT).

Setup aman dijalankan ulang kapan saja (mis. setelah `/plugin update content-creator`): mesin diperbarui, data workspace
tidak disentuh.

## 3. ElevenLabs (wajib, untuk voice over)

1. Buat akun di [elevenlabs.io](https://elevenlabs.io).
2. Dari folder workspace jalankan (Claude bisa menjalankannya untuk Anda):
   ```bash
   npx -y @elevenlabs/cli@latest onboard init
   ```
   Browser terbuka → login → klik **Authorize**. Key dibuat otomatis dan disimpan di `<workspace>/.env.local`.
   **Jangan pernah menempel key ke chat.**
3. Paket: **free** hanya bisa voice *premade* (aksen Inggris). Voice dari Voice Library, termasuk voice berbahasa
   Indonesia, butuh paket berbayar (minimal Starter). Video 45 detik memakai ±700-900 karakter.

Untuk tim dengan **satu akun ElevenLabs bersama**: pemilik akun membuat **satu API key per anggota** di dashboard
ElevenLabs (Developers → API Keys), supaya bisa dicabut per orang. Key dikirim lewat jalur aman (bukan grup chat), lalu
anggota menaruhnya di `<workspace>/.env.local`:
```
ELEVENLABS_API_KEY=sk_...
```

## 4. Voice default

```bash
cd <workspace>/Engine
npm run voices                                   # voice di akun + preview gratis
npm run voices -- --library --gender=male        # cari voice berbahasa Indonesia di Voice Library
npm run voices -- --add=<owner>:<voice_id>:<Nama>   # tambahkan ke akun (paket berbayar)
```
Lalu tulis nama voice di `<workspace>/Engine/config.local.json`:
```json
{ "elevenlabs": { "voice": "NamaVoice", "voices": { "NamaVoice": "<voice_id>" } } }
```
Voice per brand diatur di profil brand (langkah 7) dan menimpa voice default.

## 5. Google Drive (opsional, unggah otomatis setelah video disetujui)

1. Siapkan folder Drive tujuan, lalu salin ID-nya dari URL (`https://drive.google.com/drive/folders/<ID>`).
   Folder milik orang lain? Minta akses **Editor** untuk akun Google Anda.
2. Hubungkan rclone (browser terbuka → login Google → **Allow**):
   ```bash
   rclone config create gdrive drive scope=drive root_folder_id=<ID>
   ```
   Di server tanpa browser: jalankan `rclone authorize "drive"` di komputer yang punya browser, lalu tempel token
   hasilnya saat `rclone config` di server.
3. Isi `<workspace>/Engine/config.local.json`:
   ```json
   { "drive": { "remote": "gdrive", "rootFolderId": "<ID>", "rootName": "Nama Folder" } }
   ```
4. `npm run check` harus menampilkan `Google Drive ... bisa diakses`.

> rclone memakai client ID bersama bawaan yang akan dipensiunkan sepanjang 2026. Untuk pemakaian jangka panjang, buat
> client ID Google sendiri: https://rclone.org/drive/#making-your-own-client-id, lalu jalankan ulang `rclone config`.

## 6. Uji semua jalur

```bash
cd <workspace>/Engine && npm run selftest          # tanpa kredit, ±3 menit
npm run selftest -- --real-voice                   # + suara ElevenLabs sungguhan (±120 karakter)
```

## 7. Profil brand (sendiri atau dibagikan dalam tim)

```bash
npm run brand -- new tokobaju --name="Toko Baju" --left="TOKO BAJU" --voice=NamaVoice
npm run brand -- list
```
Lengkapi `Brands/<slug>/brand.md` + `MOTION.md` lewat skill `brand-intake` (cukup minta ke Claude: "set up my brand").

**Berbagi ke anggota tim** (profil, logo, contoh gaya, dan scene Pop khusus brand; tanpa key/token/video):
```bash
npm run brand -- pack tokobaju --scenes=tokobaju.tsx      # -> Brands/_export/tokobaju.brand.tar.gz
npm run brand -- unpack ~/Downloads/tokobaju.brand.tar.gz # di komputer anggota tim
```
Dengan profil yang sama, video dari siapa pun memakai voice, gaya, dan brand pojok yang sama.

## 8. Jalur visual B (opsional)

Jalur B memakai skill **motion-graphics-v4** milik Anthropic, yang tidak didistribusikan di plugin ini. Bila Anda punya
skill itu, letakkan di `~/.claude/skills/motion-graphics-v4` (atau set variabel `MG4_SKILL` ke foldernya).
Tanpa itu, jalur A (Pop) dan C (HTML) tetap berjalan, dan `npm run check` menandai jalur B sebagai nonaktif.

## Pola tim yang disarankan

| Kebutuhan | Cara |
|---|---|
| Akun ElevenLabs | masing-masing, **atau** satu akun bersama + API key per orang |
| Google Drive | satu folder bersama; tiap anggota diberi akses Editor dan login rclone dengan akunnya sendiri |
| Brand | satu orang membuat profil, lalu `brand pack` → anggota `brand unpack` |
| Plugin | semua memakai versi yang sama: `/plugin update content-creator` lalu `/content-creator:setup` |

## Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| `paid_plan_required` saat membuat suara | voice dari Voice Library di paket free → upgrade atau pakai voice premade |
| `ELEVENLABS_API_KEY belum ada` | jalankan `onboard init` di **folder workspace** (bukan di `Engine/`) |
| render gagal di Linux: library `libnss3`/`libatk` | `sudo <workspace>/Engine/.venv/bin/python -m playwright install-deps chromium` |
| `node`/`ffmpeg` tidak dikenali setelah setup | jalankan `. ~/.config/content-creator/env.sh`, atau buka terminal/sesi Claude Code baru |
| `Tidak ada sumber waktu kata` | audio lama tanpa timestamps & tanpa key/whisper: `npm run voice -- <nama> --force`, atau setup `--with-whisper` |
| Drive `tidak bisa diakses` | akun Google belum punya akses Editor ke folder, atau token kedaluwarsa: `rclone config reconnect gdrive:` |
| Unggah Drive sangat lambat | kecepatan upload koneksi Anda; video ±100 MB di 1 Mbps butuh ±15 menit (VPS jauh lebih cepat) |
| File video terlalu besar (ratusan MB) | render sebelum v0.2.1: `npm run compress -- <nama>` (atau `--target=50MB`); setelan di `config.local.json` → `encode` |
