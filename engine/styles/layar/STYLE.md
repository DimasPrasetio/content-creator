# Layar — rekaman layar & tutorial

Rasa: jelas, tenang, mata penonton selalu dibawa ke bagian layar yang sedang dikerjakan. Untuk tutorial aplikasi,
demo fitur, cara pakai, coding, atau presentasi layar (16:9 YouTube bawaan; 9:16 bila disepakati).

- **Layar asli tajam**: resolusi asli dipertahankan (sampai 4K), tanpa grading, tanpa crop wajah.
- **Zoom otomatis** ke area yang berubah (ketikan, klik, menu terbuka), maks 2x, tahan minimal 2 dtk, transisi halus
  0,6 dtk. Saat pindah halaman/aplikasi kembali ke layar penuh. Koreksi per kalimat di `edit.json`:
  `"zoom": [x, y, w, h]` (pecahan 0-1), `"zoom": "penuh"`, atau `"zoom": "auto"`.
- **Loading/diam** (ditanya per video, `--idle=`):
  - `cepat` (bawaan): dipercepat 2-12x menjadi ≤ 2,5 dtk, dengan label kecil "dipercepat Nx ⏩".
  - `buang`: bagian diam dipotong habis.
  - `utuh`: dibiarkan apa adanya (suara tetap ikut).
- **Kamera wajah** (opsional, `--facecam=N`): lingkaran ±280 px di pojok kanan bawah (9:16: kanan atas), disinkron
  dari suara, hilang sebentar saat label dipercepat tampil.
- **Narasi**: suara rekaman sendiri (jeda mati & salah ucap dibuang), atau voice over AI (`--narasi=ai`: naskah
  dibacakan ElevenLabs, layar mengikuti kalimat — layar dipercepat bila bagiannya lebih panjang dari kalimat, ditahan
  bila lebih pendek).
- Judul langkah opsional (`"titles": [{"at": detik, "text": "Langkah 1 · ..."}]` di edit.json).
- Subtitle karaoke ditanam (biru muda), musik pelan hanya bila disepakati, tanpa SFX transisi.
- Bab opsional untuk tutorial panjang (label/kartu, sesuai kesepakatan).
