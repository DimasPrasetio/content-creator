# Kit HTML standar (jalur C) — semua brand

Kit ini membuat video explainer "papan tulis" 1080×1920 yang sinkron kata per kata dengan voice over. Tampilan brand diatur
**tema** (`Brands/<slug>/theme.json`); per video cukup menulis `html/scenes.js`.

```
npm run new -- <nama>            # folder + kit + theme.js + kerangka scenes.js & storyboard.json (dari script.md)
npm run produce -- <nama> --draft  # contoh frame (tanpa kredit) -> preview/draft/board.png
npm run produce -- <nama>          # voice -> cek cue -> sound -> preview -> render paralel -> QA ‖ posting
npm run new -- <nama> --refresh-kit  # salin ulang kit + tema (setelah kit/tema diubah)
```
## Zona aman TikTok (bawaan)
Video 9:16 (1080×1920). Semua elemen berada di **x 60–940 · y 220–1440**; di luar itu tertutup UI TikTok/Reels
(atas 220 px = status bar + tab "Mengikuti/Untuk Anda" + ikon cari; kanan 140 px = kolom tombol; bawah 480 px = nama
akun, caption, musik). Kit menata: progress bar y 232 · label bab & watermark y 254–296 (watermark berakhir di x 940) ·
zona visual y 316–1171 · subtitle y 1244–1414 (lebar 880). Cek tata letak menganggap teks di luar zona ini **error**.
Tema `"layout": "penuh"` mengembalikan tata letak lama (hanya untuk platform tanpa UI yang menimpa video).

Halaman: `index.html` → `theme.js` → `kit-core.js` → `scenes.js` → `kit-run.js`. Font dari `/fonts/` (Engine/fonts: Poppins, Inter,
Anton, Fira Sans). Render paralel 4 browser + GPU (`npm run html`), stills/preview SwiftShader.

## Aturan timing & kejelasan (wajib — inilah yang membuat visual "jelas dan tepat")
1. **Tepat secara konteks, bukan tepat buta.** Timing mengikuti *makna kalimat*, bukan hanya kata pemicu:
   - **Jangkar scene:** objek utama yang menggambarkan isi kalimat hadir sejak scene dimulai (`start(s)`, ≤ 0,2 dtk),
     dibangun bertahap selama kalimat berjalan. Kata kunci hanya menambah *detail/penekanan* (label, ✓, warna, sorotan).
     Jangan biarkan layar menunggu kata yang baru diucapkan di detik ke-1,5.
   - **Antisipasi:** `cue()` sudah memajukan elemen `timing.lead` (bawaan 0,12 dtk) sebelum katanya; elemen yang dipicu
     kata terakhir kalimat dimajukan ke kata sebelumnya.
   - **Proporsi:** zona visual terisi seimbang (atas & bawah) sepanjang scene; bila separuh zona kosong > 1 dtk, isi dengan
     bagian objek berikutnya lebih awal atau perbesar objek utama.
   - **Sambungan:** scene berganti dengan crossfade (`timing.crossfade`, bawaan 0,25 dtk): scene lama tetap tampil sampai
     scene baru masuk.
   - **Cek otomatis:** `npm run produce` menjalankan `scripts/visual_gaps.py` setelah render: rentang **kosong ≥ 0,4 dtk**
     dan **separuh kosong ≥ 1 dtk** wajib 0 sebelum diserahkan (perbaiki → `--from=preview`).
2. **Satu fokus per scene.** Satu objek utama besar (±40–60% lebar layar) + maksimal 2–3 pendukung. Lebih dari itu → pecah scene.
3. **Layar = ucapan.** Teks di zona visual adalah kata yang diucapkan (atau angkanya), bukan kalimat baru. Kata kunci ≥ 44 px
   (`head`/`big`), label ≥ 28 px (`small`). Hindari teks abu kecil sebagai informasi utama.
4. **Garis fokus tebal + glow.** Objek utama `"stroke-width": 7–8` + `filter: "url(#glow)"`; pendukung 5. Saat fokus pindah,
   elemen lama diredupkan `{ dims: [[cue(s, "kata"), 0.35]] }`, bukan dihapus.
5. **Warna punya arti** (tema): `accent` = sorotan/brand, `accent2` = struktur, `ok` hanya benar/jalan, `bad` hanya salah/error.
   Maks dua aksen per layar.
6. **Subtitle karaoke otomatis**: kata menyala tepat saat diucapkan (`subtitle.said`), kata kunci `KEY` (`subtitle.key`),
   belum diucapkan `subtitle.unsaid`. Potongan maks ±42 huruf, 2 baris.
7. `npm run produce` menolak render bila ada `cue` yang katanya tidak ada di scene itu (elemen akan muncul di awal scene).
   Di halaman, cue yang meleset juga dilaporkan sebagai error render.

## scenes.js
```js
const R = ["REALITA", C.bad], K = ["KESIMPULAN", C.accent];   // [teks label, warna titik]
const LABEL = [R, R, K, null];                                // satu per scene; null = tanpa label (penutup)
const KEY = { 0: ["satu"] };                                  // opsional: kata kunci subtitle
scene(0);
{ const s = 0, sat = cue(s, "satu"); big(300, 380, "1", C.accent, sat, 300); }
scene(3); closing(3);                                         // penutup dari THEME.closing
```
Zona visual = SVG 1080×1000 (isi x 60–1020, y 0–950), ditampilkan diskalakan 0,9 di area aman (layar x = 14 + 0,9·x,
y = 316 + 0,9·y). `cue(s, "kata", n)` mencocokkan awalan kata
(tanpa tanda baca), `n` = kemunculan ke-n.

## Dasar
`D(tag, attrs, t0, dur, {fill, dims, dash})` garis tergambar · `A(el, t0, "fade"|"pop", o)` · `TX(x, y, teks, attrs, t0, kind, o)` ·
`el(tag, attrs)` · `rr(x,y,w,h,r)` · `start(s, d)` awal scene · `at(s, f)` titik f (0-1) sepanjang scene · `col(nama|hex)` · `tint(warna, alpha)` · `o.dims: [[detik, opasitas]]`.
Gerak khusus `items.push({el, kind, ...})`: `bar` (w, t0, t1) · `grow` (r0, r1) · `spin` (cx, cy, rate) · `move` (path) ·
`blink` · `domino` · `countup` (to, suffix, t0, t1) · `type` (t0, t1) · `count` (from) · `timer` (len).
Jangan pakai `blink` pada elemen ber-atribut `opacity` (ditimpa jadi penuh) — pakai `alarm()`.

## Komponen
| Fungsi | Wujud |
|---|---|
| `big(x, y, teks, warna, t0, size=120)` · `head(x, y, teks, warna, t0, size=48)` · `small(x, y, teks, warna, t0)` | angka/kata besar menyala · judul · label kapital |
| `person(x, y, skala, t0, o)` · `table(x, y, w, t0)` · `bubble(x, y, w, h, tail, t0)` | orang · meja · gelembung |
| `laptop(x, y, w, t0, {h})` → `{cx, cy, bottom}` · `phone(x, y, w, t0)` · `browser(x, y, w, h, t0)` | perangkat |
| `server(x, y, w, t0, n)` · `db(cx, y, rx, h, t0)` | server · database |
| `cal(x, y, w, h, warna, t0)` · `pill(x, y, w, teks, warna, t0, {mono})` · `bar(x, y, w, h, warna, t0, t1, frac)` | kalender · chip · bar |
| `arrow(x1, y1, x2, y2, warna, t0)` · `check(cx, cy, r, t0, warna)` · `cross(cx, cy, r, t0)` · `alarm(cx, cy, r, t0, t1)` | alur · ✓ · ✗ · lampu error |
| `mark(x, y, size, t0)` | logo/monogram dari `THEME.mark` |
| `question(s, [[teks, t0, t1]], {left, top, width, align, size})` | kutipan/pertanyaan stabilo (warna `highlight`) |
| `ctaBio(s, [["baris 1", "kata awal", "kata akhir"], ...], {label, cue})` | CTA stabilo + chip (label `THEME.cta.label`) |
| `closing(s)` | penutup dari `THEME.closing` |

## Tema (`Brands/<slug>/theme.json`, digabung dengan `theme.default.json`)
`layout` ("aman" bawaan = zona aman TikTok, "penuh" = tata letak lama) · `timing` {lead, crossfade} · `colors` (bg, grid, panel, track, text, dim, accent, accent2, info, ok, warn, bad, extra) · `fonts` (head, body, mono) · `stroke` ·
`progress` · `label.text` · `glow` · `highlight` {bg, fg} · `subtitle` {said, unsaid, key} · `watermark` {parts: [[teks, warna]], opacity, size (px, bawaan 36; thumbnail ikut diskalakan)}
(null = tanpa) · `mark` · `cta.label` · `closing` {wordmark, descriptor, lines: [[kata, kata disorot, cue]]} (null = tanpa) ·
`storyboard` {skill, brandOverlay, music, closingSfx}. Nilai warna boleh nama warna tema atau hex.

## Kit kamera (gaya "produk-kamera") — `kit-camera.js`
Untuk video produk/aplikasi: UI produk dibangun ulang (bukan screenshot) lalu **difilmkan** — kamera maju ke detail,
mengikuti aksi (ketuk, unggah, klik), meluncur ke layar lain, mundur memperlihatkan keseluruhan; pergantian scene larut-blur;
render dengan motion blur. Teknik dari skill explainer-default (Barty-Bart/motion-graphics, MIT), disesuaikan dengan voice
over, subtitle karaoke, dan tema kit. Boleh dicampur dengan scene SVG biasa di video yang sama.

```js
scene(7);                                   // tetap dipanggil (indeks scene)
{
  const s = 7, ung = cue(s, "unggah"), ver = cue(s, "memverifikasi"), sts = cue(s, "statusnya");
  const S = shot(s);                        // lapisan dunia scene 7 (lapisan 1080×1120 ikut skala zona, tepi atas/bawah memudar)
  const W = S.window(0, 0, 1000, 660, { title: "WO Console", user: "Rina", nav: ["Beranda", "Pembayaran"], active: 1 });
  const btn = S.button(W.el, 720, 360, 160, "Verifikasi"), ok = S.chip(W.el, 720, 357, "Lunas", "ok");
  S.swap(btn, ok, ver + 0.28); S.stamp(W.el, 500, 386, 136, ver + 0.26);
  S.cursor([[ver - 0.6, 560, 560], [ver, 795, 380]], [ver + 0.1]);
  const ph = S.phone(-640, 40);             // {el, screen}; isi layar pakai S.text/S.card/S.chip(ph.screen, ...)
  S.move(ph.el, [[sts - 0.2, -640, 40], [sts + 0.7, -250, 70]]);
  S.cam([[SC[s].start, -440, 425, 1.6], [ver - 0.3, 600, 386, 1.4, "glide"], [sts + 0.8, 375, 440, 0.8]]);
}
scene(8); statement(8, [["Semua", "semua"], ["terbukti.", "terbukti", true]]);   // pernyataan besar + stabilo
```
**Kamera** `S.cam([[t, x, y, zoom, mode?], ...])`: (x, y) = titik dunia di tengah layar (layar y 770), zoom 1 = 1 px dunia
per px layar. Antar kunci ease in-out; `"glide"` = zoom-out di tengah perpindahan jauh; `"drift"` = linier (dorongan pelan).
Pola: **maju** ke elemen yang sedang dipakai (zoom 1,4-1,9, elemen mengisi ±60-75% lebar) → **ikut** aksinya → **mundur**
sebentar (zoom 0,8) supaya penonton tahu di mana mereka → **meluncur** ke layar berikutnya. Tidak memantul, tidak getar.

| Fungsi (S = shot) | Wujud |
|---|---|
| `S.window(x, y, w, h, {title, user, nav, active})` → `{el, x0}` · `S.phone(x, y, {w, h})` → `{el, screen}` | jendela aplikasi · ponsel |
| `S.card(p, x, y, w, h)` · `S.chip(p, x, y, teks, "ok"\|"warn"\|"bad"\|"accent"\|"soft")` · `S.button(p, x, y, w, teks)` | kartu · status · tombol |
| `S.text(p, x, y, teks, size, weight, warna)` · `S.box(p, x, y, css, teks)` · `S.file(p, x, y)` · `S.progress(p, x, y, w, t0, t1)` | teks · kotak bebas · dokumen · progres |
| `S.in(el, t0, {dy, pop, dur})` · `S.out(el, t0)` · `S.swap(a, b, t0)` · `S.dim(el, t0)` · `S.press(el, t0)` · `S.pulse(el, t0, warna)` | muncul · hilang · ganti · redup · tekan · denyut |
| `S.move(el, [[t, x, y], ...])` · `S.pointIn(el, dx, dy)` · `S.count(el, dari, ke, t0, t1, fmt)` | pindah · titik ikut objek · angka berjalan |
| `S.tap(p, x, y, t0)` · `S.cursor(path, clicks, {hide})` · `S.stamp(p, cx, cy, size, t0)` · `S.link(dari, ke, t0, t1, t2)` | riak jari · kursor macOS · cap/segel · garis cahaya |
| `S.label(x, y, teks, t0)` · `S.at(fn)` · `statement(si, [[teks, kataCue, sorot]], {size, from, to})` | label dunia · gerak bebas · pernyataan |
`p` = parent (`null` = dunia). Semua waktu dari `cue()`/`start()`; aturan timing di atas tetap berlaku (objek utama hadir sejak
awal scene, satu fokus). UI memakai tema `ui` (bg, card, text, dim, line, primary, soft, accent, accentSoft, frame, ok/warn/bad
+ Soft, `stamp`: file cap relatif ke `Brands/<slug>/`, disalin `npm run new` ke `html/stamp.*`).
**Motion blur** otomatis: bila ada `shot()`, render mengambil sub-frame (rana 180°) **hanya** untuk frame yang bergerak
cepat (kamera, `move`, kursor, cap), sebanyak perpindahan/4 px (4-16); frame lain satu screenshot. Video 71 dtk dengan
dua scene kamera: ±78 dtk render (tanpa kit kamera ±30 dtk). Atur jumlah lewat tema `motionBlur`, storyboard
`"motionBlur"`, atau `--subframes=N` (1 = mati). Teks di lapisan kamera yang terpotong tepi bingkai tidak dihitung error
cek tata letak (disengaja). SFX yang cocok di storyboard: `click` (ketuk/klik), `whoosh` (luncuran, `offset` −6 frame),
`stamp` (cap), `ding` (status sinkron).
