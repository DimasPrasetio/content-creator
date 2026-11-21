"""Overlay brand pojok atas (transparan 1080x1920) untuk video motion-graphics-v4.

Pemakaian: python brand_png.py '<json brand>' out.png ['<json kanvas>']
kanvas (opsional, v0.8): {"w":1920,"h":1080,"brand":{"top":54,"left":96,"right":96,"h":50,"font":24}} dari FORMATS di lib.mjs;
tanpa kanvas = 1080x1920 TikTok seperti di bawah.
brand: {"left": "...", "right": "...", "logoLeft": "x.png", "logoRight": "..."}  (logo di Engine/public/brand/, sama seperti komposisi lain)
Teks/logo diletakkan di dalam chip gelap semi-transparan agar terbaca di tema terang maupun gelap,
di pita atas zona aman TikTok y 226-276 (di bawah tab "Mengikuti/Untuk Anda"); chip kanan berakhir di x 940
(kolom tombol TikTok di kanannya). Lihat zona aman di engine/kit/html/README.md.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
TOP, PAD_L, PAD_R, CHIP_H, FONT_SIZE = 226, 64, 140, 50, 24
PUBLIC = Path(__file__).resolve().parent.parent / "public"
FONT = str(Path(__file__).resolve().parent.parent / "fonts" / "FiraSans-Black.ttf")  # dibawa plugin (OFL), sama di macOS & Linux


def chip(img, draw, x, align, text=None, logo=None):
    font = ImageFont.truetype(FONT, FONT_SIZE)
    content = None
    if logo:
        p = Path(logo) if Path(logo).is_absolute() else PUBLIC / "brand" / logo
        if p.exists():
            content = Image.open(p).convert("RGBA")
            content.thumbnail((320, CHIP_H - 16))
    if content is None and text:
        tw = draw.textlength(text, font=font) + 3 * (len(text) - 1)
        content = ("text", tw)
    if content is None:
        return
    cw = content[1] if isinstance(content, tuple) else content.width
    w = int(cw + 40)
    x0 = x if align == "left" else x - w
    draw.rounded_rectangle([x0, TOP, x0 + w, TOP + CHIP_H], radius=CHIP_H // 2, fill=(12, 12, 20, 170))
    if isinstance(content, tuple):
        cx = x0 + 20
        for ch in text:  # tracking manual
            draw.text((cx, TOP + CHIP_H / 2), ch, font=font, fill=(255, 255, 255, 255), anchor="lm")
            cx += draw.textlength(ch, font=font) + 3
    else:
        img.alpha_composite(content, (x0 + 20, TOP + (CHIP_H - content.height) // 2))


def main(brand_json, out, canvas_json=None):
    global W, H, TOP, PAD_L, PAD_R, CHIP_H, FONT_SIZE
    c = json.loads(canvas_json or "{}")
    if c:
        bb = c.get("brand", {})
        W, H = int(c.get("w", W)), int(c.get("h", H))
        TOP, PAD_L, PAD_R, CHIP_H, FONT_SIZE = bb.get("top", TOP), bb.get("left", PAD_L), bb.get("right", PAD_R), bb.get("h", CHIP_H), bb.get("font", FONT_SIZE)
    b = json.loads(brand_json or "{}")
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    chip(img, d, PAD_L, "left", b.get("left"), b.get("logoLeft"))
    chip(img, d, W - PAD_R, "right", b.get("right"), b.get("logoRight"))
    img.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
