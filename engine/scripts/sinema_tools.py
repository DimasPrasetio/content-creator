"""Alat bantu mode film (style Sinema): analisis film panjang tanpa transkrip + mixer audio.

Pemakaian (dipanggil scripts/sinema.mjs):
  python sinema_tools.py analyze --film F --out DIR [--step 5] [--sheets DIR]
      -> DIR/analysis.json: {dur, w, h, active:{x,y,w,h}, cuts:[detik], sec:[{t, rms, speech, motion, bright}],
         windows:{dialog:[...], aksi:[...]}} + lembar kontak (48 frame/lembar, label h:mm:ss) di --sheets
  python sinema_tools.py sheet --film F --times 12.5,14,15.5 --out sheet.jpg [--crop x:y:w:h]
      -> satu lembar kontak dari detik tertentu (memeriksa adegan lebih rapat)
  python sinema_tools.py mix --spec spec.json
      -> wav akhir (film per potongan + duck + narasi + musik ber-envelope, loudness ternormalisasi)
Tanpa biaya: hanya ffmpeg + numpy (+ webrtcvad untuk rasio ucapan).
"""

import argparse
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = str(Path(__file__).resolve().parent.parent / "fonts" / "FiraSans-Bold.ttf")


def hms(t):
    t = max(0, t)
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:04.1f}"


def probe(film):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,color_transfer:format=duration", "-of", "json", film],
                         capture_output=True, text=True, check=True).stdout
    j = json.loads(out)
    s = j["streams"][0]
    return {"dur": float(j["format"]["duration"]), "w": int(s["width"]), "h": int(s["height"]),
            "hdr": s.get("color_transfer") in ("smpte2084", "arib-std-b67")}


def crop_detect(film, dur, w, h):
    """Area gambar aktif (tanpa letterbox): gabungan cropdetect di 12 titik."""
    xs, ys, x2s, y2s = [], [], [], []
    for t in np.linspace(dur * 0.06, dur * 0.94, 12):
        r = subprocess.run(["ffmpeg", "-hide_banner", "-ss", f"{t:.2f}", "-i", film, "-frames:v", "20",
                            "-vf", "cropdetect=24:2:0", "-an", "-f", "null", "-"], capture_output=True, text=True)
        m = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", r.stderr)
        if not m:
            continue
        cw, ch, cx, cy = map(int, m[-1])
        if cw < w * 0.3 or ch < h * 0.3:  # frame gelap: abaikan
            continue
        xs.append(cx); ys.append(cy); x2s.append(cx + cw); y2s.append(cy + ch)
    if not xs:
        return {"x": 0, "y": 0, "w": w, "h": h}
    x, y, x2, y2 = min(xs), min(ys), max(x2s), max(y2s)
    return {"x": x, "y": y, "w": (x2 - x) // 2 * 2, "h": (y2 - y) // 2 * 2}


def norm(a):
    a = np.asarray(a, dtype=np.float64)
    lo, hi = np.percentile(a, 5), np.percentile(a, 95)
    return np.clip((a - lo) / (hi - lo + 1e-9), 0, 1)


def contact_sheet(frames, labels, out, cols=6, tw=320):
    if not frames:
        return
    ims = [Image.open(f).convert("RGB") if isinstance(f, (str, Path)) else f for f in frames]
    th = int(ims[0].height * tw / ims[0].width)
    lab = 26
    rows = math.ceil(len(ims) / cols)
    sheet = Image.new("RGB", (cols * tw + (cols + 1) * 6, rows * (th + lab) + (rows + 1) * 6), (16, 16, 20))
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT, 18)
    for i, (im, lb) in enumerate(zip(ims, labels)):
        x = 6 + (i % cols) * (tw + 6)
        y = 6 + (i // cols) * (th + lab + 6)
        sheet.paste(im.resize((tw, th)), (x, y))
        d.text((x + 4, y + th + 3), lb, font=f, fill=(240, 240, 240))
    sheet.save(out, quality=82)


def cmd_analyze(a):
    film, out = a.film, Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    info = probe(film)
    dur, W, H = info["dur"], info["w"], info["h"]
    act = crop_detect(film, dur, W, H)
    print(f"durasi {hms(dur)} · {W}x{H} · area aktif {act['w']}x{act['h']}+{act['x']}+{act['y']}", file=sys.stderr)

    # --- video: satu decode, dua keluaran (abu kecil 4 fps untuk potongan/gerak + frame kontak tiap --step dtk)
    tmp = Path(tempfile.mkdtemp(prefix="sinema-"))
    gw, gh, fps = 96, 54, 4
    crop = f"crop={act['w']}:{act['h']}:{act['x']}:{act['y']}"
    fc = (f"[0:v]{crop},split=2[a][b];[a]fps={fps},scale={gw}:{gh},format=gray[g];"
          f"[b]fps=1/{a.step},scale=320:-2[c]")
    cmd = ["ffmpeg", "-v", "error", "-hwaccel", "auto", "-i", film, "-filter_complex", fc,
           "-map", "[g]", "-f", "rawvideo", "pipe:1", "-map", "[c]", "-q:v", "4", str(tmp / "%05d.jpg")]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    fsz = gw * gh
    prev, diffs, motion, bright = None, [], [], []
    while True:
        buf = p.stdout.read(fsz * 64)
        if not buf:
            break
        arr = np.frombuffer(buf[: len(buf) // fsz * fsz], np.uint8).reshape(-1, gh, gw).astype(np.float32)
        for fr in arr:
            bright.append(float(fr.mean() / 255))
            if prev is None:
                diffs.append(0.0); motion.append(0.0)
            else:
                d = np.abs(fr - prev).mean() / 255
                h1 = np.histogram(fr, 16, (0, 256))[0] / fsz
                h0 = np.histogram(prev, 16, (0, 256))[0] / fsz
                diffs.append(float(0.5 * np.abs(h1 - h0).sum() + d))
                motion.append(float(d))
            prev = fr
    p.wait()
    diffs = np.array(diffs)
    med = np.array([np.median(diffs[max(0, i - 12): i + 12]) for i in range(len(diffs))]) if len(diffs) else diffs
    cut_idx = [i for i in range(1, len(diffs)) if diffs[i] > max(0.18, 4 * med[i])]
    cuts = [round(i / fps, 2) for i in cut_idx]
    mot = np.array(motion)
    for i in cut_idx:  # potongan bukan gerak
        mot[i] = 0

    # --- audio: RMS + rasio ucapan (webrtcvad) per detik
    sr = 16000
    rms, speech = [], []
    try:
        import webrtcvad
        vad = webrtcvad.Vad(2)
    except Exception:
        vad = None
    ap = subprocess.Popen(["ffmpeg", "-v", "error", "-i", film, "-map", "0:a:0", "-ac", "1", "-ar", str(sr),
                           "-f", "s16le", "pipe:1"], stdout=subprocess.PIPE)
    while True:
        buf = ap.stdout.read(sr * 2)
        if len(buf) < sr:
            break
        x = np.frombuffer(buf[: len(buf) // 2 * 2], np.int16)
        rms.append(float(20 * np.log10(np.sqrt(np.mean((x / 32768.0) ** 2)) + 1e-6)))
        if vad:
            fl = 480
            n = len(x) // fl
            s = sum(vad.is_speech(x[k * fl:(k + 1) * fl].tobytes(), sr) for k in range(n))
            speech.append(s / max(1, n))
        else:
            speech.append(0.0)
    ap.wait()

    nsec = int(math.ceil(dur))
    sec = []
    for t in range(nsec):
        m = mot[t * fps:(t + 1) * fps]
        b = bright[t * fps:(t + 1) * fps]
        sec.append({"t": t, "rms": round(rms[t], 1) if t < len(rms) else -60,
                    "speech": round(speech[t], 2) if t < len(speech) else 0,
                    "motion": round(float(m.mean()) if len(m) else 0, 4),
                    "bright": round(float(np.mean(b)) if len(b) else 0, 3)})

    # --- jendela 30 dtk (langkah 15): skor dialog vs aksi
    win, stepw = min(30, max(5, int(dur / 3))), 15
    cuts_arr = np.array(cuts)
    rows = []
    for s0 in range(0, max(1, nsec - win + 1), min(stepw, win)):
        seg = sec[s0:s0 + win]
        if not seg:
            continue
        cpm = float(((cuts_arr >= s0) & (cuts_arr < s0 + win)).sum()) * 60 / win
        rows.append({"t": [s0, s0 + win], "speech": np.mean([x["speech"] for x in seg]),
                     "rms": np.mean([x["rms"] for x in seg]), "motion": np.mean([x["motion"] for x in seg]),
                     "cpm": cpm, "bright": np.mean([x["bright"] for x in seg])})
    if rows:
        sp, rm, mo, cp = (norm([r[k] for r in rows]) for k in ("speech", "rms", "motion", "cpm"))
        for i, r in enumerate(rows):
            r["dialog"] = round(float(sp[i] * (1 - 0.5 * cp[i]) * (1 - 0.4 * mo[i])), 3)
            r["aksi"] = round(float(0.45 * mo[i] + 0.35 * cp[i] + 0.2 * rm[i]), 3)
            for k in ("speech", "rms", "motion", "cpm", "bright"):
                r[k] = round(float(r[k]), 3)

    def top(key, n=8):
        pick = []
        for r in sorted(rows, key=lambda r: -r[key]):
            if all(r["t"][1] <= q["t"][0] or r["t"][0] >= q["t"][1] for q in pick):
                pick.append(r)
            if len(pick) >= n:
                break
        return [{"t": r["t"], "skor": r[key], "jam": f"{hms(r['t'][0])}-{hms(r['t'][1])}", "speech": r["speech"],
                 "cpm": r["cpm"], "motion": r["motion"]} for r in pick]

    windows = {"dialog": top("dialog"), "aksi": top("aksi")}

    # --- lembar kontak
    sheets = Path(a.sheets or out / "kontak")
    sheets.mkdir(parents=True, exist_ok=True)
    frames = sorted(tmp.glob("*.jpg"))
    per = 48
    made = []
    for k in range(0, len(frames), per):
        fs = frames[k:k + per]
        labels = [hms((k + i) * a.step) for i in range(len(fs))]
        f = sheets / f"kontak-{k // per + 1:02d}.jpg"
        contact_sheet(fs, labels, f)
        made.append({"file": str(f), "from": hms(k * a.step), "to": hms((k + len(fs) - 1) * a.step)})
    for f in frames:
        f.unlink()
    tmp.rmdir()

    res = {"film": os.path.abspath(film), "dur": round(dur, 3), "w": W, "h": H, "hdr": info["hdr"], "active": act,
           "step": a.step, "cuts": cuts, "sec": sec, "windows": windows, "sheets": made}
    json.dump(res, open(out / "analysis.json", "w"))
    print(json.dumps({"dur": round(dur, 1), "active": act, "cuts": len(cuts), "sheets": len(made), "hdr": info["hdr"]}))


def cmd_sheet(a):
    times = [float(x) for x in a.times.split(",") if x.strip()]
    tmp = Path(tempfile.mkdtemp(prefix="sinema-sheet-"))
    frames, labels = [], []
    vf = (f"crop={a.crop}," if a.crop else "") + "scale=320:-2"
    for i, t in enumerate(times):
        f = tmp / f"{i:04d}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", a.film, "-frames:v", "1", "-vf", vf,
                        "-q:v", "4", str(f)], check=False)
        if f.exists():
            frames.append(f); labels.append(hms(t))
    contact_sheet(frames, labels, a.out, cols=a.cols)
    for f in frames:
        f.unlink()
    tmp.rmdir()
    print(a.out)


def cmd_board(a):
    pairs = [x.rsplit("=", 1) for x in a.items]
    contact_sheet([p for _, p in pairs], [l for l, _ in pairs], a.out, cols=a.cols, tw=a.tw)
    print(a.out)


# ------------------------------------------------------------------ mixer
SR = 48000


def decode(file, start=0.0, length=None, speed=1.0, channels=2):
    """Audio -> float32 [n, ch] pada 48 kHz. speed != 1: atempo (pitch tetap)."""
    af = []
    s = speed
    while s > 2.0:
        af.append("atempo=2.0"); s /= 2.0
    while s < 0.5:
        af.append("atempo=0.5"); s /= 0.5
    if abs(s - 1) > 1e-3:
        af.append(f"atempo={s:.5f}")
    cmd = ["ffmpeg", "-v", "error"]
    if start > 0:
        cmd += ["-ss", f"{start:.3f}"]
    if length is not None:
        cmd += ["-t", f"{length:.3f}"]
    cmd += ["-i", file, "-map", "0:a:0", "-ac", str(channels), "-ar", str(SR)]
    if af:
        cmd += ["-af", ",".join(af)]
    cmd += ["-f", "f32le", "pipe:1"]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        return np.zeros((0, channels), np.float32)
    return np.frombuffer(r.stdout, np.float32).reshape(-1, channels).copy()


def place(bus, x, at, gain=1.0, fade=0.008):
    i0 = int(round(at * SR))
    if i0 < 0:
        x = x[-i0:]; i0 = 0
    n = min(len(x), len(bus) - i0)
    if n <= 0:
        return
    x = x[:n] * gain
    k = min(int(fade * SR), n // 2)
    if k > 0:
        ramp = np.linspace(0, 1, k, dtype=np.float32)[:, None]
        x[:k] *= ramp
        x[-k:] *= ramp[::-1]
    bus[i0:i0 + n] += x


def envelope(n, keys, default=1.0):
    """keys [[detik, gain], ...] -> gain per sampel (linear di antara titik)."""
    if not keys:
        return np.full(n, default, np.float32)
    ks = sorted(keys)
    t = np.arange(n) / SR
    return np.interp(t, [k[0] for k in ks], [k[1] for k in ks]).astype(np.float32)


def window_env(n, wins, ramp=0.08):
    """wins [{a, b, gain}] -> pengali (1 di luar jendela) dengan ramp halus."""
    env = np.ones(n, np.float32)
    t = np.arange(n) / SR
    for w in wins:
        a, b, g = w["a"], w["b"], w["gain"]
        up = np.clip((t - (a - ramp)) / ramp, 0, 1)
        down = np.clip(((b + ramp) - t) / ramp, 0, 1)
        m = np.minimum(up, down)
        env = np.minimum(env, 1 - (1 - g) * m)
    return env


def loudnorm(src, dst, target, tp=-1.5):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-af", f"loudnorm=I={target}:TP={tp}:LRA=11:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr)
    if not m:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-c:a", "pcm_s16le", dst], check=True)
        return None
    j = json.loads(m.group(0))
    af = (f"loudnorm=I={target}:TP={tp}:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
          f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", af, "-ar", str(SR), "-c:a", "pcm_s16le", dst], check=True)
    return float(j["input_i"])


def cmd_mix(a):
    import soundfile as sf
    spec = json.load(open(a.spec))
    n = int(math.ceil(spec["dur"] * SR))
    film = np.zeros((n, 2), np.float32)
    voice = np.zeros((n, 2), np.float32)
    music = np.zeros((n, 2), np.float32)
    for s in spec.get("segments", []):
        x = decode(spec["film"], s["s"], s["len"] * s.get("speed", 1), s.get("speed", 1))
        place(film, x[: int(s["len"] * SR)], s["t0"], s.get("gain", 1.0))
    film *= window_env(n, spec.get("duck", []))[:, None]
    for c in spec.get("clips", []):
        x = decode(c["file"])
        place(voice, x, c["at"], c.get("gain", 1.0), fade=0.004)
    m = spec.get("music")
    if m and m.get("file"):
        off = m.get("offset", 0.0)  # detik lagu yang jatuh di detik 0 video (negatif = musik mulai belakangan)
        x = decode(m["file"], max(0.0, off), spec["dur"] + 1)
        place(music, x, max(0.0, -off), 1.0, fade=0.02)
        music *= envelope(n, m.get("env"), 1.0)[:, None]
        music *= window_env(n, m.get("duck", []), 0.15)[:, None]
    mix = film + voice + music
    fo = spec.get("fadeOut", 0)
    if fo > 0:
        k = min(n, int(fo * SR))
        mix[-k:] *= np.linspace(1, 0, k, dtype=np.float32)[:, None]
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    sf.write(tmp, np.clip(mix, -4, 4), SR, subtype="FLOAT")
    before = loudnorm(tmp, spec["out"], spec.get("targetLufs", -14))
    os.unlink(tmp)
    print(json.dumps({"out": spec["out"], "dur": round(n / SR, 2), "lufsSebelum": before, "target": spec.get("targetLufs", -14)}))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("analyze")
    p.add_argument("--film", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--step", type=float, default=5)
    p.add_argument("--sheets")
    p = sub.add_parser("sheet")
    p.add_argument("--film", required=True)
    p.add_argument("--times", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--crop")
    p.add_argument("--cols", type=int, default=6)
    p = sub.add_parser("board")
    p.add_argument("--out", required=True)
    p.add_argument("--cols", type=int, default=6)
    p.add_argument("--tw", type=int, default=240)
    p.add_argument("items", nargs="+")
    p = sub.add_parser("mix")
    p.add_argument("--spec", required=True)
    a = ap.parse_args()
    {"analyze": cmd_analyze, "sheet": cmd_sheet, "board": cmd_board, "mix": cmd_mix}[a.cmd](a)


if __name__ == "__main__":
    main()
