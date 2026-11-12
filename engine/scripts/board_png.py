"""Papan perbandingan gaya: beberapa PNG berdampingan dengan label nama di atasnya.

Pemakaian: python board_png.py out.png "Label 1=path1.png" "Label 2=path2.png" ...
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT = str(Path(__file__).resolve().parent.parent / "fonts" / "FiraSans-Black.ttf")  # dibawa plugin (OFL)


def main(out, items):
    pairs = [x.split("=", 1) for x in items]
    ims = [Image.open(p).convert("RGB") for _, p in pairs]
    th = 360  # tinggi tiap tile
    tiles = [im.resize((int(im.width * th / im.height), th)) for im in ims]
    cols = min(3, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    cw = max(t.width for t in tiles)
    lab = 44
    board = Image.new("RGB", (cw * cols + 16 * (cols + 1), (th + lab) * rows + 16 * (rows + 1)), (24, 24, 28))
    d = ImageDraw.Draw(board)
    f = ImageFont.truetype(FONT, 24)
    for i, (t, (label, _)) in enumerate(zip(tiles, pairs)):
        x = 16 + (i % cols) * (cw + 16)
        y = 16 + (i // cols) * (th + lab + 16)
        d.text((x, y + lab / 2), f"{i + 1}. {label}", font=f, fill=(255, 255, 255), anchor="lm")
        board.paste(t, (x, y + lab))
    board.save(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
