"""Gambar PNG transparan seukuran video (bawaan 1080x1920) untuk satu potongan subtitle (dipakai posting.mjs --burn).

Pemakaian: python subtitle_png.py out.png "teks subtitle" [--y 1300] [--w 1920 --h 1080]
Teks putih tebal di kotak gelap semi-transparan, maksimal 2 baris, rata tengah, di pita y yang diberikan
(bawah konten utama, di atas area caption Reels).
"""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
FONT = str(Path(__file__).resolve().parent.parent / "fonts" / "FiraSans-Bold.ttf")  # dibawa plugin (OFL)


def wrap(draw, text, font, maxw):
    lines, cur = [], ""
    for w in text.split():
        t = f"{cur} {w}".strip()
        if draw.textlength(t, font=font) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines[:2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("text")
    ap.add_argument("--y", type=int, default=1300)
    ap.add_argument("--size", type=int, default=52)
    ap.add_argument("--w", type=int, default=W)
    ap.add_argument("--h", type=int, default=H)
    a = ap.parse_args()
    w, h = a.w, a.h
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, a.size)
    lines = wrap(d, a.text, f, min(1400, w - 220))
    lh = int(a.size * 1.25)
    tw = max(d.textlength(l, font=f) for l in lines)
    bw, bh = int(tw + 56), lh * len(lines) + 28
    x0 = (w - bw) // 2
    d.rounded_rectangle([x0, a.y, x0 + bw, a.y + bh], radius=22, fill=(10, 10, 16, 190))
    for i, l in enumerate(lines):
        d.text((w / 2, a.y + 14 + lh * i + lh / 2), l, font=f, fill=(255, 255, 255, 255), anchor="mm")
    img.save(a.out)


if __name__ == "__main__":
    main()
