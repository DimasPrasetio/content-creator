# Changelog

## 0.11.4
Unggah TikTok kini **tanpa jendela browser** (headless) secara bawaan, atas permintaan pengguna.
- Browser tersembunyi memakai Chrome yang sama dengan identitas Chrome biasa (bukan "HeadlessChrome"), jadi TikTok
  melihat browser yang sama dengan mode berjendela. Diuji latihan di akun brand asli: formulir, sampul khusus, dan
  interaksi terisi tanpa CAPTCHA.
- `--jendela` = browser terlihat. `--headless` lama tetap diterima (sama dengan bawaan). Login tetap lewat jendela.
- CAPTCHA tidak pernah ditembus: di mode tersembunyi unggahan berhenti sebelum Post (`alasan: "captcha"`, pesan
  menyarankan `--jendela`); di mode jendela unggahan menunggu pengguna menyelesaikannya (5 menit).
- Selftest: CAPTCHA di halaman tiruan → batal dengan saran `--jendela`.

## 0.11.3
Video TikTok **wajib bersampul khusus** (permintaan pengguna: tidak boleh tayang tanpa thumbnail yang disiapkan).
- `thumbnail.jpg` tidak ada atau tidak terbaca → `npm run tiktok` menolak sebelum membuka browser.
- Sampul gagal terpasang di editor "Edit cover" → unggahan dibatalkan sebelum Post (`alasan: "sampul"` di
  `tiktok.json`, tangkapan `posting/tiktok-gagal.png`); pengaman kedua di langkah Post. Latihan juga gagal bila sampul
  tidak terpasang.
- Selftest: tanpa thumbnail ditolak, sampul gagal (halaman tiruan menolak Save) tidak diposting.

## 0.11.2
Sampul & interaksi TikTok mengikuti tampilan TikTok Studio terbaru (diperiksa di akun asli tanpa memposting).
- Sampul khusus (`thumbnail.jpg`) kini terpasang lewat editor "Edit cover" (unggah gambar -> Save). Bila gagal,
  unggahan tetap jalan dengan sampul bawaan dan catatannya muncul di keluaran + `tiktok.json` (`sampul`).
- Komentar & "Reuse of content" (pengganti Duet/Stitch) disetel setelah membuka "Show more"; yang tidak tersedia
  (reuse untuk video > 60 detik) dilewati dengan catatan. Hasilnya tercatat di `tiktok.json` (`interaksi`).
- Halaman tiruan selftest mengikuti tata letak baru (editor sampul, kotak centang Comment/Reuse of content).

## 0.11.1
Hasil uji unggah TikTok sungguhan pertama (akun brand, 2026-11-23).
- Popup TikTok yang muncul setelah video terunggah ("Turn on automatic content checks?", tooltip "New editing features
  added") menghalangi klik dan menggagalkan unggahan. Kini ditutup otomatis sebelum/sesudah setiap langkah formulir,
  selalu dengan tombol penolak (Cancel/Got it/Not now): pengaturan akun tidak diubah. Halaman tiruan selftest ikut
  memunculkan popup itu.
- Caption TikTok paling banyak **5 tagar** (tagar ke-6 dst. dibuang, tagar ganda dihitung sekali); `caption.txt`
  untuk platform lain tetap utuh.
- Diketahui: sampul khusus (`thumbnail.jpg`) dan sakelar komentar/duet/stitch belum terpasang di tampilan TikTok
  terbaru (unggahan tetap jalan memakai sampul frame & pengaturan bawaan akun); diperbaiki di rilis berikut.

## 0.11.0
Unggah otomatis ke TikTok (opsional), setelah video disetujui pengguna.
- `npm run tiktok -- <nama> --sekarang | --jadwal="YYYY-MM-DD HH:MM"` (jam WIB, 20 menit-10 hari, dibulatkan 5 menit):
  video dari `Result/<brand>/<nama>/`, caption dari `caption.txt` (tagar diketik apa adanya, tidak diganti saran TikTok),
  sampul `thumbnail.jpg`, komentar/duet/stitch dari `Brands/<slug>/profile.json` → `"tiktok"`. Riwayat di
  `Projects/<nama>/tiktok.json`; video yang sama tidak diunggah dua kali (kecuali `--ulang`).
- **Satu akun per brand**: `npm run tiktok -- login <brand>` membuka jendela browser, pengguna login sendiri (QR dari
  aplikasi TikTok paling mudah; cadangan `--cookies=<cookies.txt>`). Login disimpan sebagai profil browser di
  `~/.config/content-creator/tiktok/<brand>/` (di luar repo & workspace, tidak ikut `brand pack`); `status`, `logout`.
  `"akun": "@handle"` di profil brand = pengaman salah akun. `npm run akun` menampilkan status login TikTok per brand.
- **Label konten AI** otomatis bila proyek memakai gambar/video Higgsfield; gagal dicentang → unggahan dibatalkan.
- `--cek` (tanpa browser), `--latihan` (formulir terisi tanpa klik Post), `--privat` (hanya saya, untuk akun uji).
- Memakai [tiktok-uploader](https://github.com/wkaisertexas/tiktok-uploader) 1.2.0 (MIT, dipatok di setup) dengan
  profil browser kita; cetakan cookie pustaka dibungkam, keluaran berisi "cookie" disaring. Robot browser **tidak resmi**:
  bisa rusak saat TikTok mengubah tampilan web, dan akun bisa dibatasi.
- Selftest bagian 11 (tanpa jaringan & akun): halaman TikTok tiruan lokal menguji login impor cookie, cek, latihan,
  unggah, label AI, tolak unggah ganda, logout. `npm run selftest -- --only=tiktok`.
- Bukan lingkup: API resmi TikTok, Instagram/YouTube, unggah massal, melewati CAPTCHA.

## 0.10.0
Tahap keempat roadmap (`docs/ROADMAP.md`, gelombang kedua "jenis footage baru"): rekaman layar/tutorial + vlog/montase.
- **Rekaman layar / tutorial** (style **Layar**, 16:9): `npm run edit -- <nama> --new --style=layar --input=layar.mp4
  [,wajah.mp4 --facecam=2] [--idle=cepat|buang|utuh] [--narasi=ai]`. Layar dinormalisasi pada resolusi asli (maks 4K,
  tanpa grading/crop); `--analyze` mengukur perubahan piksel per area.
  - **Zoom otomatis** ke bagian yang berubah (maks 2x, tahan ≥ 2 dtk, transisi halus), koreksi per kalimat
    `"zoom": [x, y, w, h] | "penuh" | "auto"`. Kanvas 9:16/4:5/1:1: layar di area antara brand pojok dan subtitle.
  - **Loading/diam** (ditanya per video): dipercepat 2-12x dengan label "dipercepat Nx" (bawaan), dibuang, atau utuh;
    per kalimat `"after"`.
  - **Kamera wajah** bulat di pojok, disinkron otomatis dari suara, dipotong persegi di sekitar wajah.
  - **Layar bisu + voice over AI** (`--narasi=ai`): naskah → `npm run voice` → layar mengikuti kalimat (`screenAuto` dari
    aktivitas, koreksi `"screen"`), dipercepat atau ditahan agar pas dengan kalimatnya.
- **Vlog / montase** (style **Kilas**, 9:16): `npm run edit -- <nama> --new --style=kilas --input=a.mp4,b.mov,...
  [--music=lagu.mp3] [--duration=30] [--narasi=ai]`.
  - **Momen terbaik** per klip (skor tajam + gerak + wajah per detik), tanpa berulang; disimpan di `montage.shots` untuk
    diperiksa di board dan dikoreksi (`"auto": false`). Urutan `urut` (kronologis) atau `selang`.
  - **Potongan pada ketukan musik** (deteksi tempo; 2-4 ketukan per potongan, pembuka lebih lambat) atau 1,5-3 dtk per
    kalimat voice over AI. Ken Burns pelan, grading hangat (`whiteBalance: "warm"`).
  - Musik: file pengguna (`--music`), ElevenLabs (`npm run music -- <nama> --sec=N`), atau sintetis. Montase tanpa
    narasi: musik penuh, QA suara/sinkron dilewati.
- **Vlog bicara + B-roll**: `--broll=a.mp4,b.mov` (style edit apa pun) → momen terbaik B-roll di konteks.md, dipakai
  sebagai objek `clip`; `--music=` = musik latar di-duck di bawah suara untuk jenis apa pun.
- `edit.json` baru: `kind`, `narasi`, `screen`, `facecam`, `idle`, `zoom`, `titles`, `broll`, `music`, `order`, `montage`;
  per kalimat `zoom`, `after`, `screen`, `clips`. `--duration=N` → rentang N±5 dtk.
- Selftest bagian 10 (rekaman buatan, tanpa kredit): zoom ikut area aktif, loading dipercepat/dibuang, layar 9:16,
  sinkron kamera wajah, layar + voice over, montase pada ketukan 120 BPM, montase + voice over, vlog + B-roll + musik.
  `npm run selftest -- --only=layar|montase`.
- Bukan lingkup: merekam layar dari dalam plugin, kursor buatan, posting otomatis.

## 0.9.0
Tahap ketiga roadmap (`docs/ROADMAP.md`, gelombang pertama "jenis footage baru"): podcast/wawancara + klip pendek.
- **Podcast / wawancara 2-4 orang** lewat mesin edit: `npm run edit -- <nama> --new --style=siniar --speakers=N
  --input=lebar.mp4[,kamA.mp4,...] [--multicam --audio-src=N]`. Satu kamera lebar, kamera per orang, atau rekaman online.
- **Pembicara per kata**: ElevenLabs Scribe dengan diarisasi; cadangan lokal tanpa kredit (sidik suara resemblyzer +
  pengelompokan). Kalimat dipecah saat pembicara berganti; koreksi per kalimat lewat `"speaker"`.
- **Multikamera**: kamera disinkronkan otomatis dari suara (korelasi selubung energi, akurat ±1 frame);
  bagian di luar rekaman suatu kamera memakai footage suara.
- **Kursi di rekaman lebar**: posisi tiap orang (YuNet + KMeans) dan gerak mulut per kursi; pasangan pembicara ↔
  kamera/kursi ditebak otomatis (`speakers[].auto`), bisa ditimpa `cam` / `seat` / `box`. Potongan dekat maks ±2,4x.
- **Kamera selalu pada yang bicara**: pindah bila giliran ≥ `pace.minTurnSec` dan bidikan sebelumnya ≥
  `pace.minShotSec` (atau giliran baru itu panjang); tanpa layar terbagi. **Nama pembicara** (lower-third) saat
  pertama tampil.
- **Style Siniar** (`siniar`): 16:9, grading netral, tanpa subtitle tertanam dan SFX, jeda alami antar-kalimat,
  rentang 2 mnt-2 jam. Analisis footage panjang lebih hemat (5 fps, lembar kontak dibatasi), audio panjang dikirim
  terkompresi ke Speech to Text. `--analyze --estimate` = perkiraan menit transkrip sebelum memakai kuota.
- **Klip pendek otomatis** `npm run clips`: kandidat 30-60 dtk berperingkat (pembuka kuat, akhir tuntas, padat, angka,
  dialog) → agent mengusulkan 3-5 di `klip.json` → pengguna memilih → `--make` membuat proyek anak 9:16 (style klip
  bawaan Ngobrol) yang memakai footage induk sebagian (`sources[].range`) tanpa salin dan tanpa transkrip ulang.
- `edit.json` baru: `speakers`, `multicam`, `audio`, `wide`, `sources[].offset/range/from`, `subtitle`, `names`,
  `duration`; footage podcast yang sudah sesuai bentuk kanvas dinormalisasi sampai 2160p.
- Selftest bagian 9 (rekaman buatan, tanpa kredit): sinkron kamera, urutan pembicara, kamera ikut pembicara, nama,
  diarisasi lokal ≥ 90%, kandidat klip, klip 9:16. `npm run selftest -- --only=podcast`.
- Belum (v0.10): rekaman layar/tutorial, vlog/montase.

## 0.8.0
Tahap kedua roadmap (`docs/ROADMAP.md`): kanvas fleksibel + video panjang.
- **Kanvas asli 9:16, 16:9, 4:5, 1:1** untuk jalur HTML (kit standar) dan edit footage, bukan sekadar ekspor dengan sisi
  blur. `npm run new -- <nama> --format=16:9` / `npm run edit -- <nama> --new --format=16:9` mencatat `"format"`;
  render, preview, cek tata letak, QA, posting, thumbnail, subtitle ditanam, cek layar kosong, dan ekspor membaca ukuran
  dari sana. Komik (Pop) dan mg4 tetap 9:16 + ekspor.
- **Zona aman per format** (`FORMATS` di `scripts/lib.mjs`): 9:16 tetap zona TikTok/Reels; 16:9 margin 5% YouTube;
  4:5 dan 1:1 margin 54 px. Brand pojok, label, progress bar, dan subtitle ikut ditata per format.
- Kit HTML: `KIT_GEO` per format dan `ZONE` (lebar zona visual); `scenes.js` lama tampil di tengah tanpa diubah, scene
  baru boleh memakai lebar penuh. 9:16 tidak berubah sama sekali.
- Edit footage: footage dipotong mengikuti wajah sesuai bentuk kanvas; objek grafis, PiP, kartu, dan subtitle ditata
  ulang untuk landscape/persegi (16:9: objek di sisi yang berlawanan dengan wajah).
- **Bab opsional, ditanyakan per video**: `tanpa` (bawaan) · `label` · `kartu`. Animasi: `> bab: Judul` di naskah +
  `--bab=`; edit: `"chapter"` per kalimat + `"bab"`. Label bab, tanda bab di progress bar, kartu judul bab, dan
  `preview/bab-NN.png`.
- **YouTube**: thumbnail 1280×720 untuk video 16:9 (teks kiri, visual kanan, pojok durasi dikosongkan), deskripsi dengan
  blok `Bab:` bertimestamp otomatis bila bab memenuhi syarat YouTube (≥ 3, mulai 0:00, tiap bab ≥ 10 dtk), batas
  5000 huruf dan 15 hashtag, subtitle SRT per baris lebih panjang.
- `npm run export` dari kanvas mana pun: video 16:9 → `--format=9x16,4x5,1x1` (video utuh di tengah, latar blur).
- Selftest menambah HTML 16:9 dengan bab (preview, render, QA, posting YouTube), contoh 4:5 dan 1:1, edit footage 16:9,
  dan syarat bab YouTube.

## 0.7.1
- Setup dari plugin terpasang berhenti di "Result/README.md: No such file": file itu tertahan `.gitignore` template
  sehingga tidak ikut rilis. Kini ikut dipublikasikan, dan setup melewati README template yang tidak ada.

## 0.7.0
Tahap pertama roadmap "content creator lengkap" (`docs/ROADMAP.md`).
- **Style lepas dari brand.** Style = rasa video (jalur & skill, tema huruf/palet/subtitle/glow/progress, musik, aturan
  edit, `STYLE.md`, `selera.md`, `examples/`); brand = identitas + suara (nama, brand pojok, logo/watermark, warna brand,
  CTA, penutup, kamus, voice, style bawaan sebagai rekomendasi). Brand mana pun dan jenis video apa pun boleh memakai
  style mana pun; opsi `warna`: `brand` atau `style`.
- `npm run style -- list | show | new | save | selera`: daftar style (bawaan plugin + `Styles/<slug>/` milik pengguna,
  dengan alias), buat style baru atau turunan (`--dari`), **simpan video yang sudah jadi sebagai style bernama**
  (identitas brand tidak ikut), dan catat selera per style.
- Style bawaan berganti nama mudah diingat: `narration` → **Ngobrol** (alias lama tetap jalan), baru **Komik** (jalur Pop).
- Tema kit HTML disusun bertingkat: kit < style < identitas brand (< warna brand bila `warna: brand`).
  `npm run new -- <nama> --style=<style> [--warna=brand|style]`; tanpa `--style` dipakai style bawaan brand; tanpa style
  sama sekali perilaku lama (tema brand utuh) tetap berlaku. Thumbnail mengikuti style proyek. Profil brand: `style`
  menggantikan `visual` (`npm run brand -- new <slug> --style=<style>`; `visual.style` lama dibaca lewat alias).
- Grill-me baru: **jenis pekerjaan → format → style → brand → sisanya**, jujur tentang yang sudah didukung
  (landscape/video panjang menyusul di v0.8; podcast, rekaman layar, vlog di v0.9).
- **Setup terpandu**: `npm run akun` (status ElevenLabs, Higgsfield, Google Drive, skill/whisper opsional + perintah
  langkah berikutnya, `--json` untuk skill setup; tidak pernah menampilkan key). `/content-creator:setup` memandu akun
  satu per satu dan login selalu dilakukan pengguna sendiri. Setup di Linux/WSL yang dijalankan di terminal meminta
  password sudo sekali; README folder workspace kini ikut diperbarui.
- **Windows lewat WSL2**: `docs/WINDOWS.md`; setup mendeteksi WSL, memasang `wslu` agar login terbuka di browser
  Windows, dan memperingatkan workspace di `/mnt/c`.
- Higgsfield di komputer yang belum pernah login kini dilaporkan "belum login" (sebelumnya "workspace belum dipilih").
- Selftest menguji gabungan tema style, `style list/save/selera`, `new` dengan style bawaan brand, dan alias `narration`.

## 0.6.1
- Higgsfield (diuji dengan akun sungguhan): akun dengan satu workspace dipilih otomatis setelah login (sebelumnya
  "No workspace selected" dikira belum login); lebih dari satu workspace → instruksi `higgsfield workspace list/set`.
- Status menampilkan paket dari `subscription_plan_type`; `gen --yes` berhenti bila status akun tidak terbaca.

## 0.6.0
- **Aset AI Higgsfield** (`npm run gen`): gambar, klip video, dan audio dari model Higgsfield lewat CLI resmi
  `higgsfield` (OAuth `higgsfield auth login`, tanpa API key di workspace). `Projects/<nama>/gen.json` → perkiraan kredit
  gratis (`--estimate`), generate hanya dengan `--yes`, berhenti bila melewati `budget` proyek atau kredit akun, cache per
  hash (model + prompt + parameter + isi media), hasil `assets/gen/<id>.<ext>` + `manifest.json` (job, kredit, ukuran),
  peringatan bila bukan 9:16 dan pengingat label konten AI. `--status`, `--models`.
- Setup memasang CLI Higgsfield 1.2.3 (rilis GitHub, SHA-256 dipatok; tanpa alias `hf`). Opsi `--with-higgsfield-mcp`
  mendaftarkan MCP Higgsfield (`https://mcp.higgsfield.ai/mcp`, scope user) untuk Claude Code. `npm run check` menampilkan
  status login, paket, dan kredit (informasi saja).
- Edit footage: objek **`clip`** (B-roll video, mis. klip AI): `fit: full` cutaway layar penuh di bawah PiP/objek/subtitle,
  atau `fit: card`; ditranskode 30 fps tanpa suara, waktu tampil dipotong ke panjang klip.
- Jalur C: server render melayani `Projects/<nama>/assets/` di `/assets/...` dan mendukung HTTP Range, jadi `<video>` di
  halaman bisa di-seek frame-tepat; render menunggu setiap video selesai mencari frame.
- Render edit footage menyesuaikan RAM: cache OffthreadVideo maks 1 GB (≤ RAM/8), konkurensi 1-2 di mesin < 7 GB
  (sebelumnya compositor bisa SIGKILL di VPS 4 GB saat ada dua sumber video).
- Skill: cabang grill-me "Aset AI" (batas kredit disepakati di awal), bagian "Aset AI dengan Higgsfield", larangan
  (tanpa batas kredit, orang nyata, testimoni palsu, teks di prompt). Selftest menguji `gen` + `clip` dengan CLI tiruan.

## 0.5.1
- **Cek istilah sebelum voice** (`npm run istilah -- <nama>`): setiap singkatan di narasi (IPO, AOL, SOP, ...) wajib
  punya cara baca di kamus `pronounce` (plugin < `config.local.json` < profil brand). Tanpa itu `voice` berhenti
  **sebelum kredit terpakai**; `produce --draft` sudah menampilkannya lebih awal. Laporan memuat kalimat konteks dan
  usulan ejaan Inggris / Indonesia / dibaca sebagai kata (tabel nama huruf dari ejaan yang divalidasi pengguna).
  Lewati hanya dengan `--skip-istilah` (atau otomatis untuk `--audio`).
- Skill: langkah **Daftar istilah** di tahap naskah — pahami arti istilah dalam kalimat → bahasa asal → ejaan; tabel
  `istilah · arti · bahasa · ejaan` di brief; ejaan tervalidasi disalin ke `config.local.json` agar sama di semua brand.
- Kamus bawaan: `AI` = "é-ai" (menggantikan "E Ai" yang ditolak), `IT` = "ay-tee", `IPO` = "ay-pi-o".
- Voice: scene yang berakhir koma tidak lagi dibacakan sebagai ",." (kalimat bersambung antar-scene).
- Tema: `watermark.size` (px, bawaan 36) untuk watermark pojok yang lebih kecil; thumbnail ikut diskalakan.

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
