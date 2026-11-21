"""Analisis footage untuk mesin edit (dipanggil scripts/edit.mjs).

Pemakaian: python edit_analyze.py --src <footage ternormalisasi.mp4> --audio <audio.wav> --out <analysis.json> [--fps 10]
            [--seats N] [--centers '[[cx, cy], ...]']

Keluaran JSON:
  face   : [[t, x, y, w, h, mx, my, ex, ey, score], ...]  wajah terbesar per sampel (koordinat 0-1 frame sumber):
           kotak wajah, titik tengah mulut (mx, my), titik tengah mata (ex, ey); diisi interpolasi bila sempat hilang
  faceRate: porsi sampel yang menemukan wajah
  motion : {"cols": 4, "rows": 6, "sec": [[...24 nilai...], ...]}  energi gerak per sel per detik (tangan/badan)
  color  : statistik untuk kalibrasi grading (luma p1/p50/p99, saturasi, L* putih-netral & hitam, white balance a/b,
           kulit: L*, chroma, hue)
  audio  : noise floor & level bicara (dBFS)
  seats  : (--seats N, podcast v0.9) posisi duduk tiap orang di frame: [{cx, cy, w, h, rate}] urut kiri -> kanan; jumlahnya
           = jumlah wajah yang lazim terlihat bersamaan (maks N; --centers = pakai posisi tetap, mis. dari proyek induk)
  seatFace : per kursi, format sama dengan face (wajah orang di kursi itu per sampel)
  seatMouth: per kursi, gerak mulut per sampel (dikurangi gerak mata = gerak kepala), untuk mencocokkan pembicara
Deteksi wajah: OpenCV FaceDetectorYN + model YuNet (engine/models/, MIT), berjalan di CPU.
"""

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np

ENGINE = Path(__file__).resolve().parent.parent
MODEL = ENGINE / "models" / "face_detection_yunet_2023mar.onnx"


def frames(src, fps, width):
    """Frame RGB (uint8) hasil sampling ffmpeg pada `fps`, lebar `width`."""
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                      "-of", "json", src], check=True, capture_output=True, text=True).stdout)["streams"][0]
    w = width
    h = int(round(info["height"] * width / info["width"] / 2) * 2)
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-vf", f"fps={fps},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         stdout=subprocess.PIPE)
    n = w * h * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n:
            break
        yield np.frombuffer(b, np.uint8).reshape(h, w, 3)
    p.wait()


def srgb_lab(rgb):
    c = rgb / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = lin @ m.T / np.array([0.95047, 1, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--audio")
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=float, default=10)
    ap.add_argument("--seats", type=int, default=0)
    ap.add_argument("--centers")
    a = ap.parse_args()
    import cv2

    W = 360
    det = None
    faces, motion_sec, prev, cells = [], [], None, []
    color_samples = []
    dets = []  # per sampel: [[cx, cy, x, y, w, h, mx, my, ex, ey, score, mulut], ...] (hanya bila --seats)
    k = 0
    for img in frames(a.src, a.fps, W):
        h, w, _ = img.shape
        if det is None:
            det = cv2.FaceDetectorYN.create(str(MODEL), "", (w, h), 0.6, 0.3, 50)
        t = k / a.fps
        _, found = det.detect(cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
        if found is not None and len(found):
            f = max(found, key=lambda r: r[2] * r[3])
            x, y, fw, fh = f[:4]
            # landmark YuNet: mata kanan, mata kiri, hidung, mulut kanan, mulut kiri
            ex, ey = (f[4] + f[6]) / 2, (f[5] + f[7]) / 2
            mx, my = (f[10] + f[12]) / 2, (f[11] + f[13]) / 2
            faces.append([t, x / w, y / h, fw / w, fh / h, mx / w, my / h, ex / w, ey / h, float(f[14])])
        else:
            faces.append([t] + [None] * 9)
        # gerak: selisih abu-abu per sel 4x6 terhadap sampel sebelumnya
        g = img.mean(axis=2)
        if a.seats:
            row = []
            for f in (found if found is not None else []):
                x, y, fw, fh = [float(v) for v in f[:4]]
                ex, ey = (f[4] + f[6]) / 2, (f[5] + f[7]) / 2
                mx, my = (f[10] + f[12]) / 2, (f[11] + f[13]) / 2
                act = 0.0
                if prev is not None:
                    def box(cx, cy, hw, hh):
                        x0, x1 = int(max(0, cx - hw)), int(min(w, cx + hw))
                        y0, y1 = int(max(0, cy - hh)), int(min(h, cy + hh))
                        return float(np.abs(g[y0:y1, x0:x1] - prev[y0:y1, x0:x1]).mean()) if x1 > x0 + 1 and y1 > y0 + 1 else 0.0
                    act = max(0.0, box(mx, my, fw * 0.22, fh * 0.12) - 0.8 * box(ex, ey, fw * 0.3, fh * 0.1))
                row.append([(x + fw / 2) / w, (y + fh / 2) / h, x / w, y / h, fw / w, fh / h, mx / w, my / h, ex / w, ey / h, float(f[14]), act])
            dets.append(row)
        if prev is not None:
            d = np.abs(g - prev)
            cells.append([float(d[r * h // 6:(r + 1) * h // 6, c * w // 4:(c + 1) * w // 4].mean()) for r in range(6) for c in range(4)])
        prev = g
        if len(cells) >= a.fps:
            motion_sec.append(np.round(np.mean(cells, axis=0), 2).tolist())
            cells = []
        if k % int(a.fps * 2) == 0:
            color_samples.append((img, faces[-1]))
        k += 1
    if cells:
        motion_sec.append(np.round(np.mean(cells, axis=0), 2).tolist())

    # isi celah deteksi wajah (interpolasi linear; ujung = nilai terdekat), lalu haluskan (median 5 sampel)
    arr = np.array([[np.nan if v is None else v for v in r] for r in faces], dtype=float)
    rate = float(np.mean(~np.isnan(arr[:, 1]))) if len(arr) else 0.0
    if rate > 0:
        idx = np.arange(len(arr))
        for c in range(1, arr.shape[1]):
            ok = ~np.isnan(arr[:, c])
            arr[:, c] = np.interp(idx, idx[ok], arr[ok, c])
        from scipy.ndimage import median_filter
        for c in range(1, 9):
            arr[:, c] = median_filter(arr[:, c], size=5, mode="nearest")
    face = [[round(float(v), 4) for v in r] for r in arr] if rate > 0 else []

    seats, seat_face, seat_mouth = [], [], []
    if a.seats and dets:
        from scipy.ndimage import median_filter, uniform_filter1d
        counts = np.array([len(r) for r in dets])
        allp = np.array([[d[0], d[1]] for r in dets for d in r]) if counts.sum() else np.zeros((0, 2))
        if a.centers:
            cents = np.array(json.loads(a.centers), dtype=float).reshape(-1, 2)
        elif len(allp):
            seen = counts[counts > 0]
            kk = int(min(a.seats, max(1, round(float(np.percentile(seen, 70))))))
            if kk >= 2:
                from sklearn.cluster import KMeans
                cents = KMeans(n_clusters=kk, n_init=10, random_state=0).fit(allp * [1, 0.5]).cluster_centers_ * [1, 2]
            else:
                cents = np.median(allp, axis=0, keepdims=True)
        else:
            cents = np.zeros((0, 2))
        cents = cents[np.argsort(cents[:, 0])] if len(cents) else cents
        n = len(cents)
        tracks = np.full((n, len(dets), 10), np.nan)
        mouth = np.zeros((n, len(dets)))
        for i, row in enumerate(dets):
            tracks[:, i, 0] = i / a.fps
            # pasangan wajah-kursi terdekat lebih dulu (satu wajah satu kursi)
            pairs = sorted(((np.hypot(d[0] - cents[j][0], (d[1] - cents[j][1]) * 0.5), j, q) for q, d in enumerate(row) for j in range(n)))
            used_s, used_d = set(), set()
            for dist, j, q in pairs:
                if j in used_s or q in used_d or dist > 0.22:
                    continue
                used_s.add(j)
                used_d.add(q)
                d = row[q]
                tracks[j, i, 1:] = d[2:11]
                mouth[j, i] = d[11]
        for j in range(n):
            arr2 = tracks[j]
            ok_rate = float(np.mean(~np.isnan(arr2[:, 1])))
            if ok_rate > 0:
                idx = np.arange(len(arr2))
                for c in range(1, 10):
                    ok = ~np.isnan(arr2[:, c])
                    arr2[:, c] = np.interp(idx, idx[ok], arr2[ok, c])
                for c in range(1, 9):
                    arr2[:, c] = median_filter(arr2[:, c], size=5, mode="nearest")
            sel = arr2[~np.isnan(arr2[:, 1])]
            seats.append({"cx": round(float(cents[j][0]), 4), "cy": round(float(cents[j][1]), 4),
                          "w": round(float(np.median(sel[:, 3])), 4) if len(sel) else 0, "h": round(float(np.median(sel[:, 4])), 4) if len(sel) else 0,
                          "rate": round(ok_rate, 3)})
            seat_face.append([[round(float(v), 4) for v in r] for r in arr2] if ok_rate > 0 else [])
            seat_mouth.append(np.round(uniform_filter1d(mouth[j], size=max(1, int(a.fps / 2))), 3).tolist())

    # warna: luma, saturasi, putih-netral (L* tinggi, chroma rendah), hitam, kulit (di kotak wajah)
    # sumber tidak vertikal: statistik warna hanya di jendela 9:16 yang akan dipakai (mengikuti wajah), bukan latar di luar potongan
    if color_samples and color_samples[0][0].shape[1] / color_samples[0][0].shape[0] > 0.7:
        hh, ww, _ = color_samples[0][0].shape
        cw = int(hh * 9 / 16)
        xs = [r[1] + r[3] / 2 for r in faces if r[1] is not None]
        cx = float(np.median(xs)) * ww if xs else ww / 2
        x0 = int(min(max(0, cx - cw / 2), ww - cw))
        crop = []
        for img, f in color_samples:
            if f[1] is not None:
                f = [f[0], (f[1] * ww - x0) / cw, f[2], f[3] * ww / cw, *f[4:]]
            crop.append((img[:, x0:x0 + cw], f))
        color_samples = crop
    Ys, sats, whites, blacks, skins = [], [], [], [], []
    for img, f in color_samples:
        rgb = img.reshape(-1, 3).astype(np.float32)
        Y = (0.2126 * rgb[:, 0] + 0.7152 * rgb[:, 1] + 0.0722 * rgb[:, 2]) / 255
        Ys.append(np.percentile(Y, [1, 50, 99]))
        mx, mn = rgb.max(1), rgb.min(1)
        sats.append(float(np.mean(np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0))))
        lab = srgb_lab(rgb[:: 7])
        chroma = np.hypot(lab[:, 1], lab[:, 2])
        hi = lab[(lab[:, 0] > np.percentile(lab[:, 0], 90)) & (chroma < 12)]
        if len(hi):
            whites.append(hi.mean(0))
        lo = lab[lab[:, 0] < np.percentile(lab[:, 0], 3)]
        if len(lo):
            blacks.append(lo.mean(0))
        if f[1] is not None:
            h, w, _ = img.shape
            x0, y0 = int(f[1] * w + f[3] * w * 0.2), int(f[2] * h + f[4] * h * 0.35)
            x1, y1 = int(f[1] * w + f[3] * w * 0.8), int(f[2] * h + f[4] * h * 0.75)
            reg = img[max(0, y0):y1, max(0, x0):x1].reshape(-1, 3).astype(np.float32)
            if len(reg) > 30:
                L = srgb_lab(reg)
                L = L[(L[:, 0] > 20) & (L[:, 0] < 90)]
                if len(L) > 20:
                    skins.append([float(np.median(L[:, 0])), float(np.median(np.hypot(L[:, 1], L[:, 2]))),
                                  float(np.median(np.degrees(np.arctan2(L[:, 2], L[:, 1]))))])
    Ys = np.array(Ys) if Ys else np.zeros((1, 3))
    color = {
        "lumaP1": round(float(np.median(Ys[:, 0])), 4), "lumaP50": round(float(np.median(Ys[:, 1])), 4), "lumaP99": round(float(np.median(Ys[:, 2])), 4),
        "sat": round(float(np.median(sats)), 4) if sats else None,
        "whiteLab": np.round(np.median(whites, 0), 2).tolist() if whites else None,
        "blackLab": np.round(np.median(blacks, 0), 2).tolist() if blacks else None,
        "skin": np.round(np.median(skins, 0), 2).tolist() if skins else None,
    }

    audio = None
    if a.audio:
        import soundfile as sf
        x, sr = sf.read(a.audio, always_2d=True)
        x = x.mean(1)
        hop = int(sr * 0.05)
        rms = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) + 1e-9 for i in range(0, max(1, len(x) - hop), hop)])
        db = 20 * np.log10(rms)
        audio = {"noiseFloorDb": round(float(np.percentile(db, 10)), 1), "speechDb": round(float(np.percentile(db, 90)), 1)}

    extra = {"seats": seats, "seatFace": seat_face, "seatMouth": seat_mouth} if a.seats else {}
    Path(a.out).write_text(json.dumps({"fps": a.fps, "faceRate": round(rate, 3), "face": face,
                                       "motion": {"cols": 4, "rows": 6, "sec": motion_sec}, "color": color, "audio": audio, **extra}))
    print(json.dumps({"faceRate": round(rate, 3), "samples": len(faces), "color": color, "audio": audio, **({"seats": seats} if a.seats else {})}))


if __name__ == "__main__":
    main()
