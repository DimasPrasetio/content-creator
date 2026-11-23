# Engine

Mesin pembuat video motion graphic (**30 fps**). Kanvas bawaan **1080×1920** (Reels/TikTok); jalur HTML dan edit footage juga
langsung dalam **16:9 1920×1080, 4:5 1080×1350, 1:1 1080×1080** (`"format"` di storyboard / `edit.json`, ukuran & zona
aman di `FORMATS` pada `scripts/lib.mjs`). Bab opsional (`> bab:` di naskah, `"bab": "label"|"kartu"`) ikut ke deskripsi YouTube.
Dibangun dengan [Remotion](https://www.remotion.dev) (komposisi Pop), skill motion-graphics-v4 (canvas), halaman HTML motion-graphics-skills (Playwright), ElevenLabs SDK `@elevenlabs/elevenlabs-js` (voice over) + ffmpeg. VoiceStudio lokal hanya cadangan.

Alur: `Projects/<nama>/script.md` → suara `Projects/<nama>/voice.wav` (+ `work/<nama>/timing.json`) → visual → SFX → `Result/<brand>/<nama>/` (video, thumbnail, caption)

## Perintah

Jalankan dari folder `Engine/`.

| Perintah | Fungsi |
| --- | --- |
| `npm run check` | Cek kesiapan: folder project, ffmpeg, ElevenLabs (key dari `.env.local`, sisa kuota, voice default) atau VoiceStudio, mesin motion-graphics-v4, referensi narator, venv analisis, whisper (opsional), browser render |
| `npm run akun` | Status akun & layanan (ElevenLabs, Higgsfield, Google Drive, TikTok, skill/whisper opsional) + perintah langkah berikutnya; `--json` untuk skill setup. Tidak pernah menampilkan key |
| `npm run voice -- <nama>` | Buat voice over + sinkron kata. Default ElevenLabs dari `Projects/<nama>/script.txt` (dengan tag ekspresi). Opsi: `--voice=<nama\|id>`, `--profile=<slug>`, `--provider=voicestudio`, `--force` (buat ulang suara, memakai kredit lagi) |
| `npm run voice -- <nama> --audio=<file>` | Pakai voice over yang sudah jadi dari luar (mis. ElevenLabs mp3): TTS dilewati, audio hanya diseragamkan (mono 44,1 kHz, -16 LUFS, tanpa sisipan jeda) lalu disinkronkan per kata. Tag ekspresi seperti `[laugh]` tidak ditulis di naskah |
| `npm run render -- <nama> --preview` | (Pop) 1 gambar per scene ke `Projects/<nama>/preview/` untuk cek visual (cepat). Tambah `--draft` untuk contoh frame dari naskah saja (timing perkiraan, tanpa suara) ke `preview/draft/` |
| `npm run voices` | Audisi voice ElevenLabs: daftar voice akun + preview gratis. `--library [--gender= --use= --search=]` cari voice Indonesia di Voice Library; `--sample=A,B --text="hook"` audisi kalimat asli (memakai kredit); `--add=<owner>:<id>:<Nama>` tambah ke akun + config (ubah akun, minta izin) |
| `npm run render -- <nama>` | (Pop) render video akhir ke `Result/<brand>/<nama>/<nama>.mp4` |
| `npm run html -- <nama>` | (HTML motion-graphics-skills) render `Projects/<nama>/html/index.html` (`window.seek`) + suara → `Result/<brand>/<nama>/<nama>.mp4` dengan brand pojok. `--preview` 1 PNG per scene ke `preview/`, `--preview --draft` dari naskah saja. Render paralel 4 browser + GPU (`--workers=N`, `--no-gpu` = SwiftShader persis versi lama; gagal → otomatis 1 worker) |
| `npm run style -- list\|show\|new\|save\|selera` | **Style** = rasa video, lepas dari brand: daftar, isi, buat (kosong / `--dari=` style lain), simpan proyek jadi style bernama, catat selera (`Styles/<slug>/selera.md`). Format: `template/Styles/README.md` di plugin / `Styles/README.md` di workspace |
| `npm run new -- <nama> [--style=<style>] [--warna=brand\|style] [--brand=slug]` | Proyek jalur C dari **kit HTML standar** (`kit/html/`) + tema style + identitas `Brands/<slug>/theme.json` → `html/theme.js`, kit, kerangka `scenes.js` & `storyboard.json` dari jumlah scene naskah. Per video cukup menulis `scenes.js`. `--refresh-kit` salin ulang kit + tema. Komponen & aturan timing: `kit/html/README.md` |
| `npm run produce -- <nama>` | Produksi satu perintah jalur C: voice → cek kata pemicu animasi (`cue`) → sound → preview + `board.png` → render → QA ‖ posting, keluaran ringkas + waktu per tahap (±1 menit). `--draft` contoh frame tanpa kredit, `--from=` / `--stop-after=` tahap, `cover.at: "auto"` = thumbnail akhir hook |
| `npm run mg4 -- <nama>` | (Motion graphics v4) render dengan skill motion-graphics-v4: scenes.json dari timing suara, selfcheck + contact sheet, brand pojok → `Result/<brand>/<nama>/<nama>.mp4`. Opsi `--only=4,6` (revisi scene), `--finish` (tempel ulang brand saja), `--draft --style=a,b [--scenes=1,2] [--palette=json] [--brand=json]` (contoh frame gaya dari naskah, tanpa suara → `Projects/<nama>/preview/draft/gaya-*.png` + `pilihan-gaya.png`) |
| `npm run sound -- <nama>` | (Pop, mg4, html) musik + SFX sintetis dicampur dengan narasi → `work/<nama>/mix.wav`; render otomatis memakainya |
| `npm run qa -- <nama>` | QA otomatis: format, loudness, konsistensi suara, ekspresi & kejelasan, pelafalan istilah, sinkron, tata letak visual [8]. Wajib lolos sebelum diserahkan |
| `npm run thumbnail -- <nama> [--pick=N]` | Sampul khusus (bukan frame video) dari `Projects/<nama>/posting/thumbnail.json`: 1-4 varian (disarankan 3) dengan pemicu psikologis berbeda (penasaran, takut-rugi/larangan, angka, tantangan, kontras), dirender dari tema brand (`kit/thumb/thumb.html`) dengan potongan frame video atau gambar aset. Cek: headline 2-6 kata, angka harus diucapkan di video, klaim mutlak (dijamin, gratis, 100%, ...) harus ada di naskah/brief, headline ≥ 100 px, pita aman y 300-1500, stiker tidak menimpa teks. Keluaran: `thumbnail.jpg` (varian `pick`), `posting/thumb-N.jpg`, `thumb-pilihan.jpg`, `thumb-grid.jpg` (simulasi grid profil 3:4). Dipanggil otomatis oleh `posting` bila `thumbnail.json` ada |
| `npm run posting -- <nama>` | Paket siap posting: `thumbnail.jpg` (sampul khusus dari `thumbnail.json`, atau frame video bila tidak ada / `--cover=<detik>`) + `caption.txt` (dari `Projects/<nama>/posting/caption.md` yang divalidasi: hook ≤ 125 huruf, ≤ 2200 huruf, 3-10 hashtag) ke `Result/<brand>/<nama>/`; subtitle SRT/VTT + cover-grid 4:5 ke `Projects/<nama>/posting/`. `--burn [--y=1300]` subtitle ditanam → `<nama>.sub.mp4` |
| `npm run export -- <nama>` | Format lain: `--format=4x5,1x1,16x9`, `--mode=auto\|crop\|fit` (auto memotong hanya bila semua teks dari `layout.json` muat; kalau tidak, video utuh dikecilkan dengan sisi blur). Video dengan kanvas lain (mis. 16:9): `--format=9x16,4x5,1x1` (bawaan 9x16), video utuh di tengah dengan latar blur |
| `npm run compress -- <nama>` | Kompres ulang hasil yang sudah jadi (mis. render lama CRF 18 yang membengkak): capped CRF sesuai setelan `encode`, atau `--target=50MB` (two-pass, ukuran pas). `--crf= --maxrate=` timpa sekali jalan, `--all` ikut varian `.4x5/.16x9/.sub`, `--file=<mp4>` untuk file mana pun. Versi lama ke `versions/`; hasil yang tidak lebih kecil diabaikan |
| `npm run music -- <nama> --prompt="..." --yes` | Musik instrumental ElevenLabs sepanjang voice over (atau `--sec=N` untuk montase tanpa narasi) → `work/<nama>/music.wav`, dipakai `npm run sound` (memakai kredit) |
| `npm run gen -- <nama> --estimate` / `--yes` | **Aset AI Higgsfield** (opsional, memakai kredit Higgsfield) dari `Projects/<nama>/gen.json` lewat CLI `higgsfield` (login sekali: `higgsfield auth login`). `--estimate` gratis; `--yes` membuat aset bila total + yang sudah terpakai ≤ `budget` dan ≤ kredit akun → `assets/gen/<id>.<ext>` + `manifest.json`, cache per hash. `--only=id,id`, `--force`, `--budget=N`; `--status` akun & kredit, `--models [--video\|--image\|--audio]`. Dipakai di edit footage (objek `clip`), jalur C (`/assets/gen/...`), thumbnail (`visual.image`) |
| `npm run edit -- <nama> --new\|--analyze\|--draft` | **Edit footage** berbasis style (talking-head; podcast 2-4 orang dengan `--style=siniar --speakers=N [--multicam --audio-src=N]`; rekaman layar/tutorial `--style=layar [--facecam=N] [--idle=cepat\|buang\|utuh] [--narasi=ai]`; vlog/montase `--style=kilas [--music=file] [--duration=N] [--narasi=ai]`; B-roll `--broll=a.mp4,b.mp4`). `--analyze --estimate` = perkiraan menit Speech to Text (gratis). Format & objek: `styles/README.md` |
| `npm run clips -- <nama>` | **Klip pendek** dari proyek edit yang sudah dianalisis: kandidat berperingkat (`klip/kandidat.md`) → agent menulis `klip.json` → `--check` → `--make=k1,k3 [--render]` = proyek anak `<nama>-k1` 9:16 (footage induk sebagian, tanpa kredit). `--min= --max=` detik |
| `npm run sfxkit -- --yes` | Kit SFX natural ElevenLabs → `public/sfx/eleven/`; aktif dengan `config.json` → `"sound": {"sfxKit": "eleven"}` (memakai kredit) |
| `npm run drive -- <nama>` | Unggah hasil yang **disetujui** ke Google Drive `<folder tujuan>/<brand>/<nama>/` lewat rclone (remote `gdrive`, root = `config.local.json` → `drive.rootFolderId`); file sama dilewati, yang berubah ditimpa, isi dicek md5, link dicatat di `Projects/<nama>/drive.json`. `--manifest` = cadangan lewat konektor (maks 10 MB per file). Persiapan sekali: `brew install rclone` + `rclone config create gdrive drive scope=drive root_folder_id=<id>` (login Google di browser) |
| `npm run tiktok -- <nama> --sekarang \| --jadwal="YYYY-MM-DD HH:MM"` | Unggah hasil yang **disetujui** ke akun TikTok brand video (`Result/<brand>/`): caption dari `caption.txt`, sampul **wajib** `thumbnail.jpg` (tidak ada / gagal terpasang = batal), maksimal 5 tagar, jadwal jam WIB (20 menit-10 hari, dibulatkan 5 menit), label konten AI otomatis bila proyek memakai gambar/video Higgsfield (`--label-ai=ya\|tidak`). `--cek` = periksa tanpa browser; `--latihan` = isi formulir tanpa klik Post; `--privat` = hanya saya; `--file=` format lain; `--ulang`; browser tersembunyi (headless) secara bawaan, `--jendela` = browser terlihat (CAPTCHA: mode tersembunyi berhenti, mode jendela menunggu pengguna menyelesaikannya). Riwayat: `Projects/<nama>/tiktok.json`. Login per brand oleh pengguna sendiri: `npm run tiktok -- login <brand>` (jendela browser; cadangan `--cookies=<cookies.txt>`), `status`, `logout <brand>`; tersimpan di `~/.config/content-creator/tiktok/<brand>/` (di luar workspace, tidak pernah dicetak). Pengaturan brand: `profile.json` → `"tiktok": {"comment", "duet", "stitch", "akun": "@handle"}`. Memakai tiktok-uploader 1.2.0 (robot browser tidak resmi) |
| `npm run selftest` | Uji alur utuh tanpa kredit (contoh frame, suara, musik, HTML, QA, posting, ekspor, versi, edit footage, podcast multikamera + klip, rekaman layar + montase; `--only=podcast\|layar\|montase` bagian itu saja). `--full` + mg4 & Pop; `--real-voice` suara ElevenLabs sungguhan (±120 karakter kredit) |
| `npm run studio` | Buka Remotion Studio untuk melihat animasi secara langsung |
| `npm run typecheck` | Cek tipe TypeScript |

`<nama>` = nama folder di `Projects/`, mis. `20261103-01-contoh-target-tim` (path `../Projects/<nama>` juga diterima).

Suara disimpan di `work/<nama>/cache/`, jadi teks yang tidak berubah tidak dibuat ulang (dan tidak memakai kredit ElevenLabs lagi).

## ElevenLabs (default)

- **API key** di `.env.local` di root project, dibuat oleh `npx -y @elevenlabs/cli@latest onboard init` (masuk `.gitignore`). Dibaca otomatis oleh `scripts/lib.mjs`; SDK mengambil `ELEVENLABS_API_KEY` dari environment. Jangan dibuka, dicetak, atau ditulis di tempat lain. Verifikasi: `npx -y @elevenlabs/cli@latest onboard check --env-path .env.local` (dari root).
- **SDK**: `scripts/eleven.mjs` membungkus `@elevenlabs/elevenlabs-js` (kuota, text-to-speech ke file, deteksi error paket).
- **Pengaturan** di `config.json` → `elevenlabs`: `voice` (bawaan `George`, voice premade; atur voice workspace di `config.local.json`), `voices` (nama → voice_id), `model` (`eleven_v4`), `languageCode` (`id`), `stability` 0.7, `similarityBoost` 0.5, `outputFormat`, `pronounce` (pakai kamus pelafalan, default `true`), `seed`; `speed`/`style`/`speakerBoost` hanya untuk model v2/v3 (Eleven v4 mengabaikannya: tempo & emosi lewat tanda baca dan tag).
- **Per video**: frontmatter naskah `voice: Finn`, `model: eleven_v3`, `stability: 0.5`, `provider: voicestudio`; atau argumen `--voice=` / `--provider=`.
- **Teks**: seluruh `Projects/<nama>/script.txt` dibacakan satu voice (dipotong per paragraf hanya bila melewati batas karakter model, dengan request stitching `previousText`/`nextText`). Tag ekspresi (`[excited]`, `[sigh]`, ...) dipakai model v3/v4 dan dibuang untuk model lain. Sinkron kata tetap memakai teks `.md`.
- **Kuota** dicek sebelum generate; bila tidak cukup, proses berhenti tanpa memakai kredit. Jeda `> jeda:` tetap disisipkan.
- **Paket free** hanya boleh voice *premade* (Sarah, Jessica, Laura, Matilda, Liam, Will, Chris, Brian; aksen Inggris). Voice library (termasuk voice berbahasa Indonesia dari Voice Library) butuh paket berbayar (min. Starter).
- **Konsistensi suara**: seed tetap (`elevenlabs.seed`), profil brand `Brands/<slug>/profile.json` (frontmatter `profile:`; lihat `Brands/README.md`), dan jangkar suara: pemakaian pertama voice+model menyimpan 20 dtk pertama ke `voices/elevenlabs/anchor/<voice>-<model>.wav`. QA [3] membandingkan tiap scene dengan jangkar itu, minimal 0,86 (`elevenlabs.anchorMin`). Hasil uji: voice yang sama di video berbeda ≈ 0,91; voice lain 0,72-0,83.
- Audio voice-only dibatasi -1 dBFS (`alimiter ... level=false`; tanpa `level=false` ffmpeg menaikkan lagi ke 0 dBFS).

VoiceStudio (cadangan, opsional, aplikasi lokal macOS) harus terbuka bila dipakai: `open -a VoiceStudio`; referensi narator `voices/narator-ekspresif.wav` + `.txt` disediakan sendiri oleh workspace.

## Persiapan (sekali)

```bash
cd Engine && npm install
uv venv .venv --python 3.12 --python-preference only-managed
uv pip install --python .venv/bin/python numpy soundfile scipy librosa webrtcvad-wheels "setuptools<81" playwright pillow
uv pip install --python .venv/bin/python --no-deps resemblyzer
# opsional: uv pip install --python .venv/bin/python faster-whisper==1.2.1   (+ model, lihat di bawah)
.venv/bin/python -m playwright install chromium   # untuk motion-graphics-v4 dan jalur HTML
# key ElevenLabs (dari root project): npx -y @elevenlabs/cli@latest onboard init
```

Whisper opsional: `bin/setup.sh --with-whisper` memasang faster-whisper + model `deepdml/faster-whisper-large-v3-turbo-ct2`
(±1,8 GB) untuk QA kejelasan kata gratis, sinkron offline, dan VoiceStudio.

## Ukuran file (encode)

Semua jalur (Pop, mg4, HTML, ekspor, subtitle ditanam) mengenkode hasil akhir **sekali** dengan *capped CRF*:
kualitas dijaga CRF, bitrate dibatasi `maxrate`, sehingga efek grain/noise tidak membuat file membengkak. TikTok/Reels
mengompres ulang setiap unggahan, jadi bitrate di atas ±8 Mbps tidak menambah ketajaman di aplikasi.

```json
"encode": { "crf": 23, "maxrate": "8M", "preset": "slow", "audioBitrate": "192k" }
```
Bawaan di `config.json`; bisa ditimpa di `config.local.json`, profil brand (`"encode"`), atau storyboard (`"encode"`).
Perkiraan: video bergrain ±30-60 MB/menit, video bersih beberapa MB/menit. Lebih kecil lagi: `crf` 26 + `maxrate` 6M
(grain jadi lebih halus, teks tetap tajam). QA [1] menandai video yang melewati `maxrate`; perbaiki dengan `npm run compress`.
Hasil selalu H.264 yuv420p rentang standar (tv), 30 fps, AAC.

## Cara suara dibuat

- **Satu narator, konsisten**: semua suara dikloning dari `voices/narator-ekspresif.wav` (+ teksnya `.txt`). Kloning meniru *cara bicara* referensi, jadi referensinya sengaja dipilih yang ekspresif (variasi nada 3,5 semitone). Referensi datar = hasil datar.
- **Kualitas & ekspresi** (`config.json` → `tts`): `num_step` 32 (lebih bersih dari 16), `class_temperature` 0.8 + `position_temperature` 8 (variasi intonasi), `effect_preset` `raw` (tanpa kompresi ganda; loudness diatur pipeline).
- **Per paragraf, ambil take terbaik**: narasi dibagi blok ±18 detik; tiap blok dibuat `takes` kali (default 2) dan take dengan skor tertinggi dipakai (kejelasan kata, kemiripan suara, variasi nada).
- **Pelafalan** (`config.json` → `pronounce`, ditimpa `config.local.json` lalu profil brand): mis. `"IPO": "ay-pi-o"`. Hanya mengubah teks yang dibacakan; tulisan di layar tetap "IPO". **Cek istilah** (`npm run istilah -- <nama>`, otomatis di `produce --draft` dan sebelum `voice`): setiap singkatan di narasi wajib punya cara baca; tanpa itu voice berhenti sebelum kredit terpakai. Putuskan dari arti istilah dalam kalimat → bahasa asal (Inggris: nama huruf Inggris; Indonesia: nama huruf Indonesia; dibaca sebagai kata: petakan ke dirinya sendiri) → ejaan; ragu → audisi.
- **Gaya** (`> gaya: pelan` di scene): suara natural yang sama dengan volume sedikit lebih rendah, untuk kalimat sampingan. Bisikan sintetis tidak dipakai karena terdengar seperti mesin.
- **Emosi lewat naskah**: tanda seru, tanda tanya, jeda `...`, dan interjeksi (Nah, Eh, Iya, beneran!) paling berpengaruh pada intonasi.
- **Sinkron**: waktu per kata dicocokkan ke naskah; scene & elemen visual muncul saat katanya diucapkan. Sumber waktu
  (`config.json` → `sync`, frontmatter `sync:`, atau `--sync=`): `auto` (bawaan) = timestamps ElevenLabs yang ikut dikirim
  bersama suara (gratis) → whisper lokal bila terpasang → forced alignment ElevenLabs (tarif Speech to Text, untuk cache
  lama/audio luar). `eleven` / `whisper` memaksa salah satu. Audio luar boleh disertai `<file>.align.json` (`[{w,s,e}]`).
  Bila whisper salah mengeja istilah, tambahkan ke `config.json` → `asrAlias` (tidak dipakai untuk sumber ElevenLabs).
- **QA kejelasan kata** (`npm run qa -- <nama> --asr=auto|whisper|eleven|off`, atau `config.json` → `qa.asr`): `auto` =
  whisper bila terpasang, selain itu dilewati; `eleven` = Speech to Text ElevenLabs (Scribe, memakai kuota STT).

Batas yang perlu diketahui: hanya engine OmniVoice yang mendukung bahasa Indonesia, dan ia tidak punya kontrol emosi langsung. Untuk suara paling natural, ganti referensi narator dengan **rekaman manusia asli** 10-20 detik yang ekspresif (dengan izin pemilik suara): simpan sebagai `voices/narator-ekspresif.wav` + transkripnya di `.txt`.

## Storyboard

Tiap video punya `Projects/<nama>/storyboard.json` yang menentukan tampilan tiap scene, urut sesuai scene di naskah.
Scene tanpa storyboard otomatis memakai `kinetic` (teks muncul kata per kata). Tema `dark`/`cream` bergantian otomatis kecuali diatur.

| `type` | Isi | Properti |
| --- | --- | --- |
| `headline` | Judul besar + stiker | `pre`, `title` (`\n` = baris baru), `post`, `sticker`, `badge`+`icon` |
| `kinetic` | Teks muncul per kata | `text` (default: narasi), `highlight` (kata yang dibesarkan) |
| `checklist` | Kartu centang/silang | `intro`, `items[{text, ok}]`, `caption`, `sticker` |
| `compare` | Bar progres | `intro`, `bars[{label, value, color: gold/red}]`, `sticker` |
| `cards` | Dua kartu sebab-akibat | `a{icon,title,sub}`, `b{...}`, `items`, `sticker` |
| `hierarchy` | Diagram organisasi | `pre`, `title`, `post`, `levels` (mis. `[1,3,9]`), `bad`, `sticker` |
| `stat` | Angka besar menghitung naik | `pre`, `value`, `suffix`, `label`, `down`, `sticker` |
| `cta` | Kartu ajakan penutup | `title`, `line`, `handle`, `image` (di `public/`) |
| `tools` | Daftar pilihan, satu di-highlight emas, lainnya meredup | `intro`, `items[{name, sub, highlight}]`, `sticker` |
| `image` | Gambar dengan gerak kamera zoom/pan | `src` (di `public/`), `imgW`, `imgH`, `from`/`to` `{cx, cy, zoom}` (piksel gambar asli, zoom 1 = utuh), `box{x,y,w,h}` (sorotan merah berdenyut), `pre`, `caption`, `sticker` |

Ikon: `check x target key crown rocket globe heartbreak down user bulb alert trend spark clock money team flag`.

**Sinkron elemen**: setiap elemen muncul saat teksnya diucapkan. Bila tulisan di layar berbeda dari yang diucapkan, beri `cue` berisi kata di narasi, mis. item `{"text": "Secure", "cue": "aman"}`. Properti cue lain: `preCue`, `stickerCue`, `captionCue`, `treeCue` (diagram), `cue` di scene `image` = saat kamera mulai bergerak. Elemen tanpa cue yang cocok memakai waktu bawaan.

Semua scene bisa diberi `"theme": "dark"` atau `"cream"`. Konten otomatis berada di area aman Reels/TikTok (bawah ±460 px dan atas ±340 px dikosongkan dari konten penting).

## Komposisi Pop (gaya pop cinematic)

Komposisi kedua (`src/pop/`) untuk video bergaya iklan pop: latar navy, aksen kuning, merah untuk impact; shading core-shadow, cahaya bermotif, grain + vignette, tipografi ekstrusi, transisi grafis, impact kit, dan waktu ter-posterize 8 fps di scene dramatis. Dipilih dengan `"composition": "Pop"` di storyboard.

Storyboard Pop berisi daftar scene ber-`key` (`S1`…`S18`, komponen di `src/pop/scenes.tsx`; video lain bisa menambah scene baru di sana):

```json
{ "composition": "Pop", "brand": {"left": "...", "right": "..."},
  "scenes": [ { "key": "S1", "poster": true, "trans": "slash", "music": "full",
                "sfx": [ { "cue": "AI", "type": "impact", "offset": 0, "gain": 1 } ] } ] }
```

- `trans` (transisi masuk scene): `slash`, `shutter`, `iris`, `flash` (riser + boom), `cut` (record scratch), `none`.
- `poster`: waktu dipatah 8 fps + grain berat + "line boil" (pakai untuk 2-3 scene dramatis saja).
- `music`: `full`, `build` (pad + bass pelan), `pad` (scene tenang; hanya pad pelan, tidak pernah hening mati), `off`.
- `sfx`: `whoosh riser boom scratch impact pop boing stamp ding click tape ticks typing sparkle`, dipicu kata narasi.

Alur: `voice` → `sound` → `render --preview` → `render` → `qa`.

## Motion graphics v4 (skill `motion-graphics-v4`)

Mesin kedua untuk video explainer: skill `.claude/skills/motion-graphics-v4/` (canvas + Chromium Playwright, 5 gaya: `kinetic-type`, `clay-pop`, `chrome-y2k`, `crt-terminal`, `blueprint-lab`; contoh di `samples/`). Dipilih dengan `"composition": "mg4"`:

```json
{ "composition": "mg4", "style": "kinetic-type", "palette": {}, "brand": {"left": "...", "right": "..."},
  "scenes": [ { "lines": ["Target tim kamu", "meleset terus?"], "key": "meleset", "layout": null,
                "music": "full", "sfx": [ { "cue": "meleset", "type": "impact" } ] } ] }
```

- Satu entri per scene suara. Waktu diambil otomatis dari `work/<nama>/timing.json`; `sentence` = narasi scene.
- Aturan skill: ≤ 6 kata per baris, 1-3 baris, kata asli narasi (urut), satu `key`, scene ≥ 1,5 dtk, tanpa logo/angka karangan di frame.
- Alur: `voice` → `sound` → `mg4` → lihat `Projects/<nama>/preview/checks_vN/` + `contact_vN.png` → `mg4 --only=N` untuk revisi → `qa`.
- Brand pojok ditempel setelah render (`scripts/brand_png.py`, chip gelap di y 52-114, logo dari `public/brand/`).
- Butuh `playwright` + `pillow` di `.venv` dan Chromium Playwright (`.venv/bin/python -m playwright install chromium`).

**Jeda napas**: `> jeda: 0.5` di scene naskah menyisipkan hening setelah scene itu (berlaku untuk semua komposisi). Pakai setelah punchline supaya visual pukulannya sempat terlihat.

## Cek tata letak otomatis

`src/probe/measure.js` mengukur setiap teks yang terlihat (opasitas efektif ≥ 0,3) di frame preview, relatif ke kanvas video (bawaan 1080×1920), memakai pita huruf (±0,74 em) dan memotongnya dengan wadah `overflow`. Komposisi Remotion memanggilnya lewat `<LayoutProbe/>` (aktif saat `--preview`; menunggu semua `delayRender` lain termasuk font, lalu melapor lewat log browser), jalur HTML lewat `html_render.py`. Hasil: `Projects/<nama>/preview/layout.json` dengan `errors` (keluar bingkai, terpotong > 4%, menabrak brand pojok `data-probe="brand"`, teks atau brand di luar zona aman TikTok x 60–940 · y 220–1440) dan `warns` (x < 60, tumpang tindih > 25%), plus `band` (pita teks, dipakai `export`). Elemen dekoratif yang sengaja keluar bingkai: `data-probe="ignore"`. Zona aman TikTok sejak v0.4.1: atas 220 px (tab + ikon cari), kanan 140 px (kolom tombol), bawah 480 px (nama akun, caption, musik). Format lain (v0.8) memakai `safe` format itu: 16:9 x 96–1824 · y 54–1026 (margin 5% YouTube), 4:5 dan 1:1 margin 54 px.

## Jalur HTML (motion-graphics-skills)

Skill `launch-video`, `vox-explainer`, `apple-launch-film`, `animated-chart`, `milestone-reveal`, `motion-effects`,
`title-sequence-3d`, `newsletter-promo` (di `.claude/skills/`) menghasilkan satu `Projects/<nama>/html/index.html`.
`npm run html` menggantikan HyperFrames:

- Halaman disajikan server lokal; `/vendor/<paket>/...` = `Engine/node_modules` (mis. `/vendor/three/build/three.module.js`, Three.js terpasang). Tidak ada yang dimuat dari internet.
- Disisipkan sebelum halaman jalan: `window.__TIMING__ = {fps, total, draft, scenes:[{index, start, end, text, words:[{w, s, e}]}]}` (detik, dari voice over atau perkiraan `--draft`), `window.__BRAND__`, `window.__RENDER__ = true`. URL memakai `?render`.
- Tiap frame: `await window.seek(t)` → screenshot JPEG → H.264 yuv420p 30 fps + audio (mix bila ada) → brand pojok → `Result/<brand>/<nama>/<nama>.mp4`. Error JavaScript di halaman dilaporkan dan membuat proses keluar dengan kode 2.
- WebGL jalan lewat SwiftShader (headless). Uji: 55,8 dtk video dirender ±2 menit 40 detik.
- Storyboard: `{"composition": "html", "skill": "launch-video", "brand": {...}, "brandOverlay": true, "scenes": [{"music": "full", "sfx": [...]}]}`.

## Struktur

```
<workspace>/
  Projects/<nama>/   brief.md, script.md, script.txt, storyboard.json, voice.wav, preview/, html/, assets/
  Brands/<slug>/     profile.json, brand.md, MOTION.md, logo/, examples/   (+ Brands/_selera.md)
  References/        contoh gaya
  Result/<brand>/<nama>/  hasil jadi saja: <nama>.mp4, thumbnail.jpg, caption.txt (brand dari profile: / brand pojok, atau umum)
  .env.local         ELEVENLABS_API_KEY (dari `elevenlabs onboard`; jangan dibuka/dibagikan)
  Engine/
    src/             komposisi Remotion: "Video" (Main, scenes, components, theme) dan "Pop" (src/pop);
                     src/pop/custom/ = scene khusus video/brand milik workspace (dimuat otomatis, tidak ditimpa update)
    scripts/         lib.mjs (path & env), eleven.mjs (SDK ElevenLabs), voice.mjs, voices.mjs, render.mjs, mg4.mjs,
                     html.mjs + html_render.py, sound.py, qa.mjs, check.mjs, audio_tools.py, brand_png.py, board_png.py
    public/          aset statis: sfx/, pop/, media/; audio/ dan brand/ disalin otomatis saat render
    voices/          (milik workspace) narator VoiceStudio opsional + elevenlabs/anchor/ (jangkar konsistensi suara; jangan dihapus)
    config.json      bawaan plugin: provider, ElevenLabs (model, pengaturan, seed), kamus pelafalan, gaya suara
    config.local.json  milik workspace (tidak ditimpa update): voice default & daftar voice, folder Drive, kamus tambahan
    work/<nama>/     OTOMATIS: timing.json, mix.wav, cache/, mg4/, mg4-draft/, html-raw.mp4 (aman dihapus;
                     menghapus cache berarti suara dibuat ulang dan memakai kredit)
    work/_voice-preview/  unduhan audisi voice
    src/probe/       cek tata letak (measure.js + LayoutProbe.tsx)
```
