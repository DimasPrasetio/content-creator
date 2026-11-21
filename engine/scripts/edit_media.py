"""Analisis rekaman layar, klip montase, dan musik untuk mesin edit (dipanggil scripts/edit.mjs), tanpa kredit.

  python edit_media.py activity --src <rekaman layar.mp4> --out <activity.json> [--fps 4]
      Bagian layar yang berubah per sampel (ketikan, klik, menu terbuka, halaman berganti) untuk zoom otomatis dan
      deteksi layar diam/loading. Grid 64x36 sel; sel "berubah" bila > 4% pikselnya berbeda dari sampel sebelumnya.
      -> {fps, grid: [64, 36], w, h, n, frac: [porsi piksel berubah], cells: [[indeks sel] | "F" (layar berganti)],
          noise: [sel yang terus berubah sepanjang rekaman: jam, kursor berkedip -> diabaikan]}

  python edit_media.py moments --src <klip.mp4> --out <moments.json> [--fps 5]
      Mutu tiap sampel untuk memilih momen montase: ketajaman (variansi Laplacian), cahaya, gerak isi, guncangan kamera
      (geser global antarframe lewat korelasi fase, komponen frekuensi tinggi), potongan di dalam klip.
      -> {fps, n, dur, score: [0-1], sharp, light, motion, shake: [0-1], cut: [indeks sampel ada potongan]}

  python edit_media.py beats --audio <musik.wav> --out <beats.json>
      Ketukan musik: kekuatan onset (spectral flux), tempo (autokorelasi, prior 120 BPM), pelacakan ketukan
      (pemrograman dinamis), ketukan pertama birama (fase 4 ketukan dengan bass terkuat), energi per ketukan.
      -> {tempo, beats: [detik], downbeats: [detik], energy: [0-1 per ketukan], dur}
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from edit_analyze import frames  # noqa: E402


def probe_size(src):
    import subprocess
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", src],
                         check=True, capture_output=True, text=True).stdout
    s = json.loads(out)["streams"][0]
    return s["width"], s["height"]


def gray(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


# ---------------------------------------------------------------- rekaman layar
def cmd_activity(a):
    GX, GY, W = 64, 36, 640
    sw, sh = probe_size(a.src)
    prev, frac, cells, raw = None, [], [], []
    for fr in frames(a.src, a.fps, W):
        g = gray(fr.astype(np.float32))
        if prev is None:
            frac.append(0.0)
            cells.append([])
            raw.append(None)
            prev = g
            continue
        d = np.abs(g - prev) > 12
        prev = g
        f = float(d.mean())
        h, w = d.shape
        cy, cx = h // GY, w // GX
        m = d[: cy * GY, : cx * GX].reshape(GY, cy, GX, cx).mean(axis=(1, 3)) > 0.04
        frac.append(round(f, 4))
        if f > 0.3:  # halaman/jendela berganti atau gulir besar
            cells.append("F")
            raw.append(None)
        else:
            idx = np.flatnonzero(m.ravel())
            cells.append(idx.tolist())
            raw.append(m.ravel())
    # sel yang berubah di > 35% sampel (jam, kursor berkedip, animasi kecil yang terus jalan) dianggap derau
    rs = [r for r in raw if r is not None]
    noise = []
    if len(rs) >= 20:
        rate = np.mean(np.stack(rs), axis=0)
        noise = np.flatnonzero(rate > 0.35).tolist()
    nz = set(noise)
    cells = [c if c == "F" else [i for i in c if i not in nz] for c in cells]
    out = {"fps": a.fps, "grid": [GX, GY], "w": sw, "h": sh, "n": len(frac), "frac": frac, "cells": cells, "noise": noise}
    json.dump(out, open(a.out, "w"))
    act = sum(1 for c in cells if c == "F" or len(c) > 0)
    print(json.dumps({"samples": len(frac), "active": act, "noise": len(noise)}))


# ---------------------------------------------------------------- klip montase
def cmd_moments(a):
    import cv2
    W = 320
    prev, prevf = None, None
    sharp, light, motion, shift, cut = [], [], [], [], []
    win = None
    for k, fr in enumerate(frames(a.src, a.fps, W)):
        g = gray(fr.astype(np.float32))
        lap = cv2.Laplacian(g, cv2.CV_32F).var()
        sharp.append(float(np.clip((np.log(max(lap, 1.0)) - 3.0) / 4.0, 0, 1)))
        light.append(float(g.mean() / 255))
        if win is None:
            win = cv2.createHanningWindow((g.shape[1], g.shape[0]), cv2.CV_32F)
        if prev is None:
            motion.append(0.0)
            shift.append((0.0, 0.0))
        else:
            d = float(np.mean(np.abs(g - prev)) / 255)
            motion.append(d)
            (dx, dy), _ = cv2.phaseCorrelate(prevf, g.astype(np.float32), win)
            shift.append((float(dx), float(dy)))
            if d > 0.22:
                cut.append(k)
        prev, prevf = g, g.astype(np.float32)
    n = len(sharp)
    if not n:
        json.dump({"fps": a.fps, "n": 0, "dur": 0, "score": [], "sharp": [], "light": [], "motion": [], "shake": [], "cut": []}, open(a.out, "w"))
        print(json.dumps({"samples": 0}))
        return
    sh = np.array(shift)
    # guncangan = sisa geser setelah gerak kamera halus (rata-rata 1 dtk) dibuang
    k = max(3, int(a.fps) | 1)
    ker = np.ones(k) / k
    smooth = np.stack([np.convolve(sh[:, i], ker, mode="same") for i in range(2)], 1)
    jit = np.linalg.norm(sh - smooth, axis=1)
    shake = np.clip(np.convolve(jit, ker, mode="same") / 5.0, 0, 1)
    L = np.array(light)
    expo = 1 - np.clip(np.abs(L - 0.45) / 0.38, 0, 1)
    M = np.array(motion)
    interest = np.clip(M / 0.035, 0, 1) - np.clip((M - 0.12) / 0.1, 0, 1)  # gerak sedang paling menarik
    S = np.array(sharp)
    score = np.clip(0.42 * S + 0.25 * expo + 0.18 * interest + 0.15 - 0.55 * shake, 0, 1)
    for c in cut:  # sekitar potongan di dalam klip tidak dipakai
        score[max(0, c - 1): c + 1] = 0
    out = {"fps": a.fps, "n": n, "dur": round(n / a.fps, 2), "score": np.round(score, 3).tolist(), "sharp": np.round(S, 3).tolist(),
           "light": np.round(L, 3).tolist(), "motion": np.round(M, 4).tolist(), "shake": np.round(shake, 3).tolist(), "cut": cut}
    json.dump(out, open(a.out, "w"))
    print(json.dumps({"samples": n, "score": round(float(np.mean(score)), 3), "shake": round(float(np.mean(shake)), 3), "cuts": len(cut)}))


# ---------------------------------------------------------------- ketukan musik
def load_audio(path, sr):
    import soundfile as sf
    from scipy.signal import resample_poly
    x, r = sf.read(path, always_2d=True)
    x = x.mean(1).astype(np.float32)
    if r != sr:
        from math import gcd
        g = gcd(int(r), sr)
        x = resample_poly(x, sr // g, int(r) // g).astype(np.float32)
    return x


def cmd_beats(a):
    sr, hop, nfft = 22050, 512, 2048
    x = load_audio(a.audio, sr)
    dur = len(x) / sr
    if len(x) < nfft * 4:
        json.dump({"tempo": 0, "beats": [], "downbeats": [], "energy": [], "dur": round(dur, 3)}, open(a.out, "w"))
        print(json.dumps({"tempo": 0, "beats": 0}))
        return
    n = 1 + (len(x) - nfft) // hop
    idx = np.arange(nfft)[None, :] + hop * np.arange(n)[:, None]
    win = np.hanning(nfft).astype(np.float32)
    S = np.abs(np.fft.rfft(x[idx] * win, axis=1)) ** 2
    # 36 pita logaritmik 30 Hz-10 kHz (seperti telinga): kick/snare tidak kalah oleh hi-hat yang mengisi banyak bin tinggi
    freqs = np.fft.rfftfreq(nfft, 1 / sr)
    edges = np.geomspace(30, 10000, 37)
    bands = np.stack([S[:, (freqs >= edges[i]) & (freqs < edges[i + 1])].sum(axis=1) for i in range(36) if ((freqs >= edges[i]) & (freqs < edges[i + 1])).any()], 1)
    logS = np.log1p(1000 * bands / (bands.max() + 1e-12))
    flux = np.maximum(0, np.diff(logS, axis=0, prepend=logS[:1]))
    o = flux.mean(axis=1)
    o_low = flux[:, : max(1, int(np.searchsorted(edges, 200)))].mean(axis=1)
    fr = sr / hop
    t_of = lambda f: (f * hop + nfft / 2) / sr  # waktu = tengah jendela
    # buang tren lokal, normalisasi
    k = int(fr * 0.5) | 1
    o = np.maximum(0, o - np.convolve(o, np.ones(k) / k, mode="same"))
    o = o / (o.std() + 1e-9)
    # tempo: autokorelasi + prior log-normal di sekitar 120 BPM
    ac = np.correlate(o, o, mode="full")[len(o) - 1:]
    lags = np.arange(len(ac))
    lo, hi = int(fr * 60 / 200), int(fr * 60 / 60)
    bpm = 60 * fr / np.maximum(lags, 1)
    w = np.exp(-0.5 * (np.log2(bpm / 120) / 0.9) ** 2)
    cand = ac * w
    cand[:lo] = -np.inf
    cand[hi + 1:] = -np.inf
    L = int(np.argmax(cand))
    per = float(L)
    if 0 < L < len(ac) - 1:
        y0, y1, y2 = ac[L - 1], ac[L], ac[L + 1]
        den = y0 - 2 * y1 + y2
        if den != 0:
            per = L + 0.5 * (y0 - y2) / den
    tempo = 60 * fr / per
    # pelacakan ketukan (Ellis 2007)
    N = len(o)
    score = o.copy().astype(np.float64)
    back = np.full(N, -1)
    P = per
    alpha = 100.0
    lo_w, hi_w = int(round(P / 2)), int(round(2 * P))
    for t in range(N):
        a0, a1 = t - hi_w, t - lo_w
        if a1 < 0:
            continue
        a0 = max(0, a0)
        prev = np.arange(a0, a1 + 1)
        pen = -alpha * np.log((t - prev) / P) ** 2
        c = score[prev] + pen
        j = int(np.argmax(c))
        if c[j] > 0:
            score[t] += c[j]
            back[t] = prev[j]
    last = int(np.argmax(score[max(0, N - int(P) - 1):])) + max(0, N - int(P) - 1)
    bt = []
    t = last
    while t >= 0:
        bt.append(t)
        t = back[t]
    bt = np.array(bt[::-1])
    beats = t_of(bt)
    # isi ketukan yang hilang di awal (intro tanpa onset) mundur dengan periode
    first = []
    t0 = beats[0] - P * hop / sr if len(beats) else -1
    while t0 >= 0:
        first.append(t0)
        t0 -= P * hop / sr
    beats = np.concatenate([np.array(first[::-1]), beats])
    # ketukan pertama birama: fase (dari 4) dengan onset bass terkuat
    bf = np.clip(np.round((beats * sr - nfft / 2) / hop).astype(int), 0, N - 1)
    ph = [o_low[bf[q::4]].mean() if len(bf[q::4]) else 0 for q in range(4)]
    q = int(np.argmax(ph))
    down = beats[q::4]
    # energi per ketukan (RMS), dinormalisasi persentil
    edges = np.concatenate([beats, [dur]])
    rms = np.array([np.sqrt(np.mean(x[int(edges[i] * sr): max(int(edges[i] * sr) + 1, int(edges[i + 1] * sr))] ** 2)) for i in range(len(beats))])
    lo_e, hi_e = np.percentile(rms, 10), np.percentile(rms, 90)
    en = np.clip((rms - lo_e) / max(hi_e - lo_e, 1e-9), 0, 1)
    out = {"tempo": round(float(tempo), 2), "beats": np.round(beats, 3).tolist(), "downbeats": np.round(down, 3).tolist(), "energy": np.round(en, 3).tolist(), "dur": round(dur, 3)}
    json.dump(out, open(a.out, "w"))
    print(json.dumps({"tempo": out["tempo"], "beats": len(beats), "downbeats": len(down)}))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("activity")
    s.add_argument("--src", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--fps", type=float, default=4)
    m = sub.add_parser("moments")
    m.add_argument("--src", required=True)
    m.add_argument("--out", required=True)
    m.add_argument("--fps", type=float, default=5)
    b = sub.add_parser("beats")
    b.add_argument("--audio", required=True)
    b.add_argument("--out", required=True)
    a = ap.parse_args()
    {"activity": cmd_activity, "moments": cmd_moments, "beats": cmd_beats}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
