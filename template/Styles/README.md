# Styles: gaya edit video (bukan per brand)

Style bawaan plugin ada di `Engine/styles/<slug>/`; folder ini untuk style milik Anda (menimpa bawaan dengan slug sama). Satu folder per **gaya edit** untuk mengolah footage yang sudah ada (talking-head, rekaman layar, dsb.). Brand tetap
mengatur logo/handle bila diminta; style mengatur **cara bercerita, tampilan, color grading, dan audio**.

```
Styles/<slug>/
  STYLE.md        breakdown & aturan (manusia membaca)
  style.json      angka target + tata bahasa visual (mesin membaca)
  reference.mp4   video acuan (hanya acuan gaya, bukan konten)
  examples/       frame kunci, lembar kontak, uji rencana
```

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
| `narration` (bawaan, `Engine/styles/narration/`) | talking-head edukatif/tutorial + panel motion graphic hijau gelap | siap (`npm run edit`) |
