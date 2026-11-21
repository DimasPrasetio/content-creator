"""Alat podcast untuk mesin edit (dipanggil scripts/edit.mjs), tanpa kredit dan tanpa internet.

  python edit_podcast.py sync --ref <audio master.wav> --other <audio kamera.wav>
      -> {"offset": detik, "score": 0-1}
      Sinkron kamera dari suara: korelasi silang selubung energi (5 ms). offset = waktu master - waktu kamera
      (positif: kamera mulai merekam setelah master), jadi waktu kamera = waktu master - offset.

  python edit_podcast.py diarize --audio <wav> --words <words.json> --n <jumlah pembicara|0> --out <words.json>
      -> kata yang sama + "spk" (S0, S1, ...). Cadangan lokal bila transkrip tidak membawa pembicara: potongan ucapan
      (dipisah jeda/tanda baca, 0,8-6 dtk) diubah jadi sidik suara (resemblyzer), dikelompokkan (aglomeratif kosinus,
      n pembicara; n=0 = ditebak dari jarak, maks 4), lalu dihaluskan (potongan < 0,8 dtk ikut tetangganya).
"""

import argparse
import json
import sys

import numpy as np


def load(path, sr):
    import soundfile as sf
    from scipy.signal import resample_poly
    x, r = sf.read(path, always_2d=True)
    x = x.mean(1).astype(np.float32)
    if r != sr:
        from math import gcd
        g = gcd(int(r), sr)
        x = resample_poly(x, sr // g, int(r) // g).astype(np.float32)
    return x


def envelope(x, sr, hop):
    n = len(x) // hop
    e = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-10)
    e = np.log(e)
    e = e - np.median(e)
    e = np.clip(e, -3, None)  # hening tidak ikut menentukan
    d = np.diff(e, prepend=e[:1])  # perubahan energi (awal suku kata) lebih tajam dari energi
    d = np.maximum(d, 0)
    return (d - d.mean()) / (d.std() + 1e-9)


def cmd_sync(a):
    from scipy.signal import fftconvolve
    sr, hop = 16000, 80  # 5 ms
    ref, oth = load(a.ref, sr), load(a.other, sr)
    er, eo = envelope(ref, sr, hop), envelope(oth, sr, hop)
    c = fftconvolve(er, eo[::-1], mode="full")
    lags = np.arange(-(len(eo) - 1), len(er))
    # normalisasi kasar menurut panjang tumpang-tindih agar ujung tidak menang karena kebetulan
    ov = np.minimum(len(er), lags + len(eo)) - np.maximum(0, lags)
    ok = ov > min(len(er), len(eo)) * 0.25
    c = np.where(ok, c / np.maximum(ov, 1), -np.inf)
    k = int(np.argmax(c))
    best = c[k]
    # skor: puncak dibanding sebaran korelasi lain (jauh dari puncak)
    far = c[ok & (np.abs(lags - lags[k]) > 40)]
    score = float((best - far.mean()) / (far.std() + 1e-9)) if len(far) else 0.0
    # perhalus lag dengan parabola 3 titik
    lag = float(lags[k])
    if 0 < k < len(c) - 1 and np.isfinite(c[k - 1]) and np.isfinite(c[k + 1]):
        y0, y1, y2 = c[k - 1], c[k], c[k + 1]
        den = y0 - 2 * y1 + y2
        if den != 0:
            lag += 0.5 * (y0 - y2) / den
    print(json.dumps({"offset": round(lag * hop / sr, 4), "score": round(min(1.0, score / 12), 3), "z": round(score, 1)}))


def chunks_of(words, maxlen=6.0):
    out, cur = [], []
    for i, w in enumerate(words):
        if cur and (w["s"] - words[cur[-1]]["e"] > 0.3 or w["e"] - words[cur[0]]["s"] > maxlen):
            out.append(cur)
            cur = []
        cur.append(i)
        if str(w["w"]).rstrip()[-1:] in ".?!":
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def cmd_diarize(a):
    from resemblyzer import VoiceEncoder
    from sklearn.cluster import AgglomerativeClustering
    words = json.load(open(a.words))
    ws = words["words"] if isinstance(words, dict) else words
    sr = 16000
    x = load(a.audio, sr)
    ch = chunks_of(ws)
    enc = VoiceEncoder("cpu", verbose=False)
    embs, idx = [], []
    for k, c in enumerate(ch):
        s, e = ws[c[0]]["s"], ws[c[-1]]["e"]
        if e - s < 0.8:
            continue
        seg = x[int(max(0, s - 0.05) * sr): int((e + 0.05) * sr)]
        embs.append(enc.embed_utterance(seg))
        idx.append(k)
    labels = [None] * len(ch)
    if len(embs) >= 2:
        E = np.array(embs)
        n = int(a.n)
        if n >= 2:
            cl = AgglomerativeClustering(n_clusters=min(n, len(E)), metric="cosine", linkage="average")
        else:
            cl = AgglomerativeClustering(n_clusters=None, metric="cosine", linkage="average", distance_threshold=0.35)
        lab = cl.fit_predict(E)
        if n < 2 and lab.max() >= 4:  # tebakan kebanyakan: paksa 4
            lab = AgglomerativeClustering(n_clusters=4, metric="cosine", linkage="average").fit_predict(E)
        for k, l in zip(idx, lab):
            labels[k] = int(l)
    elif embs:
        labels[idx[0]] = 0
    # potongan pendek ikut tetangga terdekat (waktu)
    known = [k for k, l in enumerate(labels) if l is not None]
    for k, l in enumerate(labels):
        if l is None:
            labels[k] = labels[min(known, key=lambda j: abs(j - k))] if known else 0
    # urutkan label menurut kemunculan pertama -> S0, S1, ...
    order = {}
    for l in labels:
        order.setdefault(l, len(order))
    for k, c in enumerate(ch):
        for i in c:
            ws[i]["spk"] = f"S{order[labels[k]]}"
    out = {**words, "words": ws} if isinstance(words, dict) else ws
    json.dump(out, open(a.out, "w"))
    print(json.dumps({"speakers": len(order), "chunks": len(ch), "embedded": len(embs)}))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sync")
    s.add_argument("--ref", required=True)
    s.add_argument("--other", required=True)
    d = sub.add_parser("diarize")
    d.add_argument("--audio", required=True)
    d.add_argument("--words", required=True)
    d.add_argument("--n", default="0")
    d.add_argument("--out", required=True)
    a = ap.parse_args()
    {"sync": cmd_sync, "diarize": cmd_diarize}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
