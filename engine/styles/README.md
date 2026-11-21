# Mesin edit footage berbasis style

Mengedit video yang **sudah ada** (talking-head, rekaman bicara) menjadi video 9:16 1080×1920 (bawaan) atau 16:9 / 4:5 / 1:1 (`--format=`) sesuai sebuah
**style** (gaya edit, `kind: "edit"`), bukan sesuai brand. Folder ini juga berisi style animasi bawaan (`komik`); semua
style dikelola dengan `npm run style -- list|show|new|save|selera`. Style mengunci identitas (ritme, tampilan, grading, audio); isi visual
diputuskan agent dari **konteks** tiap video.

```
npm run edit -- <nama> --new --style=ngobrol --input=/path/a.mov[,b.mp4] [--format=16:9]   # proyek + salin footage
npm run edit -- <nama> --analyze     # normalisasi, transkrip per kata, wajah/gerak/cahaya/noise -> edit/konteks.md
#   (agent: baca edit/konteks.md + edit/kontak-srcN.jpg, isi keputusan per kalimat di Projects/<nama>/edit.json)
npm run edit -- <nama> --draft       # validasi -> potong + grading terkalibrasi + suara -> preview tiap kalimat + cek
npm run edit -- <nama>               # ... + render akhir + QA (+ posting bila caption.md ada)
npm run edit -- <nama> --from=cut|sound|preview|render
```

Style dicari di `Styles/<slug>/style.json` (workspace, mis. hasil analisis video referensi pengguna) lalu
`Engine/styles/<slug>/style.json` (bawaan plugin), digabung dalam. Bawaan: `ngobrol` (dulu `narration`, nama lama tetap dikenali
lewat `aliases`) dan `komik` (animasi Pop).

## Alur pemahaman konteks
1. **Isi**: transkrip per kata (ElevenLabs Scribe; atau sidecar `<footage>.words.json` = `[{w,s,e}]`, tanpa kredit) →
   kalimat. Agent menentukan topik, struktur, entitas, angka. **Glosarium** (`edit.json → glossary`) memperbaiki salah
   dengar dari konteks, mis. `{"cloud": "Claude"}`, lalu `--analyze` diulang (transkrip di-cache).
2. **Footage** (`edit/konteks.md`): resolusi & orientasi (bentuk berbeda dari kanvas → dipotong mengikuti wajah), HDR, persentase
   wajah terdeteksi, statistik cahaya & kulit, noise suara, kalimat yang tampak diambil ulang / terpotong / berisi
   kata pengisi. Lihat juga `edit/kontak-srcN.jpg` (1 frame per 2 dtk).
3. **Rencana** (`edit.json`): satu entri per kalimat dengan maksud, keputusan, objek, alasan (format di bawah).
4. **Mesin**: memotong per kata (jeda > `pace.maxGapSec` dibuang, kata pengisi dibuang), mengkalibrasi grading per
   sumber sampai statistiknya mencapai target style (diukur ulang tiap putaran), membersihkan suara sesuai noise,
   menempatkan objek **sadar wajah** (tidak menutup wajah, tidak masuk zona subtitle, sisi berlawanan dengan wajah &
   gerak tangan), lalu memeriksa.
5. **Cek**: teks penekanan harus diucapkan; kata pemicu harus ada di kalimatnya; objek tidak menutup wajah (> 12%) atau
   zona subtitle; porsi & panjang B-roll; layar tanpa perubahan > 2,2 dtk; tempo; grading tercapai; tata letak zona
   aman; QA umum.

## edit.json
```json
{
  "style": "ngobrol",
  "format": "16:9",
  "bab": "kartu",
  "brand": { "left": "", "right": "" },
  "sources": [{ "file": "assets/raw/01-a.mov" }],
  "glossary": { "cloud": "Claude" },
  "sentences": [
    { "id": "s1", "src": 0, "t": [0.1, 3.3], "text": "…", "flags": [], "keep": true,
      "intent": "hook", "mode": "aroll", "punch": "auto", "pause": 0.3, "chapter": "Pembuka",
      "objects": [ { "type": "keyword", "kicker": "part 2", "title": ["tutorial"], "keyword": "gratis", "at": "gratis" } ],
      "why": "alasan keputusan" }
  ]
}
```
- `id/src/t/text/flags` dibuat `--analyze` (keputusan agent dipertahankan saat diulang). Urutan array = urutan video
  (pindahkan kalimat terkuat ke depan bila perlu hook).
- `keep: false` = buang (bawaan untuk kalimat yang diambil ulang / terpotong). `keepFillers: true` = jangan buang "eh/em".
- `mode`: `aroll` (wajah) · `broll` (panel style + PiP wajah) · `dim` (A-roll diredupkan + tint, untuk penutup/teaser).
- `punch`: `auto` (bergantian per potongan) · `strong` (penekanan/payoff) · `none`.
- `pause`: detik jeda tambahan setelah kalimat (punchline).
- `format` (opsional, bawaan `9:16`): kanvas hasil `16:9` 1920×1080 · `4:5` 1080×1350 · `1:1` 1080×1080. Footage dipotong
  mengikuti wajah bila bentuknya berbeda; objek ditata ulang (16:9: objek sisi di separuh yang berlawanan dengan wajah,
  B-roll panel di tengah), subtitle di atas tepi bawah zona aman format itu.
- `chapter` (opsional): judul bab di kalimat pertama bab itu (bab di kalimat yang dibuang pindah ke kalimat terpakai
  berikutnya). `bab` di akar: `tanpa` (bawaan) · `label` (chip judul bab ±2,5 dtk) · `kartu` (kartu judul ±1,6 dtk).
  Video 16:9 dengan bab yang memenuhi syarat YouTube → timestamp otomatis di deskripsi.
- Waktu objek: `at` / `until` = kata di kalimat itu (`"gratis"`, atau `{"word":"ke","n":2}`), angka detik dari awal
  kalimat, `"start"`, `"end"`. Elemen muncul 0,12 dtk sebelum katanya.

## Objek (tata bahasa visual)
| `type` | Untuk maksud | Kolom |
|---|---|---|
| `keyword` | hook, opini, emosi, penekanan | `kicker` (tulisan tangan), `title` (string/array), `keyword` (kotak, diucapkan), `big` (kata besar), `sub`, `at`, `slot: top/middle/center`, `kickerAt`, `titleAt` |
| `big` | teaser, satu kata kuat | `text`, `kicker`, `sub`, `at` |
| `chips` | daftar, centang, label | `items: [{text, at, icon: check/x/ai/doc/md/user, dim}]`, `kicker`, `slot` |
| `annotate` | menunjuk bagian tubuh/frame | `items: [{text, at, target: mouth/eyes/face/head/top}]` (posisi wajah nyata) |
| `brackets` | fokus ke wajah | `at`, `until` |
| `doc` | isi dokumen/daftar yang terisi bertahap | `title`, `icon`, `rows: [{label, value (teks / ["#hex", …]), at}]` |
| `chat` | dialog, proses antar aplikasi | `header`, `bubbles: [{side: me/ai, text, file, icon, at}]`, `maxBubbles` |
| `prompt` | kutipan/prompt yang harus ditiru | `text`, `kicker`, `label`, `button`, `mark: ["kata disorot"]`, `at`, `typeUntil` |
| `file` | berkas | `title`, `sub`, `icon`, `kicker`, `at` |
| `card` | hasil / manfaat | `kicker`, `title`, `sub`, `icon`, `at` |
| `phone` | CTA follow (HP berisi klip pembicara) | `at`, `followAt` |
| `image` | tangkapan layar/foto asli pengguna | `file` (relatif ke folder proyek, mis. `assets/layar.png`), `at`, `slot` |
| `clip` | B-roll video (mis. klip AI dari `npm run gen`) | `file` (mis. `assets/gen/meja.mp4`), `at`, `until`, `from` (detik awal di klip), `fit: full` (cutaway layar penuh, bawaan) / `card` (di kartu), `slot` |

**Aturan isi** (dicek): teks `keyword`/`big`/`chips`/`annotate` = kata yang diucapkan di kalimat itu (`"label": true`
hanya untuk label UI). Isi kartu UI (`doc`, `chat`, `prompt`, `file`, `card`) boleh berupa ringkasan, tanpa klaim baru.
Ikon alat memakai ikon generik, bukan logo resmi. Satu fokus per kalimat; maks 2-3 objek bersamaan.
`clip` tanpa suara (suara tetap dari footage); waktu tampil dipotong ke panjang klip (peringatan). `fit: full` menutup
A-roll/panel B-roll tetapi di bawah PiP, objek lain, dan subtitle. Klip AI yang tampak nyata = label konten AI saat posting.

**Penempatan** (otomatis, sadar konteks): A-roll `slot: side` = sisi berlawanan dengan wajah/gerak tangan, di bawah
dagu; `center` = di bawah wajah bila muat sebelum zona subtitle, selain itu di atas wajah; bila tidak ada ruang, cek
melaporkan error → pindahkan kalimat itu ke `broll`. B-roll: PiP wajah kiri atas, judul di kanan PiP, objek di tengah
(di atas zona subtitle).
