"""Deteksi momen "layar kosong" di zona visual sebuah video (tanpa objek visual berarti).

Pemakaian: python visual_gaps.py <video.mp4> [--y0 250 --y1 1250] [--x0 0 --x1 1080] [--fps 10] [--min 0.4] [--json]
- Zona visual (bawaan y 250-1250 pada 1080x1920, di atas kotak subtitle) diperkecil 4x, tiap frame dihitung "tinta":
  piksel yang bedanya > ambang dari warna latar (median frame; grid tipis & glow latar tidak terhitung).
- Frame dengan tinta < --ink (bawaan 0,25% zona) = kosong. Rentang kosong >= --min detik dilaporkan.
- Zona dibagi 4 pita mendatar; separuh atas (pita 1-2) atau separuh bawah (pita 3-4) tanpa tinta = "separuh kosong"
  (mis. hanya judul di atas, bawah menunggu kata). Rentang separuh kosong >= --half detik dilaporkan.
Keluaran: ringkasan + daftar rentang; --json untuk mesin (produce.mjs).
"""
import argparse
import json
import subprocess
import sys

import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--y0", type=int, default=250)
    ap.add_argument("--y1", type=int, default=1250)
    ap.add_argument("--x0", type=int, default=0)
    ap.add_argument("--x1", type=int, default=1080)
    ap.add_argument("--fps", type=int, default=10)
    ap.add_argument("--min", type=float, default=0.4)
    ap.add_argument("--ink", type=float, default=0.0025)
    ap.add_argument("--half", type=float, default=1.0)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    w, h = (a.x1 - a.x0) // 4, (a.y1 - a.y0) // 4
    cmd = ["ffmpeg", "-v", "error", "-i", a.video, "-vf", f"fps={a.fps},crop={a.x1 - a.x0}:{a.y1 - a.y0}:{a.x0}:{a.y0},scale={w}:{h}:flags=area,format=gray",
           "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.int16)
    ink, half = [], []
    q = h // 4
    for f in fr:
        m = np.abs(f - np.median(f)) > 38
        ink.append(float(m.mean()))
        bands = [m[i * q:(i + 1) * q].mean() > 0.004 for i in range(4)]
        half.append(not (bands[0] or bands[1]) or not (bands[2] or bands[3]))
    ink = np.array(ink)
    empty = ink < a.ink

    def runs(mask, minimum):
        out, start = [], None
        for i, e in enumerate(list(mask) + [False]):
            if e and start is None:
                start = i
            elif not e and start is not None:
                s, t = start / a.fps, i / a.fps
                if t - s >= minimum:
                    out.append([round(s, 2), round(t, 2)])
                start = None
        return out

    gaps = runs(empty, a.min)
    halves = runs([hf and not e for hf, e in zip(half, empty)], a.half)
    total = len(ink) / a.fps
    kosong = sum(t - s for s, t in gaps)
    res = {"duration": round(total, 2), "empty_seconds": round(kosong, 2), "empty_ratio": round(kosong / total, 3) if total else 0,
           "gaps": gaps, "half_empty": halves}
    if a.json:
        print(json.dumps(res))
    else:
        print(f"Layar kosong: {res['empty_seconds']} dtk dari {res['duration']} dtk ({res['empty_ratio'] * 100:.0f}%), {len(gaps)} rentang >= {a.min} dtk")
        for s, t in gaps:
            print(f"  kosong   {s:6.2f} - {t:6.2f}  ({t - s:.1f} dtk)")
        for s, t in halves:
            print(f"  separuh  {s:6.2f} - {t:6.2f}  ({t - s:.1f} dtk)")


if __name__ == "__main__":
    sys.exit(main())
