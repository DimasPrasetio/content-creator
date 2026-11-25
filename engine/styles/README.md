# Mesin edit footage berbasis style

Mengedit video yang **sudah ada** (talking-head, podcast, rekaman layar, vlog/montase) menjadi video 9:16 1080×1920 (bawaan) atau 16:9 / 4:5 / 1:1 (`--format=`) sesuai sebuah
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
# podcast / wawancara 2-4 orang (style siniar, 16:9):
npm run edit -- <nama> --new --style=siniar --speakers=2 --input=lebar.mp4[,kamA.mp4,kamB.mp4] [--multicam --audio-src=1]
npm run edit -- <nama> --analyze --estimate   # perkiraan menit Speech to Text (gratis), lalu --analyze
# rekaman layar / tutorial (style layar, 16:9; v0.10):
npm run edit -- <nama> --new --style=layar --input=layar.mp4[,wajah.mp4 --facecam=2] [--idle=cepat|buang|utuh] [--narasi=ai]
# vlog / montase (style kilas, 9:16; v0.10):
npm run edit -- <nama> --new --style=kilas --input=a.mp4,b.mov,c.mp4 [--music=lagu.mp3] [--duration=30] [--narasi=ai]
# vlog bicara + B-roll + musik latar (style edit apa pun):
npm run edit -- <nama> --new --style=ngobrol --input=bicara.mp4 --broll=b1.mp4,b2.mov [--music=lagu.mp3]
# edit film "cinema story" (style sinema, 9:16; v0.12) — perintah sendiri, rincian styles/sinema/STYLE.md:
npm run sinema -- --new --film=film.mkv --judul="Judul" --genre=animasi --musik=lagu.mp3 [--srt=film.srt]
npm run sinema -- <nama> --analyze | --sheet=a-b:1 | --transkrip [--estimate|--ukur] | --storyboard | --audisi --voices=A,B
npm run sinema -- <nama> [--suara-uji]
# klip pendek 9:16 dari proyek yang sudah --analyze:
npm run clips -- <nama> [--min=30 --max=60]   # klip/kandidat.md -> agent menulis klip.json (3-5 usulan)
npm run clips -- <nama> --check               # tabel untuk dipilih pengguna
npm run clips -- <nama> --make=k1,k3 [--render]   # proyek anak <nama>-k1 ... (footage induk sebagian, tanpa kredit)
```

Style dicari di `Styles/<slug>/style.json` (workspace, mis. hasil analisis video referensi pengguna) lalu
`Engine/styles/<slug>/style.json` (bawaan plugin), digabung dalam. Bawaan: `ngobrol` (dulu `narration`, nama lama tetap dikenali
lewat `aliases`), `siniar` (podcast/wawancara 16:9: warna netral, tanpa subtitle tertanam, nama pembicara, kamera pada
yang bicara), `layar` (rekaman layar/tutorial 16:9: zoom otomatis, loading dipercepat, kamera wajah opsional),
`kilas` (vlog/montase 9:16: momen terbaik dipotong pada ketukan musik), `sinema` (edit film menjadi cerita 9:16:
footage persegi, subtitle kata per kata, 3 narasi diucapkan, montase di ketukan; `npm run sinema`) dan `komik` (animasi Pop).

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

### Podcast / multi-pembicara (v0.9)
```json
{
  "style": "siniar", "multicam": true, "audio": 1, "wide": 1,
  "sources": [{ "file": "assets/raw/01-lebar.mp4", "offset": 0 }, { "file": "assets/raw/02-kamA.mp4", "offset": 1.3, "syncScore": 1 }],
  "speakers": [
    { "id": "A", "name": "Rina", "title": "Pembawa acara", "cam": 2,
      "auto": { "cam": 2, "wide": 1, "seat": 1, "skor": { "cam": 0.8, "seat": 0.7 } } },
    { "id": "B", "name": "Budi", "title": "Tamu", "seat": 2, "wide": 1 }
  ],
  "sentences": [{ "id": "s1", "src": 0, "t": [0.1, 3.3], "spk": "A", "speaker": "A", "…": "…" }]
}
```
- `--speakers=N` (2-4) membuat `speakers` A-D; `--analyze` mengisi `spk` per kalimat (kalimat dipecah saat pembicara
  berganti) dan `auto` (tebakan dari gerak mulut; `skor` 0-1). `speaker` di kalimat = koreksi agent.
- Tampilan pembicara (nomor footage/kursi mulai 1): `box` [x, y, w, h] 0-1 (+ `boxSrc`) > `cam` (kamera dekat) >
  `seat` di rekaman lebar (`wide`) > `auto.cam` > `auto.seat`. Kursi = posisi orang di rekaman lebar (kiri → kanan);
  potongan dekat dari rekaman lebar maks ±2,4x.
- `multicam: true`: semua footage merekam momen yang sama; `audio` = footage yang suaranya dipakai, `sources[].offset`
  = waktu master − waktu kamera (dihitung otomatis dari suara, `--resync` mengulang). Bagian kalimat di luar rekaman
  kamera pilihan memakai footage suara.
- `lowerThird: false` per pembicara atau `"names": false` di akar mematikan nama; `"subtitle": true|false` di akar
  menimpa subtitle style; `"duration": [min, maks]` menimpa rentang durasi style.
- Pace style: `minShotSec` (bidikan minimal sebelum pindah, kecuali giliran baru ≥ itu), `minTurnSec` (giliran
  minimal agar kamera pindah), `sentenceGapSec` (hening alami sebelum kalimat), `maxStillSec` (batas layar tanpa perubahan).

### Rekaman layar / tutorial (v0.10)
```json
{
  "style": "layar", "kind": "layar", "screen": 1, "facecam": { "src": 2, "size": 280 }, "idle": "cepat",
  "zoom": true, "titles": [{ "t": [0, 3], "text": "Langkah 1 · Buka pengaturan" }],
  "sentences": [{ "id": "s1", "t": [0.2, 3.4], "zoom": [0.05, 0.1, 0.45, 0.3], "after": "buang", "…": "…" }]
}
```
- `kind: "layar"` (`--kind=layar` atau style bawaan `footage: "layar"`): footage `screen` dinormalisasi pada resolusi
  asli (maks 3840 lebar), tanpa grading/crop; `--analyze` mengukur perubahan piksel per area (grid 64x36) →
  `edit/srcN.activity.json` + rentang aktivitas di konteks.md.
- Zoom per kalimat: otomatis ke kotak aktivitas (`style.screen.zoom`: `max` 2x, `pad`, `holdSec`, `easeSec`), atau
  `"zoom": [x, y, w, h]` (0-1 dari layar), `"penuh"`, `"auto"`. `"zoom": false` di akar mematikan zoom otomatis.
  Kanvas lebih sempit dari layar (9:16, 4:5, 1:1): layar tampil di area antara brand pojok dan subtitle.
- Jeda ≥ `style.screen.idle.minGapSec` antar-kalimat: `cepat` (dipercepat `minSpeed`-`maxSpeed`x menjadi ≤ `maxOutSec`,
  bisu, label "dipercepat Nx"), `buang`, `utuh`. `idle` di akar, `after` per kalimat.
- `facecam`: kamera wajah (nomor footage) disinkron dari suara (`sources[].offset`), dipotong persegi di sekitar wajah,
  tampil bulat (`size`, `ring` dari style); `"show": false` menyembunyikan.
- `narasi: "ai"` (`--narasi=ai`): linimasa = voice over `npm run voice`; kalimat `v1..vn` = scene naskah, `screenAuto` =
  rentang layar otomatis per kalimat, `"screen": [awal, akhir]` = koreksi (dipercepat bila lebih panjang dari kalimat,
  ditahan bila lebih pendek).

### Vlog / montase (v0.10)
```json
{
  "style": "kilas", "kind": "montase", "narasi": "musik", "music": { "file": "assets/music/01-lagu.mp3", "start": 0 },
  "duration": [25, 35], "order": "urut",
  "montage": { "auto": true, "tempo": 120, "shots": [{ "t": [0, 2], "src": 1, "from": 3.4, "score": 0.81 }] }
}
```
- `kind: "montase"`: `--analyze` memberi skor momen per detik tiap klip (tajam + gerak + wajah) → `edit/srcN.moments.json`.
- Slot potongan: ketukan musik (`style.montage.beatsPerShot`, `introBeats`, `shotSec`; tempo dari musik, tanpa musik kisi
  100 BPM) atau, dengan `narasi: "ai"`, 1,5-3 dtk per kalimat voice over (`voShotSec`, `"clips": [nomor footage]` per kalimat).
- Momen dipilih otomatis tanpa berulang dan disimpan di `montage.shots` (`t` linimasa, `src` nomor klip, `from` detik
  klip, `hold` bila klip lebih pendek); dipilih ulang bila musik/naskah/klip berubah, kecuali `"auto": false`.
  `order`: `urut` (kronologis) atau `selang` (bergiliran antar-klip). Ken Burns `style.montage.kenBurns`.
- Musik: `music.file` (dari `--music`), atau `work/<nama>/music.wav` dari `npm run music -- <nama> --sec=N --prompt=...`
  (ElevenLabs), atau sintetis. Montase musik tanpa narasi: musik penuh, QA suara/sinkron dilewati.
- `titles`: judul opsional `[{"t": [awal, akhir], "text": "..."}]` (juga untuk jenis lain).
- `broll` (`--broll`): klip sisipan di `assets/broll/` untuk vlog bicara; konteks.md mendaftar momen terbaiknya; pakai
  sebagai objek `clip` (`file`, `from`, `at`, `fit`). `music` berlaku untuk jenis apa pun (musik latar di-duck).

### Klip (proyek anak)
`clips --make` menulis proyek anak dengan `"parent"`, `"clip": {id, title, hook, why}`, `"duration"`, dan
`sources[].range: [a, b]` (detik footage induk) + `from: {project, src}` (transkrip induk dipakai ulang, tanpa kredit).
Pembicara (nama, kamera) disalin dari induk. `klip.json` di induk: `{style, format, lengthSec, clips: [{id, title, hook,
why, from, to}]}` (`from`/`to` = id kalimat induk).

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
