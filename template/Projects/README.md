# Projects

Satu folder per video, nama `[tanggal]-[count]-[nama]` (mis. `20261103-01-pengenalan-produk`).

```
Projects/<nama>/
  brief.md          pemahaman bersama hasil wawancara + persetujuan pengguna
  script.md         naskah: frontmatter, satu scene per heading "## ", catatan visual diawali ">"
  script.txt        narasi yang sama + tag ekspresi ElevenLabs ([excited], [sighs], ...), satu paragraf per ide
  storyboard.json   tampilan per scene: "composition" Pop | mg4 | html, "brand", sfx/music
  voice.wav         voice over final (dibuat `npm run voice`)
  preview/          gambar cek visual; draft/ = contoh frame gaya sebelum suara dibuat
  html/             jalur HTML (motion-graphics-skills): index.html dengan window.seek(seconds)
  assets/           gambar/logo khusus video ini (opsional)
  posting/          caption.md (sumber caption), subtitle.srt/.vtt, cover-grid.jpg (bahan kerja npm run posting)
  versions/         render sebelumnya (v1.mp4, v2.mp4, ...), disimpan otomatis sebelum ditimpa
```

## Naskah

- Hook kuat di 3 detik pertama, gaya bicara santai, kalimat pendek, ditulis seperti orang bicara.
- Koma = jeda singkat, titik = jeda panjang. `> jeda: 0.5` = hening tambahan setelah scene (setelah punchline).
- Target 20-45 detik, 5-9 scene (±2,5 kata per detik), kecuali diminta lain.

```markdown
---
judul: Judul internal
voice: George        # opsional, voice ElevenLabs (default di Engine/config.local.json)
profile: mybrand     # opsional, profil brand di Brands/mybrand/profile.json
---

## 1 Hook
> visual: catatan untuk tampilan (tidak dibacakan)
Kalimat pembuka yang langsung menarik.
```

File otomatis mesin (timing per kata, mix musik, cache suara, render sementara) ada di `Engine/work/<nama>/`, bukan di
sini, dan aman dihapus. Hasil jadi (video, thumbnail, caption) ada di `Result/<brand>/<nama>/`.
