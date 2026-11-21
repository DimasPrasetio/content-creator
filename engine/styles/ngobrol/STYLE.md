# Style: Ngobrol (`ngobrol`, dulu `narration`, bawaan plugin)

Gaya edit **talking-head edukatif**: satu orang bicara ke kamera (A-roll), dipotong rapat, diselingi panel motion
graphic hijau gelap (B-roll) yang menjelaskan apa yang sedang diucapkan, dengan subtitle per kata dan color grading
*muted cinematic*. Angka di bawah diukur dari video acuan bergaya ini; mesin mengejarnya lewat `style.json`.
Format rencana & objek: `../README.md`. Salin ke `Styles/ngobrol/` di workspace untuk menyesuaikan.

## 1. Struktur & ritme

| Ukuran | Nilai terukur | Aturan style |
|---|---|---|
| Durasi | 73 dtk isi | 45-90 dtk |
| Tempo bicara | **3,14 kata/dtk** (narasi biasa ±2,5) | jeda dipangkas sampai bicara terasa ±3 kata/dtk |
| Jeda antar kata | median **0,04 dtk**, p90 0,16, maks 0,56 | jeda > 0,15 dtk dipotong (sisakan 0,04-0,08) |
| Jump cut di A-roll | ±2,7 · 6,2 · 22,9 · 35,8 · 36,8 · 45,4 · 46,7 · 47,6 · 51,6 · 54,7 dtk | potong tiap **2-5 dtk** (di batas kalimat atau ambil ulang) |
| Porsi A-roll / B-roll | ±63% / **37%** | B-roll 30-40% |
| Panjang B-roll | 2,0 · 2,0 · 6,2 · 5,0 · 3,8 · 5,2 · 1,2 · 1,9 dtk | 1,5-6,5 dtk per sisipan |
| Perubahan visual | elemen grafis baru tiap ±1,5-2 dtk | tidak ada > 2 dtk tanpa gerak/elemen baru |

**Pola alur umum:** hook + judul seri (0-4 dtk) → CTA singkat follow/simpan → masalah/keinginan → langkah-langkah
(tiap langkah = B-roll atau objek melayang) → hasil/manfaat → teaser + CTA penutup.

---

## 2. A-roll (kamera)

- **Framing**: medium close-up, satu orang, sedikit di bawah tengah, ruang kepala kecil. Latar ruangan netral
  (dinding putih, kursi) **buram** (depth of field sempit dari lensa, bukan efek). Mic shotgun terlihat di frame.
- **Punch-in**: setiap jump cut berganti skala, kira-kira **100% ↔ 115-130%**, kadang posisi wajah digeser ke kiri/kanan
  sepertiga. Fungsi: menyamarkan jump cut dan memberi penekanan.
- **Bingkai fokus**: empat sudut putih tipis (±2 px, panjang ±20% sisi) mengelilingi wajah saat kata penting
  .
- **Objek melayang di atas A-roll**: kartu/chip/mockup ditempel di sisi badan atau di depan dada, tidak menutup wajah.

## 3. B-roll (panel motion graphic)

- **Latar**: hijau gelap dengan gradasi radial: tengah `#0D2E29`, tepi `#0B2320` (vignette lembut), pola **titik
  halus** samar. Tidak ada foto.
- **Avatar PiP**: lingkaran ±180 px (layar 576 lebar → **±340 px di 1080**) berisi klip pembicara yang terus berjalan,
  cincin putih ±4 px, di **kiri atas**. Penonton tetap melihat wajah saat B-roll.
- **Objek utama**: kartu dokumen putih, mockup HP berisi UI chat, kartu prompt, bubble file. Masuk dengan pop/slide
  singkat, isi muncul bertahap sesuai kata yang diucapkan.
- **Transisi A↔B**: **potongan keras** (tidak ada whoosh/zoom transisi); di penutup A-roll diredupkan ±50% dan diberi
  tint hijau sebelum teks besar muncul.

## 4. Tipografi & teks layar

| Elemen | Font | Warna | Ukuran (di 1080 lebar) | Posisi | Gerak |
|---|---|---|---|---|---|
| **Kicker** ("part 2", "isinya", "bisa jadi") | Caveat (tulisan tangan), miring alami | putih ±85% | ±55-65 px | di atas judul | muncul lebih dulu, fade/tulis |
| **Judul kecil** ("tutorial", "lo bikin", "gue bakal") | Poppins Bold | putih | ±60-70 px | kiri atas / tengah | pop |
| **Kata kunci kotak** ("GRATIS", "BRAND KIT", "PELAJARIN") | Poppins ExtraBold/Black, KAPITAL | teks teal `#0A5A58` di kotak `#E3E9E9` | ±100-120 px | kiri atas, di bawah kicker | **wipe kiri→kanan + blur** saat katanya diucapkan |
| **Kata besar tanpa kotak** ("GUE", "BONGKAR") | Poppins Black | putih | ±120-200 px | tengah | pop/scale |
| **Chip label** ("tulisan ↗", "ada wajah gue ✓") | Poppins SemiBold | teks gelap di chip `#E3E9E9`, ikon teal | ±40-50 px | menunjuk objek | pop kecil |
| **Subtitle** | Poppins Bold | putih + bayangan gelap; **kata aktif teal** dengan garis putih | ±60 px | bawah tengah | per kata (karaoke), 2-5 kata per potongan |


**Zona aman**: banyak video bergaya ini menaruh subtitle di y ±1610 (dari 1920), di dalam area yang tertutup caption
TikTok. Style ini memakai **zona aman v0.4.1**: subtitle y 1244-1414, teks lain x 60-940 · y 220-1440.

## 5. Color grading (A-roll), terukur

Diukur dari 12 frame A-roll pada area netral (dinding putih, lantai gelap), kulit, dan statistik seluruh frame.

| Aspek | Terukur | Arti |
|---|---|---|
| Titik hitam | lantai/bayangan **`#1F1F1E` (L\* ±12)**, luma p1 **0,077** | hitam **diangkat** (matte), tidak pernah hitam pekat |
| Highlight | dinding putih tercatat **`#878989`-`#8D908F` (L\* 57-59)** | highlight **ditekan keras**: putih jadi abu terang, tidak ada area putih terbakar |
| Luma tengah | median **0,25-0,35** | **low-key**, cenderung gelap |
| Kontras | rentang luma 0,08-0,58 (tanpa teks overlay) | **rendah, lembut** |
| Saturasi | rata-rata SATAVG **8,8** (skala 0-±128), saturasi frame 0,20-0,37 | **desaturasi** ±25-35% |
| White balance | dinding a\* −0,7…+0,6, b\* −0,3…+3,6 | **netral**, sangat sedikit hangat di sisi lampu |
| Bayangan | a\* ±0, b\* +0,7…+3 | netral sedikit hangat (bukan teal-orange) |
| Kulit | RGB **±(126, 98, 87)**, L\* 43-46, chroma **±14,5**, hue **±47°** | kulit **hangat alami tapi kalem**; tidak oranye |
| Merah pakaian | tetap terbaca merah bata, tidak menyala | merah ikut diturunkan |
| Vignette | sudut/tengah 0,56-0,96 (bergantung latar) | vignette tipis |
| Ketajaman | lembut, tanpa sharpening berlebih | — |

**Resep (titik awal, dikalibrasi otomatis ke angka di atas pada footage pertama):**
```
curves=all='0/0.075 0.20/0.17 0.50/0.40 0.80/0.60 1/0.72',   # angkat hitam, tekan highlight, low-key
eq=saturation=0.72:gamma=1.0,                                 # desaturasi global
hue=s=1,                                                      # (cadangan) tanpa geser hue
vignette=angle=PI/5:mode=forward                              # vignette tipis
```
Karena tiap kamera, lensa, dan lampu berbeda, grading **tidak memakai LUT tetap**. Mesin mengukur footage mentah lalu
mencari kurva/saturasi yang membawa statistiknya ke target ini: hitam L\* ±12, putih L\* ±58, median luma ±0,30, chroma
kulit ±14, white balance netral.

## 6. Audio

| Aspek | Terukur | Aturan |
|---|---|---|
| Loudness | **−15,1 LUFS**, LRA 5,6 LU, puncak −1,6 dBFS | −15 LUFS, kompresi ringan (LRA 5-7) |
| Musik latar | celah antar kata **−40…−45 dBFS** (hening) | **tanpa musik** (suara saja); opsional pad sangat pelan ≤ −30 dB di bawah suara |
| SFX | tidak ada lonjakan konsisten di pergantian A↔B | **tanpa whoosh**; boleh pop/klik halus ≤ −24 dB saat kartu muncul |
| Suara | bersih, mic shotgun dekat, sedikit ruang | noise reduction ringan, de-ess, EQ hangat |

## 7. Yang tetap vs yang mengikuti konteks

Topik, footage, dan pembicara akan selalu berbeda. Style ini hanya mengunci **identitas** (cara bercerita, tampilan,
rasa), sedangkan **isi visual diputuskan dari konteks tiap video**.

| Tetap (identitas style) | Mengikuti konteks video |
|---|---|
| tempo ±3 kata/dtk, jeda ≤ 0,15 dtk, jump cut 2-5 dtk | kalimat mana yang dibuang (salah ucap, ulangan, kata pengisi) |
| porsi B-roll 30-40%, panjang 1,5-6,5 dtk | kalimat mana yang jadi B-roll dan objek apa yang tampil |
| palet, font, gaya kotak kata kunci, subtitle per kata | kata mana yang jadi kata kunci, kicker, chip, kutipan |
| target grading (hitam L\* 12, putih L\* 58, desaturasi, kulit hangat-kalem) | koreksi per klip agar mencapai target (lampu/kamera beda) |
| loudness −15 LUFS, tanpa musik | tingkat pembersihan suara (sesuai noise footage) |
| zona aman, PiP kiri atas | posisi objek melayang (tidak menutup wajah/tangan yang bergerak) |

### Tata bahasa visual: maksud kalimat → visual
Agent membaca transkrip, menentukan **maksud tiap kalimat**, lalu memilih visual dari tabel ini (bukan dari kata
kunci mentah):

| Maksud kalimat | Visual |
|---|---|
| hook / judul seri | A-roll + kicker + tumpukan judul, satu kata nilai di kotak, bingkai fokus |
| CTA (follow, simpan, link) | B-roll singkat mockup HP + tombol; penutup: HP berisi klip pembicara |
| masalah / keinginan / opini / emosi | A-roll punch-in + kata kunci kotak atau kata besar |
| menunjuk bagian tubuh/benda di frame | anotasi chip berpanah ke posisi **nyata** (deteksi wajah/objek) |
| penanda langkah ("pertama", "lalu", "terakhir") | B-roll + avatar PiP, kicker urutan |
| menyebut alat/aplikasi/berkas | kartu UI generik (dokumen, chat, berkas) atau tangkapan layar asli dari pengguna; ikon generik, bukan logo resmi |
| daftar (A, B, apapun) | chip bertumpuk, muncul per item tepat saat diucapkan |
| kutipan / prompt / kalimat yang harus ditiru | kartu prompt diketik huruf per huruf |
| dialog / proses bolak-balik | chat HP bergantian kiri-kanan |
| angka / data | angka besar menghitung / bar sederhana (hanya angka yang diucapkan) |
| perbandingan / sebelum-sesudah | dua kartu berdampingan / kontras redup-terang |
| hasil / manfaat / payoff | punch-in kuat + kartu hasil |
| teaser / penutup | A-roll diredupkan + tint, kata besar |

Bila topik butuh visual di luar tabel (mis. resep, produk fisik), agent memakai komponen terdekat (kartu, chip,
angka) dengan aset dari pengguna, atau membuat komponen baru dengan palet & font style ini.

### Pemahaman konteks (dikerjakan agent, dibantu alat)
1. **Isi**: transkrip per kata → topik, jenis video, penonton, struktur (hook/masalah/langkah/hasil/CTA), entitas,
   klaim & angka. **Glosarium** mengoreksi salah dengar dari konteks (uji: ASR mendengar "taruh ke *cloud*", padahal
   konteksnya daftar AI → "Claude").
2. **Footage**: frame per shot dilihat agent; alat mengukur posisi & ukuran wajah per frame, gerak tangan (area yang
   tidak boleh ditutup objek), cahaya & white balance per klip, noise suara, ambil ulang (kalimat mirip berulang).
3. **Rencana edit** (`edit.json`): satu entri per kalimat berisi maksud, keputusan (buang/A-roll/B-roll), visual,
   kata kunci, dan **alasan**. Mesin hanya mengeksekusi rencana ini.
4. **Pengecekan**: teks layar = kata yang diucapkan, elemen muncul tepat pada katanya, objek tidak menutup wajah,
   porsi B-roll & tempo sesuai style, tidak ada layar diam > 2 dtk, angka/klaim sesuai ucapan, grading mencapai target.


## 8. Aturan edit (untuk mesin)

1. Transkripsi per kata → buang jeda > 0,15 dtk, kata pengisi ("eh", "em", "anu"), dan kalimat yang diulang (ambil
   yang terakhir/terbaik).
2. Jump cut minimal tiap 5 dtk; tiap potongan berganti skala punch-in (100/118/128%) dan posisi.
3. Tiap kalimat yang menyebut **objek/langkah** → B-roll (panel hijau + avatar PiP) atau objek melayang di A-roll.
   Kalimat emosi/opini → tetap A-roll dengan kata kunci kotak.
4. Teks layar = kata yang diucapkan (atau ringkasannya ≤ 3 kata), muncul **tepat saat katanya diucapkan**.
5. Satu kata kunci kotak per kalimat; kicker tulisan tangan di atasnya.
6. Grading A-roll sesuai §5; B-roll tidak di-grade (warna grafis sudah final).
7. CTA "follow + save" di detik 4-6 dan penutup "tungguin konten selanjutnya".

## 9. Bahan yang dibutuhkan dari pengguna

- Footage A-roll vertikal (atau horizontal ≥ 1080p, nanti dipotong), suara jelas.
- Gambar/tangkapan layar asli bila ada (mis. UI aplikasi yang dibahas).
- Logo/handle untuk penutup. Warna & font grafis memakai palet style ini (lihat `style.json`), atau palet brand bila
  diminta.
