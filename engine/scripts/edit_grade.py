"""Ukur hasil rantai grading ffmpeg pada frame contoh (untuk kalibrasi berulang di scripts/edit.mjs).

Pemakaian: python edit_grade.py --src <video> --chain "<filter ffmpeg>" --times 1.2,4.5,... [--window x0,w] [--faces json]
Keluaran JSON: luma p1/p50/p99, saturasi rata-rata, chroma & hue kulit (median di kotak wajah tiap frame).
--window: jendela horizontal (piksel sumber) yang akan dipotong 9:16 (sumber tidak vertikal); --faces: [[x,y,w,h] 0-1 per waktu].
"""

import argparse
import json
import subprocess

import numpy as np

from edit_analyze import srgb_lab


def grab(src, t, chain, width=360):
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", src],
                                     check=True, capture_output=True, text=True).stdout)["streams"][0]
    h = int(round(info["height"] * width / info["width"] / 2) * 2)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", src, "-frames:v", "1", "-vf", f"{chain},scale={width}:{h},format=rgb24",
                          "-f", "rawvideo", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(h, width, 3), info["width"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--chain", required=True)
    ap.add_argument("--times", required=True)
    ap.add_argument("--window")
    ap.add_argument("--faces")
    a = ap.parse_args()
    times = [float(x) for x in a.times.split(",") if x]
    faces = json.loads(a.faces) if a.faces else [None] * len(times)
    Ys, sats, skins = [], [], []
    for t, f in zip(times, faces):
        img, srcw = grab(a.src, t, a.chain)
        h, w, _ = img.shape
        x0, cw = 0, w
        if a.window:
            wx, ww = [float(v) for v in a.window.split(",")]
            x0, cw = int(wx * w / srcw), int(ww * w / srcw)
            img = img[:, x0:x0 + cw]
        rgb = img.reshape(-1, 3).astype(np.float32)
        Y = (0.2126 * rgb[:, 0] + 0.7152 * rgb[:, 1] + 0.0722 * rgb[:, 2]) / 255
        Ys.append(np.percentile(Y, [1, 50, 99]))
        mx, mn = rgb.max(1), rgb.min(1)
        sats.append(float(np.mean(np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0))))
        if f:
            fx, fy, fw, fh = f
            X0, Y0 = int((fx * w - x0) + fw * w * 0.2), int(fy * h + fh * h * 0.35)
            X1, Y1 = int((fx * w - x0) + fw * w * 0.8), int(fy * h + fh * h * 0.75)
            reg = img[max(0, Y0):Y1, max(0, X0):X1].reshape(-1, 3).astype(np.float32)
            if len(reg) > 30:
                L = srgb_lab(reg)
                L = L[(L[:, 0] > 20) & (L[:, 0] < 90)]
                if len(L) > 20:
                    skins.append([float(np.median(np.hypot(L[:, 1], L[:, 2]))), float(np.median(np.degrees(np.arctan2(L[:, 2], L[:, 1]))))])
    Ys = np.array(Ys)
    print(json.dumps({"lumaP1": round(float(np.median(Ys[:, 0])), 4), "lumaP50": round(float(np.median(Ys[:, 1])), 4),
                      "lumaP99": round(float(np.median(Ys[:, 2])), 4), "sat": round(float(np.median(sats)), 4),
                      "skinChroma": round(float(np.median([s[0] for s in skins])), 2) if skins else None,
                      "skinHue": round(float(np.median([s[1] for s in skins])), 1) if skins else None}))


if __name__ == "__main__":
    main()
