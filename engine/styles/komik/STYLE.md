# Style: Komik (`komik`, bawaan plugin)

Promo / iklan bergaya **komik pop sinematik**: latar navy, aksen kuning, merah untuk impact, krem untuk jeda tenang;
shading core-shadow, cahaya bermotif, grain + vignette, tipografi ekstrusi, transisi grafis, impact kit, dan waktu
ter-posterize 8 fps di scene dramatis. Dibangun dengan komposisi Remotion **Pop** (`"composition": "Pop"`,
`npm run render`), bukan kit HTML.

## Kapan dipakai
Jualan, promo layanan, reveal brand, ajakan beli; rasa "lucu, berani, berkarakter". Kurang cocok untuk dokumenter
atau edukasi panjang bersumber (pakai style papan tulis / dokumenter).

## Struktur (dari skill pop-cinematic-motion, opsional)
1. Hook ≤ 1 dtk (flash + kata besar).
2. 2-3 masalah dengan kicker (impact, getar, 8 fps).
3. Jeda tenang krem (napas sebelum reveal).
4. Reveal brand: flash + sunburst.
5. Cara kerja 2-3 langkah.
6. Payoff (hasil yang dirasakan).
7. End card + CTA (≥ 2,5 dtk).

## Warna
Token `K` di `Engine/src/pop/lib.tsx` (navy, krem, kuning brand, merah). Brand dengan warna sendiri: ganti token di
scene khusus (`Engine/src/pop/custom/<slug>.tsx`), jangan di `lib.tsx`. `warna: style` = palet Komik dipakai apa adanya.

## Storyboard
`{"composition": "Pop", "style": "komik", "brand": {...}, "scenes": [{"key": "S1", "trans": "flash", "music": "...", "sfx": [...]}]}`
Scene khusus video: `Engine/src/pop/custom/<slug>.tsx` (titik awal `custom/example.tsx`), lalu `npm run typecheck`.
