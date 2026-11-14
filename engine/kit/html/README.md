# Kit HTML standar (jalur C) — semua brand

Kit ini membuat video explainer "papan tulis" 1080×1920 yang sinkron kata per kata dengan voice over. Tampilan brand diatur
**tema** (`Brands/<slug>/theme.json`); per video cukup menulis `html/scenes.js`.

```
npm run new -- <nama>            # folder + kit + theme.js + kerangka scenes.js & storyboard.json (dari script.md)
npm run produce -- <nama> --draft  # contoh frame (tanpa kredit) -> preview/draft/board.png
npm run produce -- <nama>          # voice -> cek cue -> sound -> preview -> render paralel -> QA ‖ posting
npm run new -- <nama> --refresh-kit  # salin ulang kit + tema (setelah kit/tema diubah)
```
Halaman: `index.html` → `theme.js` → `kit-core.js` → `scenes.js` → `kit-run.js`. Font dari `/fonts/` (Engine/fonts: Poppins, Inter,
Anton, Fira Sans). Render paralel 4 browser + GPU (`npm run html`), stills/preview SwiftShader.

## Aturan timing & kejelasan (wajib — inilah yang membuat visual "jelas dan tepat")
1. **Muncul tepat saat katanya diucapkan.** Setiap elemen `t0 = cue(s, "kata")`. `SC[s].start` hanya untuk konteks yang
   *sudah terlihat* di scene sebelumnya (dilanjutkan). Elemen yang dipicu kata terakhir kalimat dimajukan ke kata sebelumnya.
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
Zona visual = SVG 1080×1000 (y 0 = layar y 250; konten penting y ≤ 950). `cue(s, "kata", n)` mencocokkan awalan kata
(tanpa tanda baca), `n` = kemunculan ke-n.

## Dasar
`D(tag, attrs, t0, dur, {fill, dims, dash})` garis tergambar · `A(el, t0, "fade"|"pop", o)` · `TX(x, y, teks, attrs, t0, kind, o)` ·
`el(tag, attrs)` · `rr(x,y,w,h,r)` · `col(nama|hex)` · `tint(warna, alpha)` · `o.dims: [[detik, opasitas]]`.
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
`colors` (bg, grid, panel, track, text, dim, accent, accent2, info, ok, warn, bad, extra) · `fonts` (head, body, mono) · `stroke` ·
`progress` · `label.text` · `glow` · `highlight` {bg, fg} · `subtitle` {said, unsaid, key} · `watermark` {parts: [[teks, warna]], opacity}
(null = tanpa) · `mark` · `cta.label` · `closing` {wordmark, descriptor, lines: [[kata, kata disorot, cue]]} (null = tanpa) ·
`storyboard` {skill, brandOverlay, music, closingSfx}. Nilai warna boleh nama warna tema atau hex.
