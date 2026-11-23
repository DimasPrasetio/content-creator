# Roadmap: dari "pembuat video animasi" ke content creator lengkap

Disepakati lewat grill-me pada 2026-11-21 (jawaban pengguna dikutip apa adanya):

| Cabang | Keputusan |
|---|---|
| Jenis footage | "Talking-head / bicara ke kamera, Podcast / wawancara 2+ orang, Rekaman layar / tutorial, Vlog / montase B-roll + musik" |
| Video panjang | "YouTube 5-20 menit, Podcast / webinar 30-90 menit, Explainer animasi landscape, Presentasi / kelas online" |
| Rilis | "Bertahap" |
| Style vs brand | "Style = rasa, brand = identitas" |
| Voice | "Ikut brand" |
| Sumber style | "Dari video referensi, Dari video yang sudah jadi, Dari obrolan + contoh frame, Dari gambar / moodboard / website" |
| Gaya lama | "jadikan style bernama, namun gunakan nama yang mudah diingat dan di hafal" |
| Windows | "Lewat WSL2 dipandu" |
| Transkrip | "Otomatis pilih" (whisper lokal bila ada, selain itu ElevenLabs dengan perkiraan biaya) |
| Ringkasan | "Sepakat, jalankan" |

## Tahapan

### v0.7 · Style lepas dari brand + setup terpandu (selesai, 0.7.1)
- **Style** (`Styles/<slug>/` di workspace, bawaan di `engine/styles/<slug>/`) = rasa: jalur & skill, tema (huruf, palet
  bawaan, subtitle, glow, sorotan, progress, label), tempo, musik/SFX, grading & aturan edit, `STYLE.md` (cara menyusun),
  `selera.md` (riwayat selera per style), `examples/`. Opsi `warna`: `brand` (pakai warna brand bila ada) atau `style`.
- **Brand** (`Brands/<slug>/`) = identitas: nama, brand pojok, logo/watermark, warna brand, CTA, penutup, kamus
  pelafalan, **voice**, style bawaan (rekomendasi, bukan kunci).
- Style bisa dipakai brand mana pun dan jenis video apa pun; dibuat dari video referensi, video yang sudah jadi
  (`npm run style -- save`), obrolan + contoh frame, atau gambar/moodboard/website.
- Gaya lama → style bernama mudah diingat: **Papan Tulis**, **Bara**, **Arsip**, **Komik**, **Ngobrol** (Papan Tulis,
  Bara, Arsip tetap di workspace pengguna; Komik & Ngobrol ikut plugin).
- Grill-me baru: jenis pekerjaan → format → style → brand → sisanya.
- Setup: `npm run akun` (status & langkah login ElevenLabs, Higgsfield, Google Drive), skill setup memandu satu per satu;
  panduan Windows lewat WSL2.

### v0.8 · Kanvas fleksibel + video panjang (selesai, 0.8.0)
- Kanvas 16:9 / 9:16 / 4:5 / 1:1 di semua jalur animasi dan edit (bukan sekadar ekspor dengan sisi blur), zona aman per
  platform.
- Video panjang 2-20 menit: bab (chapter), thumbnail YouTube 1280×720, deskripsi + timestamp; explainer & kelas online landscape.

Kesepakatan v0.8 (grill-me 2026-11-21): jalur yang dibuat asli multi-format = "HTML + edit footage" (Komik/Pop & mg4 tetap
9:16 + ekspor); bab: "bisa jadi videonya bukan bab bab seperti itu yang di butuhkan user nanti, atau ada user yang tidak
mau seperti bab bab seperti itu" → bab opsional, ditanyakan per video (tanpa / label / kartu + label), timestamp deskripsi
hanya bila ada bab; edit talking-head landscape panjang: "Masuk v0.8"; ringkasan: "Sepakat, jalankan".

### v0.9 · Podcast/wawancara + klip pendek otomatis (selesai, 0.9.0)
- Rekaman 2-4 pembicara: satu kamera lebar (crop ke yang bicara), kamera per orang (diselaraskan lewat suara), rekaman
  Zoom/Meet. Hasil: episode penuh 16:9 yang rapi (jeda mati & salah ucap dibuang, kamera selalu pada satu orang yang
  bicara dengan jeda minimal, nama pembicara, bab opsional) + klip pendek 9:16.
- Video panjang mana pun → AI mengusulkan 3-5 klip 30-60 dtk (hook, alasan, durasi), pengguna memilih, lalu dirender.

Kesepakatan v0.9 (grill-me 2026-11-21): rilis "Dua gelombang"; bentuk rekaman "Satu kamera lebar, Kamera per orang,
Rekaman online (Zoom/Meet)"; klip "AI usulkan, Anda pilih"; hasil "Episode penuh + klip"; saling menimpali "Selalu satu
orang"; durasi klip "30-60 detik"; uji "Pakai rekaman buatan saja"; pembicara "Sampai 4 orang"; ringkasan "Sepakat, jalankan".

### v0.10 · Rekaman layar + vlog/montase (selesai, 0.10.0)
- Rekaman layar / tutorial (style Layar): suara sendiri, + kamera wajah, atau layar bisu + voice over AI; zoom otomatis ke
  area yang berubah (bisa dikoreksi), loading dipercepat dengan label / dibuang / utuh (ditanya per video).
- Vlog / montase (style Kilas): AI memilih momen terbaik tiap klip, potongan pada ketukan musik (file pengguna,
  ElevenLabs, atau sintetis; ditanya per video), atau per kalimat voice over AI; vlog bicara + B-roll + musik latar.

Kesepakatan v0.10 (grill-me 2026-11-21): rekaman layar "Layar + suara sendiri, Layar + kamera wajah, Layar bisu + voice
over AI"; vlog "Montase musik, Vlog bicara + B-roll, Montase + voice over AI"; musik "Keduanya, ditanya per video"; zoom
"Otomatis, bisa dikoreksi"; momen montase "AI pilih, saya periksa board"; uji "Rekaman buatan saja"; loading/diam
"Ditanya per video"; format "Ditanya per video"; ringkasan "Sepakat, jalankan".

### v0.11 · Unggah TikTok (selesai, 0.11.0)
- `npm run tiktok`: video yang disetujui diunggah ke akun TikTok brand-nya (tayang sekarang / dijadwalkan WIB, sampul =
  thumbnail, label konten AI otomatis), lewat tiktok-uploader (robot browser tidak resmi); login per brand oleh pengguna
  sendiri di jendela browser; uji tanpa jaringan dengan halaman TikTok tiruan.

Kesepakatan v0.11 (grill-me 2026-11-23): jalur "tiktok-uploader dulu" (API resmi menyusul bila perlu); akun "Satu akun
per brand"; tayang "Ditanya per video"; login "Jendela login sendiri" (cadangan cookies.txt); uji "Akun TikTok uji";
label AI "Saya tambahkan sendiri" (gagal dicentang → unggah manual); ringkasan "Sepakat, jalankan".

Bukan lingkup: setup Windows asli tanpa WSL, API resmi TikTok, posting otomatis ke Instagram/YouTube, unggah massal,
melewati CAPTCHA.
