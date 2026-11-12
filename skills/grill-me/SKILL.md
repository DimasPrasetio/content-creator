---
name: grill-me
description: Wawancara "grill me" untuk menyamakan persepsi sebelum pekerjaan dimulai — mengurai permintaan menjadi pohon keputusan, mencari sendiri fakta yang bisa dicari, menanyakan cabang yang tersisa satu per satu dengan rekomendasi, menantang jawaban yang kabur atau bertentangan, lalu menutup dengan ringkasan pemahaman bersama yang disetujui pengguna. Dipakai content-creator di awal setiap video baru, atau saat pengguna meminta "grill me" / "samakan persepsi".
argument-hint: "[permintaan yang mau diselaraskan]"
---

# Grill me — samakan persepsi sebelum bekerja

Pekerjaan paling sering meleset karena menebak maksud. Sebelum ada yang dikerjakan, sepakati **hasil, kriteria selesai,
lingkup, dan batasan**, dibuktikan dengan ringkasan yang disetujui pengguna secara eksplisit.

| Jenis ketidakjelasan | Contoh | Ditutup dengan |
|---|---|---|
| Maksud & selera | hasil yang dianggap berhasil, prioritas, gaya | **ditanyakan** |
| Fakta | file/riwayat yang sudah ada, kuota, versi | **dicari sendiri**, jangan ditanyakan |
| Keahlian | cara teknis terbaik | **diputuskan pelaksana**, bukan dibebankan ke pengguna |

## 1. Kedalaman
- **Kilat** (kecil, jelas, mudah dibatalkan): 0-2 pertanyaan, lalu konfirmasi ringkas.
- **Standar**: 3-7 pertanyaan pada cabang yang masih terbuka.
- **Mendalam** (proyek/brand baru, sulit dibatalkan): semua cabang.
- Pengguna berkata "langsung"/"cukup": isi sisa cabang dengan rekomendasimu sebagai **asumsi** dan tunjukkan.

## 2. Pohon keputusan
Hasil · kriteria selesai · lingkup (dan yang bukan lingkup) · batasan (tenggat, aturan, anggaran) · preferensi (gaya,
bahasa, format) · risiko/aksi berisiko · keterkaitan dengan pekerjaan sebelumnya. Hanya cabang selera/keputusan pengguna
yang menjadi pertanyaan. Urutkan hulu ke hilir: keputusan yang mengubah cabang lain ditanyakan lebih dulu.

## 3. Cari fakta dulu
Periksa percakapan, catatan, dokumen workspace, dan file konfigurasi sebelum bertanya. Jangan menanyakan yang bisa
dicari atau yang sudah dijawab. Pakai fakta itu sebagai konteks pertanyaan ("Saat ini X — apakah …?").

## 4. Satu cabang per giliran, selalu dengan rekomendasi
- Bentuk: konteks satu kalimat → pertanyaan → 2-4 pilihan → rekomendasi + alasan singkat.
- Pakai `AskUserQuestion` bila tersedia: rekomendasi di opsi pertama berakhiran "(Rekomendasi)", `header` ≤ 12 karakter.
  Tanpa alat itu, tulis pertanyaan + opsinya lalu berhenti menunggu jawaban.
- Paling banyak tiga pertanyaan sekaligus, hanya bila independen dan ringan.
- Bahasa awam: ceritakan dampak dan pilihan dalam bahasa hasil kerja; istilah teknis hanya dalam kurung bila perlu.

## 5. Gali
- Kata kabur ("bagus", "viral", "profesional") → minta contoh, angka, atau pembanding.
- Kontradiksi disebut terang dan ditanyakan mana yang menang.
- Konsekuensi tersembunyi (biaya, waktu, yang sulit dibatalkan) diungkap.
- "Terserah" → pakai rekomendasimu, catat sebagai asumsi.

## 6. Tutup dengan pemahaman bersama
Ringkasan ≤ 12 baris: hasil · kriteria selesai · lingkup & bukan lingkup · batasan · asumsi · rencana singkat. Minta
persetujuan eksplisit ("Sepakat, jalankan (Rekomendasi)" / "Ada koreksi"). Koreksi → perbaiki cabang itu saja dan
tunjukkan ulang. Sepakat → kutip jawabannya persis di catatan (mis. `brief.md`), baru pekerjaan dimulai.

## Larangan
- Tidak memulai pekerjaan sebelum sepakat (kecuali pengguna meminta "langsung").
- Tidak menanyakan rahasia (sandi, token, kunci).
- Kesepakatan bukan izin umum untuk aksi berisiko; aksi itu tetap butuh permintaan pengguna per aksi.
