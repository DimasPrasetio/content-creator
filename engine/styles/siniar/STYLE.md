# Siniar — podcast & wawancara

Rasa: tenang, rapi, fokus pada orang yang sedang bicara. Untuk episode podcast/wawancara 2-4 orang (16:9 YouTube),
dari satu kamera lebar, kamera per orang (multikamera), atau rekaman online (Zoom/Meet).

- **Kamera selalu pada SATU orang**: yang sedang bicara. Pindah hanya bila bidikan sudah ≥ 2,5 dtk (`pace.minShotSec`)
  dan giliran baru ≥ 1 dtk (`pace.minTurnSec`); sahutan pendek ("iya", "betul") tidak memindah kamera. Tanpa layar terbagi.
- Kamera dekat (footage per orang) diutamakan; dari rekaman lebar/grid, bingkai dipotong dekat ke wajah orang itu
  (zoom maks ±2,4x; rekaman lebar 4K disarankan agar tetap tajam).
- **Nama pembicara** (lower-third kiri bawah, aksen amber) saat orang itu pertama tampil, ±4,5 dtk.
- Jeda mati & salah ucap dibuang, tetapi jeda antar-giliran alami disisakan (≤ 0,25 dtk, `pace.sentenceGapSec`).
- Grading netral (kulit natural, kontras sedang), suara -15 LUFS, tanpa musik & SFX.
- Subtitle tidak ditanam di episode (`type.subtitle.burn: false`); SRT/VTT tetap dibuat di paket posting.
- Bab opsional (label/kartu) sesuai kesepakatan; objek grafis hanya bila benar-benar menambah kejelasan.
- **Klip pendek** dari episode: `npm run clips` (bawaan style `ngobrol` 9:16, 30-60 dtk, subtitle karaoke).
