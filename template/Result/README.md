# Result

**Hasil jadi saja**, siap diunggah, dikelompokkan per brand lalu per video:

```
Result/
  <brand>/                 slug brand (sama dengan Brands/<brand>/); video tanpa brand -> umum/
    <nama>/                [tanggal]-[count]-[nama], sama dengan Projects/<nama>/
      <nama>.mp4           video 1080x1920 (H.264 + AAC, lolos QA)
      thumbnail.jpg        thumbnail / cover 1080x1920
      caption.txt          caption + hashtag, siap tempel
      <nama>.4x5.mp4 ...   (opsional) format lain / versi subtitle ditanam
```

Bahan kerja (naskah, storyboard, preview, subtitle, versi lama) tidak disimpan di sini, melainkan di `Projects/<nama>/`.

Bila Google Drive sudah diatur (`Engine/config.local.json` → `drive`), video yang sudah disetujui juga disalin otomatis ke
folder Drive tujuan dengan struktur yang sama (`npm run drive -- <nama>`).
