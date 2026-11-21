# Kilas — vlog & montase

Rasa: hidup, hangat, mengalir mengikuti musik. Untuk recap perjalanan, acara, behind the scene, highlight produk dari
banyak klip pendek (9:16 bawaan; 16:9/4:5 bila disepakati).

- **AI memilih momen**: tiap klip diberi skor per detik (tajam + bergerak + ada wajah), momen terbaik dipakai, tidak
  berulang. Pengguna memeriksa board (`--draft`) dan boleh mengganti potongan di `edit.json` → `montage.shots`
  (`"auto": false` = pilihan itu dihormati).
- **Potongan pada ketukan musik**: 2-4 ketukan per potongan (0,6-3,5 dtk), 4 ketukan pertama lebih lambat sebagai pembuka.
- **Urutan klip**: kronologis sesuai urutan file (`urut`, bawaan; cerita vlog tetap runtut), atau bergiliran antar-klip
  (`"order": "selang"` di edit.json) untuk montase musik yang lebih dinamis.
- **Musik** (ditanya per video): file milik pengguna (`--music=lagu.mp3`), musik ElevenLabs
  (`npm run music -- <nama> --sec=30 --prompt=... --yes`, memakai kredit), atau musik sintetis gratis.
- **Narasi**: musik saja (bawaan), atau voice over AI (`--narasi=ai`) — satu-dua potongan per kalimat (1,5-3 dtk),
  musik turun saat narasi, subtitle karaoke (kuning hangat) ditanam.
- Gerak pelan Ken Burns 6% (maju-mundur bergantian), grading hangat, sedikit lebih kontras & jenuh.
- Durasi bawaan 30 dtk (`--duration=N`), tanpa SFX.
