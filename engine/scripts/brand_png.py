"""Overlay brand pojok atas (transparan 1080x1920) untuk video motion-graphics-v4.

Pemakaian: python brand_png.py '<json brand>' out.png
brand: {"left": "...", "right": "...", "logoLeft": "x.png", "logoRight": "..."}  (logo di Engine/public/brand/, sama seperti komposisi lain)
Teks/logo diletakkan di dalam chip gelap semi-transparan agar terbaca di tema terang maupun gelap,
di pita atas y 52-114 (di luar area konten motion-graphics-v4 yang aman mulai y 250).
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
TOP, PAD_X, CHIP_H = 52, 64, 62
PUBLIC = Path(__file__).resolve().parent.parent / "public"
FONT = str(Path(__file__).resolve().parent.parent / "fonts" / "FiraSans-Black.ttf")  # dibawa plugin (OFL), sama di macOS & Linux


def chip(img, draw, x, align, text=None, logo=None):
    font = ImageFont.truetype(FONT, 27)
    content = None
    if logo:
        p = Path(logo) if Path(logo).is_absolute() else PUBLIC / "brand" / logo
        if p.exists():
            content = Image.open(p).convert("RGBA")
            content.thumbnail((360, CHIP_H - 20))
    if content is None and text:
        tw = draw.textlength(text, font=font) + 3 * (len(text) - 1)
        content = ("text", tw)
    if content is None:
        return
    cw = content[1] if isinstance(content, tuple) else content.width
    w = int(cw + 48)
    x0 = x if align == "left" else x - w
    draw.rounded_rectangle([x0, TOP, x0 + w, TOP + CHIP_H], radius=CHIP_H // 2, fill=(12, 12, 20, 170))
    if isinstance(content, tuple):
        cx = x0 + 24
        for ch in text:  # tracking manual
            draw.text((cx, TOP + CHIP_H / 2), ch, font=font, fill=(255, 255, 255, 255), anchor="lm")
            cx += draw.textlength(ch, font=font) + 3
    else:
        img.alpha_composite(content, (x0 + 24, TOP + (CHIP_H - content.height) // 2))


def main(brand_json, out):
    b = json.loads(brand_json or "{}")
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    chip(img, d, PAD_X, "left", b.get("left"), b.get("logoLeft"))
    chip(img, d, W - PAD_X, "right", b.get("right"), b.get("logoRight"))
    img.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
