# Styles: rasa video (bukan per brand)

**Style = rasa, brand = identitas.** Satu folder per style bernama (nama mudah diingat, mis. "Papan Tulis", "Bara",
"Arsip"). Style mengatur **cara bercerita, tata letak, huruf, peran warna, gerak, subtitle, musik, color grading**; brand
(`Brands/<slug>/`) mengatur nama, brand pojok, logo/watermark, warna brand, CTA, penutup, voice. Brand mana pun dan jenis
video apa pun boleh memakai style mana pun. Style bawaan plugin ada di `Engine/styles/<slug>/` (Komik, Ngobrol); folder
ini untuk style milik Anda (menimpa bawaan dengan slug/alias sama).

```
Styles/<slug>/
  style.json      mesin: name, title, aliases, kind (animasi | edit), jalur, skill, warna (brand | style), theme / aturan edit
  STYLE.md        cara menyusun (dibaca agent sebelum mendesain)
  selera.md       riwayat yang disukai/ditolak untuk style ini
  examples/       frame contoh (board, scene, thumbnail)
  reference.mp4   video acuan (opsional; hanya acuan gaya, bukan konten)
```

```bash
npm run style -- list                                         # semua style
npm run style -- show <style>                                 # isi, STYLE.md, selera terakhir
npm run style -- new <slug> --title="Nama" [--dari=<style>]   # style baru (kosong / turunan)
npm run style -- save <proyek> <slug> --title="Nama"          # simpan rasa video yang sudah jadi
npm run style -- selera <style> "<catatan>"                   # catat selera
npm run new -- <nama> --style=<style> [--warna=brand|style]   # pakai di video animasi (jalur HTML)
npm run edit -- <nama> --new --style=<style> --input=<file>   # pakai di edit footage
```

Sumber style baru: video referensi (dibedah), video yang sudah jadi (`save`), obrolan + contoh frame, atau
gambar/moodboard/website. `warna: brand` = warna brand dipakai bila brand punya; `style` = palet style apa adanya.

## Style edit footage (`kind: edit`)

## Prinsip: style mengunci identitas, konteks menentukan isi

Topik, footage, cahaya, dan pembicara selalu berbeda. Karena itu tiap style memisahkan:
- **Tetap**: tempo, ritme potongan, palet, font, gaya teks, target grading, loudness, zona aman.
- **Kontekstual**: kalimat mana dipotong, kalimat mana jadi B-roll, objek apa yang tampil, kata kunci apa, di mana
  objek diletakkan, koreksi warna per klip. Diputuskan agent per video dari **maksud tiap kalimat** lewat tabel
  "tata bahasa visual" di `STYLE.md` style itu.

## Alur edit (`npm run edit`, rincian di `Engine/styles/README.md`)

1. **Penyamaan persepsi** (grill-me, satu-satunya sesi tanya): tujuan video, penonton, style, CTA, nama/istilah
   khusus (glosarium), aset pendukung (tangkapan layar, logo, foto produk).
2. **Ingest**: footage → 30 fps tetap, proxy 1080p, HDR → SDR, transkrip per kata.
3. **Pahami konteks**:
   - *isi*: topik, struktur, entitas, klaim, angka; glosarium memperbaiki salah dengar;
   - *footage*: agent melihat frame tiap shot; alat mengukur wajah & titik bibir per frame, gerak tangan, cahaya dan
     white balance per klip, noise suara, ambil ulang.
4. **Rencana edit** `Projects/<nama>/edit.json`: per kalimat → maksud, buang/A-roll/B-roll, visual, kata kunci,
   alasan.
5. **Render**: potong & susun (ffmpeg) → grading per klip ke target style → lapisan grafis, subtitle, PiP, punch-in
   (Remotion) → audio (bersih, −15 LUFS).
6. **Cek otomatis** (teks layar = ucapan, sinkron per kata, objek tidak menutup wajah, porsi B-roll, tempo, grading
   tercapai, tata letak zona aman) → QA → thumbnail + caption → Drive setelah disetujui.

## Daftar style
| Style | Untuk | Status |
|---|---|---|
| `ngobrol` (bawaan, dulu `narration`) | edit talking-head edukatif/tutorial + panel motion graphic hijau gelap | siap (`npm run edit`) |
| `komik` (bawaan) | animasi promo/iklan pop cinematic (jalur Pop) | siap (`npm run render`) |

Style Anda sendiri muncul di `npm run style -- list`.
