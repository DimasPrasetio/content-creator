"""Alat analisis audio untuk pipeline video.

Pemakaian:
  python audio_tools.py words <wav> [--lang id]          -> JSON kata + timestamp (faster-whisper; model opsional)
  python audio_tools.py pitch <wav> <start:end> ...      -> JSON nada (F0 median) & rasio voiced per segmen (detik)
  python audio_tools.py speaker <ref.wav> <wav> <start:end> ... -> kemiripan suara (cosine) tiap segmen vs referensi
  python audio_tools.py prosody <wav> [--lang id] [--no-asr] -> ekspresi: variasi nada (semitone), kejelasan kata (whisper), tempo
  python audio_tools.py score <ref.wav> <wav> [--lang id]  -> nilai satu take (kejelasan, ekspresi, kemiripan) untuk memilih take terbaik
  python audio_tools.py onset <wav> <start:end> ...        -> formant F1/F2 di awal segmen (cek bunyi vokal, mis. "E Ai" vs "A-i")
  python audio_tools.py quiet <wav> <start:end> ...        -> detik paling hening (RMS 20 ms) di tiap rentang
"""

import os as _os
_os.environ["PATH"] = _os.pathsep.join([_os.path.expanduser("~/.local/share/content-creator/tools/bin"), _os.path.expanduser("~/.local/bin"), _os.environ.get("PATH", "")])


import json
import sys

import numpy as np
import soundfile as sf

ASR_MODEL = "deepdml/faster-whisper-large-v3-turbo-ct2"


def load16k(path: str) -> np.ndarray:
    """Audio mono 16 kHz float32 lewat ffmpeg (menghindari dekoder av)."""
    import subprocess

    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def words(path: str, lang: str = "id", prompt: str | None = None) -> list[dict]:
    from faster_whisper import WhisperModel

    model = WhisperModel(ASR_MODEL, device="cpu", compute_type="int8")
    segments, _ = model.transcribe(
        load16k(path),
        language=lang,
        word_timestamps=True,
        vad_filter=False,
        beam_size=5,
        initial_prompt=prompt,
        condition_on_previous_text=False,
    )
    out = []
    for seg in segments:
        for w in seg.words or []:
            out.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
    return out


def _f0(frame: np.ndarray, sr: int) -> float | None:
    """F0 lewat autokorelasi; None bila frame tidak bersuara (unvoiced/hening)."""
    frame = frame - frame.mean()
    energy = float(np.sqrt(np.mean(frame**2)))
    if energy < 0.01:
        return None
    ac = np.correlate(frame, frame, mode="full")[len(frame) - 1 :]
    lo, hi = int(sr / 400), int(sr / 60)
    if hi >= len(ac):
        return None
    lag = lo + int(np.argmax(ac[lo:hi]))
    if ac[0] <= 0 or ac[lag] / ac[0] < 0.45:
        return None
    return sr / lag


def pitch(path: str, ranges: list[tuple[float, float]]) -> list[dict]:
    data, sr = sf.read(path, always_2d=True)
    mono = data.mean(axis=1)
    win, hop = int(0.04 * sr), int(0.01 * sr)
    res = []
    for a, b in ranges:
        seg = mono[int(a * sr) : int(b * sr)]
        f0s, active = [], 0
        for i in range(0, max(0, len(seg) - win), hop):
            fr = seg[i : i + win]
            if np.sqrt(np.mean(fr**2)) >= 0.01:
                active += 1
                f = _f0(fr, sr)
                if f:
                    f0s.append(f)
        res.append(
            {
                "range": [a, b],
                "f0_median": round(float(np.median(f0s)), 1) if f0s else None,
                "voiced_ratio": round(len(f0s) / active, 2) if active else 0.0,
                "rms_db": round(float(20 * np.log10(np.sqrt(np.mean(seg**2)) + 1e-9)), 1) if len(seg) else None,
            }
        )
    return res


def onset(path: str, ranges: list[tuple[float, float]]) -> list[list[int] | None]:
    """F1/F2 median pada 30% awal tiap segmen. Vokal depan /e/ punya F2 tinggi (> ~1450 Hz), /a/ lebih rendah."""
    from scipy.linalg import solve_toeplitz
    from scipy.signal import resample_poly

    x, sr = sf.read(path, always_2d=True)
    x = resample_poly(x.mean(axis=1), 8000, sr)
    sr = 8000

    def formants(seg):
        seg = seg * np.hamming(len(seg))
        seg = np.append(seg[0], seg[1:] - 0.63 * seg[:-1])
        order = 2 + sr // 1000
        r = np.correlate(seg, seg, "full")[len(seg) - 1 : len(seg) + order]
        a = np.concatenate([[1], -solve_toeplitz(r[:-1], r[1:])])
        roots = [z for z in np.roots(a) if np.imag(z) >= 0]
        fr = sorted(
            f
            for f, bw in ((np.angle(z) * sr / (2 * np.pi), -0.5 * sr / np.pi * np.log(abs(z))) for z in roots)
            if f > 200 and bw < 400
        )
        return fr[:2]

    out = []
    for a, b in ranges:
        fs = []
        for t in np.arange(a, a + 0.3 * (b - a), 0.01):
            seg = x[int(t * sr) : int((t + 0.025) * sr)]
            if len(seg) > 100 and np.sqrt(np.mean(seg**2)) > 0.01:
                f = formants(seg)
                if len(f) == 2:
                    fs.append(f)
        out.append([int(v) for v in np.median(fs, axis=0)] if fs else None)
    return out


def speaker(ref: str, path: str, ranges: list[tuple[float, float]]) -> list[float]:
    """Kemiripan pembicara (embedding GE2E Resemblyzer); >= 0.80 umumnya orang yang sama."""
    from resemblyzer import VoiceEncoder, preprocess_wav

    enc = VoiceEncoder("cpu", verbose=False)
    ref_emb = enc.embed_utterance(preprocess_wav(load16k(ref), source_sr=16000))
    audio = load16k(path)
    out = []
    for a, b in ranges:
        seg = preprocess_wav(audio[int(a * 16000) : int(b * 16000)], source_sr=16000)
        if len(seg) < 16000 * 0.8:
            out.append(None)
            continue
        e = enc.embed_utterance(seg)
        out.append(round(float(np.dot(ref_emb, e) / (np.linalg.norm(ref_emb) * np.linalg.norm(e))), 3))
    return out


def prosody(path: str, lang: str = "id", asr: bool = True) -> dict:
    """Ukuran 'hidup'-nya suara: variasi nada (st), rentang nada, kejelasan ASR, kata per detik."""
    data, sr = sf.read(path, always_2d=True)
    x = data.mean(axis=1)
    win, hop = int(0.04 * sr), int(0.01 * sr)
    f0 = [f for i in range(0, len(x) - win, hop) if (f := _f0(x[i : i + win], sr))]
    st = 12 * np.log2(np.array(f0) / np.median(f0)) if f0 else np.array([0.0])
    dur = len(x) / sr
    if not asr:
        return {"pitch_std_st": round(float(np.std(st)), 2), "pitch_range_st": round(float(np.percentile(st, 90) - np.percentile(st, 10)), 2)}
    ws = words(path, lang)
    return {
        "pitch_std_st": round(float(np.std(st)), 2),
        "pitch_range_st": round(float(np.percentile(st, 90) - np.percentile(st, 10)), 2),
        "asr_prob_mean": round(float(np.mean([w["p"] for w in ws])), 3) if ws else 0,
        "asr_prob_low": sum(1 for w in ws if w["p"] < 0.5),
        "words_per_sec": round(len(ws) / dur, 2),
        "text": " ".join(w["w"] for w in ws),
    }


if __name__ == "__main__":
    cmd, path = sys.argv[1], sys.argv[2]
    if cmd == "words":
        lang = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv else "id"
        prompt = sys.argv[sys.argv.index("--prompt") + 1] if "--prompt" in sys.argv else None
        print(json.dumps(words(path, lang, prompt), ensure_ascii=False))
    elif cmd == "pitch":
        rs = [tuple(map(float, r.split(":"))) for r in sys.argv[3:]]
        print(json.dumps(pitch(path, rs)))
    elif cmd == "prosody":
        lang = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv else "id"
        print(json.dumps(prosody(path, lang, "--no-asr" not in sys.argv), ensure_ascii=False))
    elif cmd == "score":
        lang = sys.argv[sys.argv.index("--lang") + 1] if "--lang" in sys.argv else "id"
        take = sys.argv[3]
        pr = prosody(take, lang)
        dur = sf.info(take).duration
        sim = speaker(path, take, [(0.0, dur)])[0] or 0.0
        # kejelasan paling penting, lalu kemiripan suara, lalu ekspresi (dibatasi agar tidak memilih take aneh)
        score = pr["asr_prob_mean"] * 10 - pr["asr_prob_low"] * 0.4 + sim * 6 + min(pr["pitch_std_st"], 4.5) * 0.8
        print(json.dumps({**{k: v for k, v in pr.items() if k != "text"}, "similarity": sim, "score": round(score, 3)}))
    elif cmd == "quiet":
        data, sr = sf.read(path, always_2d=True)
        x = data.mean(axis=1)
        w = int(0.02 * sr)
        res = []
        for r in sys.argv[3:]:
            a, b = map(float, r.split(":"))
            seg = x[int(a * sr) : int(b * sr)]
            if len(seg) <= w:
                res.append(round((a + b) / 2, 4))
                continue
            e = np.convolve(seg**2, np.ones(w) / w, mode="valid")
            res.append(round(a + (int(np.argmin(e)) + w / 2) / sr, 4))
        print(json.dumps(res))
    elif cmd == "onset":
        rs = [tuple(map(float, r.split(":"))) for r in sys.argv[3:]]
        print(json.dumps(onset(path, rs)))
    elif cmd == "speaker":
        rs = [tuple(map(float, r.split(":"))) for r in sys.argv[4:]]
        print(json.dumps(speaker(path, sys.argv[3], rs)))

