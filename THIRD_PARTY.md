# Komponen pihak ketiga

| Komponen | Lokasi | Lisensi |
|---|---|---|
| motion-graphics-skills (brand-intake, motion-brief-writer, reference-to-motion, motion-prompt-writer, launch-video, apple-launch-film, vox-explainer, animated-chart, milestone-reveal, motion-effects, title-sequence-3d, model-showdown, newsletter-promo, loop-cover, reel-export) oleh Charlie Hills, https://github.com/charlie947/motion-graphics-skills | `skills/<nama>/` (disalin apa adanya, `LICENSE.txt` di tiap folder) | MIT |
| Teknik kamera & motion blur sub-frame dari skill explainer-default di [motion-graphics](https://github.com/Barty-Bart/motion-graphics) oleh Barty-Bart | `engine/kit/html/kit-camera.js`, `engine/scripts/html_render.py` (ditulis ulang, tidak disalin) | MIT |
| Fira Sans (Mozilla / Telefonica) | `engine/fonts/FiraSans-*.ttf` | SIL Open Font License 1.1 (`engine/fonts/OFL-FiraSans.txt`) |
| Anton (The Anton Project Authors) | `engine/fonts/Anton-Regular.ttf` | SIL Open Font License 1.1 (`engine/fonts/OFL-Anton.txt`) |

## Tidak dibundel (pasang sendiri bila ingin dipakai)

| Komponen | Dipakai untuk | Catatan |
|---|---|---|
| Skill `motion-graphics-v4` (Anthropic) | jalur B | Tidak didistribusikan di repo ini. Bila terpasang (mis. `~/.claude/skills/motion-graphics-v4`), mesin mendeteksinya otomatis. |
| Skill `pop-cinematic-motion` (Anthropic) | arahan seni jalur A | Opsional. Pustaka & komposisi Pop di `engine/src/pop` ditulis sendiri dan sudah ikut. |

## Dependensi dengan ketentuan sendiri
- **Remotion** (render komposisi Video/Pop) memakai [Remotion License](https://www.remotion.dev/license): gratis untuk individu
  dan perusahaan kecil; organisasi yang lebih besar wajib membeli lisensi perusahaan. Pastikan Anda memenuhi ketentuannya.
- **ElevenLabs**, **Google Drive**, **TikTok**: pemakaian layanan mengikuti ketentuan masing-masing penyedia dan akun Anda.
