# Style Sinema — edit film menjadi "cinema story" 9:16

Raw film (mkv/mp4, 1-3 jam) dipotong menjadi video 45-60 dtk yang terasa seperti trailer bercerita: dialog konfrontasi
asli → aksi dengan 3 narasi pencerita yang **diucapkan** → montase di ketukan musik → flash penutup. Dibedah dari
referensi `References/feminine-allure/breakdown.md` (dipakai pertama oleh brand Feminine Allure). Perintah: `npm run sinema`.

## Tampilan (dikunci style.json)
- Kanvas 1080×1920 hitam. Film dipotong **persegi 1:1** (1080×1080 di y 267): hitam atas ±14%, bawah ±30% (caption
  TikTok jatuh di area hitam). Potongan persegi diambil di dalam area aktif film (letterbox dibuang otomatis); posisi
  horizontal per shot `cx` (0 kiri … 1 kanan), `scale` > 1 = lebih rapat.
- **Subtitle di tengah footage** (±46,5% tinggi footage): Montserrat Black Italic kapital ±40 px, putih; muncul kata per
  kata (bertambah), maks 2 baris × 2-4 kata. **Kuning** = kata kunci (bawaan: ujung kalimat + kata pendek sebelumnya,
  atau daftar `kunci`), **merah** = kata emosional (`emosi`, sesekali saja). Tanda baca dibuang.
- Watermark brand (profil `watermark`) tipis berjarak lebar, putih 72%, dekat tepi bawah footage. Tanpa logo besar,
  tanpa judul, tanpa CTA di layar.
- Grading: kontras & saturasi tinggi, bayangan teal, sorot hangat, dipertajam.
- Efek per shot (`fx`): `flash` (kilat putih 2 frame di awal shot, untuk pukulan/ledakan), `whip` (masuk dengan geser +
  blur horizontal, untuk transisi tempat), `zoom: "in"` (punch-in pelan ke wajah saat kalimat emosional).
- Penutup otomatis: blur cepat → flash putih → lingkaran memudar ke hitam (0,75 dtk terakhir). Shot pertama & terakhir
  sebaiknya tokoh yang sama (video terasa berputar/loop).

## Struktur 3 babak (45-60 dtk)
| Babak | Durasi | Potongan | Isi |
|---|---|---|---|
| **dialog** | ±12-18 dtk | 1,5-8 dtk, kalimat utuh | Konfrontasi: ancaman antagonis → jawaban protagonis → reaksi. Dialog asli + subtitle |
| **aksi** | ±18-25 dtk | 0,3-2,2 dtk | Serangan, kilas balik/dorongan, duel, twist. **3 narasi** di sini. Musik naik ("drop" di narasi 2) |
| **montase** | 6-10 dtk | tepat di ketukan (±0,6 dtk) | Momen ikonik/kemenangan, satu shot diulang sebagai "refrain". Audio film diredam, musik penuh |

## 3 narasi pencerita (diucapkan)
Orang ketiga, bahasa Inggris, 3-7 kata, nada kronik/dongeng. Teks layar = kalimat yang diucapkan (ejaan dicek!).
1. **Aksi dimulai**: "The opponent attacks." · "She finally said yes."
2. **Puncak**, jatuh di "drop" musik: "They fought fiercely." · "Their hearts collided."
3. **Twist**: lucu bila ada momen konyol (bahasa epik untuk hal sepele: "The enemy bites the buttocks."); romance/drama
   → haru atau ironis ("But he never came back.").
Narator mengikuti genre (profil brand `narator.genre`: animasi/action/fantasi → pria, romance/drama → perempuan).
Audio film diredam ke 25% selama narasi; dialog yang tertimpa narasi tidak diberi subtitle.

## Prosedur (agent)
1. `npm run sinema -- --new --film=<file> --judul="<judul>" --tahun=<th> --genre=<genre> --musik=<lagu> [--srt=<file>]`
   (`--brand=` bawaan feminine-allure).
2. **Pahami film**: riset sinopsis, tokoh, konflik (web, sebut sumbernya) → `Projects/<nama>/sinema/konteks.md`.
3. `--analyze` (gratis): area aktif, potongan, gerak, ucapan per detik, 8 jendela dialog & 8 jendela aksi teratas,
   lembar kontak per 5 dtk di `sinema/kontak/`. **Lihat lembar kontaknya**; perlu lebih rapat: `--sheet=1:02:10-1:02:40:1`.
4. Tulis `kandidat` (rentang yang akan ditranskrip, total ±5-8 menit) → `--transkrip --estimate` → (pertama kali
   `--ukur`: 60 dtk untuk mengukur tarif kredit) → `--transkrip`. Dengan `--srt` (subtitle film): gratis, waktu kata
   perkiraan. Hasil: `sinema/transkrip.md`.
5. Tulis `shots`, `narasi`, `montase`, `kunci`, `emosi` di `sinema.json` (format di bawah).
6. `--storyboard` (gratis; narasi diperkirakan, `--suara-uji` = suara macOS) → **lihat** `preview/board.jpg` dan
   `sinema/storyboard.md` → **minta persetujuan pengguna** (titik cek wajib brand).
7. Narator belum dipilih → `--audisi --voices=A,B,C` (kredit, sebut dulu), isi profil `narator.pria|perempuan`.
8. `npm run sinema -- <nama>`: narasi ElevenLabs (kredit ±jumlah huruf narasi, sebut dulu) → potong → audio →
   render → `Result/<brand>/<nama>/`. Tulis `posting/caption.md` (Inggris) → `npm run posting -- <nama>`.

## Format sinema.json
```json
{
  "profile": "feminine-allure", "style": "sinema",
  "film": { "path": "/abs/film.mkv", "judul": "Kung Fu Panda 4", "tahun": 2024, "genre": "animasi", "bahasa": "en", "srt": null },
  "musik": { "file": "/abs/lagu.mp3", "drop": "auto", "dropDi": "narasi2" },
  "kandidat": [{ "id": "konfrontasi", "t": ["1:12:05", "1:14:30"], "isi": "Po vs Chameleon di arena" }],
  "shots": [
    { "t": ["1:12:07.2", "1:12:10.4"], "babak": "dialog" },
    { "t": ["1:12:10.4", "1:12:13.5"], "babak": "dialog", "zoom": "in", "cx": 0.35 },
    { "t": ["1:15:02.0", "1:15:03.6"], "babak": "aksi", "fx": ["flash"], "speed": 0.8 },
    { "t": ["1:15:20.0", "1:15:21.5"], "babak": "aksi", "sub": false },
    { "t": ["0:40:11.0", "0:40:13.0"], "babak": "aksi", "sub": "Kick her butt!" }
  ],
  "narasi": [
    { "text": "The opponent attacks.", "shot": 3, "kunci": "attacks" },
    { "text": "They fought fiercely.", "shot": 9, "kunci": "fiercely" },
    { "text": "The enemy bites the buttocks.", "shot": 13, "kunci": "the buttocks" }
  ],
  "montase": { "shots": [{ "t": "1:30:02" }, { "t": "0:12:40", "cx": 0.6 }] },
  "kunci": ["one of us", "unstoppable"], "emosi": ["something"], "cover": null
}
```
- `t` = waktu **film** (detik atau h:mm:ss.s). Urutan `shots` = urutan di video (boleh lompat waktu film).
- `sub`: `true` (bawaan; dari transkrip), `false` (tanpa subtitle), atau teks manual. `audio`: penguat suara film shot
  itu (dialog 1, aksi 0,85). `speed` < 1 = gerak lambat (pitch suara tetap).
- `narasi.shot` = nomor shot (1 = pertama), `offset` detik setelah awal shot (bawaan 0,15).
- `musik.drop`: detik lagu yang "meledak" (`auto` = deteksi energi), jatuh di `dropDi` (`narasi2` atau detik video);
  atau `mulai` = detik lagu di awal video. Montase dipotong di ketukan setelah shot terakhir (shot terakhir diperpanjang
  sampai ketukan pertama); tanpa musik = 0,63 dtk per shot.
- `watermark: null` mematikan watermark; `grade` menimpa grading style; `narasiGain` (bawaan 1,3).

## Batas & catatan
- Film HDR tampil pucat (ffmpeg di sini tanpa tone-mapping): pakai rilis SDR.
- Hak cipta: potongan film = konten pengguna; mesin tidak mengunduh film.
- Biaya hanya: transkrip ElevenLabs (rentang kandidat saja) dan narasi (±huruf). Analisis, storyboard, potong, render gratis.
