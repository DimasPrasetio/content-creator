"""Musik + SFX sintetis untuk komposisi Pop, lalu dicampur dengan narasi.

Pemakaian: python sound.py <nama>
Masukan : Projects/<nama>/voice.wav (narasi), Engine/work/<nama>/timing.json, Projects/<nama>/storyboard.json
Keluaran: Engine/work/<nama>/mix.wav (narasi + musik + SFX, -14 LUFS)
Kit SFX : Engine/public/sfx/<jenis>.wav (dibuat sekali bila belum ada; boleh diganti file lain dengan nama sama)
Level   : SFX dikalibrasi ±18 dB di bawah narasi (aturan CLAUDE.md), musik di-duck saat narasi terdengar

Storyboard per scene:
  "sfx": [{"cue": "kata", "type": "impact", "offset": 0, "gain": 1, "when": "start"|"end"}]
  "music": "pad" | "build" | "full" | "off"   (default "full"; "pad" untuk scene tenang, hindari "off" = hening mati)
  "trans": slash/shutter/iris -> whoosh, cut -> scratch, flash -> riser + boom
"""

import os as _os
_os.environ["PATH"] = _os.pathsep.join([_os.path.expanduser("~/.local/share/content-creator/tools/bin"), _os.path.expanduser("~/.local/bin"), _os.environ.get("PATH", "")])


import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

SR = 44100
FPS = 30
BPM = 100
BEAT = 60 / BPM
ENGINE = Path(__file__).resolve().parent.parent
ROOT = ENGINE.parent
rng = np.random.default_rng(7)


def t_(d):
    return np.arange(int(d * SR)) / SR


def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / max(d, 1e-4))


def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], btype="band", fs=SR, output="sos"), x)


def hp(x, f):
    return sosfilt(butter(2, f, btype="high", fs=SR, output="sos"), x)


def lp(x, f):
    return sosfilt(butter(2, f, btype="low", fs=SR, output="sos"), x)


def sweep(f0, f1, d, curve=6.0):
    t = t_(d)
    f = f1 + (f0 - f1) * np.exp(-t * curve)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def noise(d):
    return rng.standard_normal(int(d * SR))


# ---------- instrumen ----------
def kick():
    x = sweep(140, 45, 0.4, 18) * env(int(0.4 * SR), 0.001, 0.16)
    return x * 0.9


def clap():
    out = np.zeros(int(0.25 * SR))
    for k, off in enumerate([0, 0.011, 0.022]):
        n = bp(noise(0.2), 900, 2600) * env(int(0.2 * SR), 0.001, 0.05 if k < 2 else 0.12)
        i = int(off * SR)
        out[i : i + len(n)] += n[: len(out) - i]
    return out * 0.35


def hat(open_=False):
    d = 0.18 if open_ else 0.05
    return hp(noise(d), 7000) * env(int(d * SR), 0.001, d / 3) * 0.18


def note(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def bass(midi, d):
    t = t_(d)
    f = note(midi)
    x = 0.6 * np.sin(2 * np.pi * f * t) + 0.3 * np.sign(np.sin(2 * np.pi * f * t))
    return lp(x, 500) * env(len(t), 0.005, d * 0.6) * 0.5


def pluck(midi, d=0.35):
    t = t_(d)
    f = note(midi)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2 * f * t) + 0.15 * np.sin(2 * np.pi * 3 * f * t)
    return x * env(len(t), 0.002, 0.09) * 0.16


def pad(midis, d):
    t = t_(d)
    x = sum(np.sin(2 * np.pi * note(m) * t + k) for k, m in enumerate(midis)) / len(midis)
    a = np.minimum(1, t / 0.4) * np.minimum(1, (d - t) / 0.4)
    return lp(x, 1500) * a * 0.12


# ---------- backsound cinematic (serius, korporat) ----------
def reverb(x, seconds=2.2, wet=0.35):
    from scipy.signal import fftconvolve

    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (seconds / 5))
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir**2))
    y = fftconvolve(x, ir)[: len(x)]
    return x * (1 - wet) + y * wet


def warm_pad(midis, d):
    t = t_(d)
    x = np.zeros_like(t)
    for m in midis:
        for det in (-0.08, 0.0, 0.08):
            f = note(m + det)
            x += sum(np.sin(2 * np.pi * f * h * t) / h for h in (1, 2, 3, 4))
    x /= len(midis) * 3
    a = np.minimum(1, t / 0.9) * np.minimum(1, (d - t) / 0.6)
    return lp(x, 1100) * a


def piano(midi, d=1.6):
    t = t_(d)
    f = note(midi)
    x = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 3) + 0.2 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 5)
    return x * env(len(t), 0.003, 0.55)


def soft_kick():
    return sweep(110, 42, 0.45, 12) * env(int(0.45 * SR), 0.002, 0.18)


def shaker():
    return hp(noise(0.06), 6000) * env(int(0.06 * SR), 0.004, 0.02)


def smooth(mask, sec=0.5):
    k = int(sec * SR)
    return np.convolve(mask.astype(float), np.ones(k) / k, mode="same")


def cinematic_bed(mode, total):
    """Am - F - C - G, 100 BPM: pad lebar + bass berdenyut + kick lembut + shaker + motif piano.
    mode per sampel: 0 mati, 1 build (pad + bass pelan), 2 penuh, 3 pad saja (scene tenang, tidak pernah hening mati).
    Perpindahan di-crossfade."""
    chords = [[57, 60, 64, 71], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]]
    roots = [33, 29, 36, 31]
    bar = 4 * BEAT
    pads = np.zeros(total)
    pulse = np.zeros(total)
    drums = np.zeros(total)
    keys = np.zeros(total)
    n_bars = int(total / SR / bar) + 1
    for b in range(n_bars):
        at = b * bar
        ch = b % 4
        add(pads, warm_pad(chords[ch], bar + 0.6), at, 1.0)
        for k in range(8):
            ts = at + k * BEAT / 2
            add(pulse, bass(roots[ch] + 12, BEAT / 2 * 0.9) * (1.0 if k % 2 == 0 else 0.7), ts, 1.0)
        for k in range(4):
            if k in (0, 2):
                add(drums, soft_kick(), at + k * BEAT, 0.8)
            for q in range(4):
                add(drums, shaker(), at + k * BEAT + q * BEAT / 4, 0.35 if q % 2 else 0.2)
        motif = [chords[ch][3] + 12, chords[ch][2] + 12, chords[ch][1] + 12]
        for k, m in enumerate(motif):
            add(keys, piano(m), at + k * BEAT * 1.5, 0.22)
    pads = reverb(pads, 2.6, 0.4)
    keys = reverb(keys, 2.2, 0.45)
    build = smooth((mode == 1) | (mode == 2))
    full = smooth(mode == 2)
    calm = smooth(mode == 3)
    bed = pads * (0.55 * build + 0.3 * calm) + pulse * (0.25 * build + 0.3 * full) + drums * 0.5 * full + keys * full
    return bed / (np.max(np.abs(bed)) + 1e-9)


# ---------- SFX ----------
def whoosh(d=0.45):
    t = t_(d)
    x = noise(d)
    out = np.zeros_like(x)
    seg = 512
    for i in range(0, len(x), seg):
        c = 400 + 4000 * (i / len(x))
        out[i : i + seg] = bp(x[i : i + seg], c * 0.7, c * 1.3)
    shape = np.sin(np.pi * t / d) ** 2
    return out * shape * 0.9


def riser(d=1.4):
    t = t_(d)
    x = hp(noise(d), 1500) * (t / d) ** 2 * 0.35
    x += 0.15 * np.sin(2 * np.pi * np.cumsum(200 + 1400 * (t / d) ** 2) / SR) * (t / d)
    return x


def boom():
    x = sweep(90, 30, 1.4, 4) * env(int(1.4 * SR), 0.002, 0.5)
    x += lp(noise(1.4), 300) * env(int(1.4 * SR), 0.002, 0.25) * 0.4
    return x * 1.1


def scratch():
    d = 0.45
    t = t_(d)
    f = 300 + 900 * np.abs(np.sin(2 * np.pi * 6 * t))
    x = bp(noise(d), 200, 3000) * 0.4 + 0.3 * np.sin(2 * np.pi * np.cumsum(f) / SR)
    return x * env(len(t), 0.005, 0.2)


def impact():
    crack = hp(noise(0.08), 2500) * env(int(0.08 * SR), 0.0005, 0.02) * 0.9
    thump = sweep(160, 45, 0.35, 14) * env(int(0.35 * SR), 0.001, 0.12)
    out = np.zeros(int(0.35 * SR))
    out[: len(crack)] += crack
    out += thump
    return out


def pop():
    return sweep(500, 1300, 0.09, -20) * env(int(0.09 * SR), 0.001, 0.03) * 0.6


def boing():
    d = 0.45
    t = t_(d)
    f = 220 + 160 * np.exp(-t * 6) * (1 + 0.3 * np.sin(2 * np.pi * 14 * t))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(t), 0.002, 0.18) * 0.5


def stamp():
    x = sweep(120, 50, 0.3, 20) * env(int(0.3 * SR), 0.001, 0.08)
    n = lp(noise(0.3), 1200) * env(int(0.3 * SR), 0.001, 0.04) * 0.6
    return (x + n) * 0.9


def ding():
    t = t_(1.0)
    x = np.sin(2 * np.pi * 1320 * t) + 0.5 * np.sin(2 * np.pi * 2640 * t) + 0.25 * np.sin(2 * np.pi * 1980 * t)
    return x * env(len(t), 0.002, 0.35) * 0.3


def click():
    return bp(noise(0.03), 1500, 5000) * env(int(0.03 * SR), 0.0005, 0.006) * 0.8


def tape():
    d = 0.25
    t = t_(d)
    return bp(noise(d), 800, 5000) * np.minimum(1, t / 0.02) * np.exp(-t / 0.12) * 0.45


def ticks(n=10, gap=0.1):
    out = np.zeros(int((n * gap + 0.1) * SR))
    for k in range(n):
        c = bp(noise(0.03), 1200, 2400) * env(int(0.03 * SR), 0.0005, 0.008) * 0.6
        i = int(k * gap * SR)
        out[i : i + len(c)] += c
    return out


def typing(d=1.6):
    out = np.zeros(int(d * SR))
    k = 0.0
    while k < d - 0.05:
        c = click() * (0.3 + 0.3 * rng.random())
        i = int(k * SR)
        out[i : i + len(c)] += c[: len(out) - i]
        k += 0.06 + 0.07 * rng.random()
    return out


def sparkle():
    out = np.zeros(int(0.7 * SR))
    for k, m in enumerate([88, 91, 95, 100]):
        x = np.sin(2 * np.pi * note(m) * t_(0.3)) * env(int(0.3 * SR), 0.001, 0.08) * 0.12
        i = int(k * 0.06 * SR)
        out[i : i + len(x)] += x
    return out


SFX = {
    "whoosh": whoosh,
    "riser": riser,
    "boom": boom,
    "scratch": scratch,
    "impact": impact,
    "pop": pop,
    "boing": boing,
    "stamp": stamp,
    "ding": ding,
    "click": click,
    "tape": tape,
    "ticks": ticks,
    "typing": typing,
    "sparkle": sparkle,
}


SFX_DIR = ENGINE / "public" / "sfx"
SFX_DB_BELOW_VOICE = 18.0


def _cfg():
    """config.json (bawaan plugin) + config.local.json (workspace) untuk bagian "sound"."""
    base = json.loads((ENGINE / "config.json").read_text()).get("sound", {})
    loc = ENGINE / "config.local.json"
    return {**base, **(json.loads(loc.read_text()).get("sound", {}) if loc.exists() else {})}


CFG = _cfg()


def load_sfx(kind):
    """Muat SFX. config.json "sound.sfxKit" = "eleven" -> public/sfx/eleven/<jenis>.wav (dibuat `npm run sfxkit`)
    bila ada; selain itu Engine/public/sfx/<jenis>.wav (bila belum ada, disintesis lalu disimpan)."""
    if CFG.get("sfxKit") == "eleven" and (SFX_DIR / "eleven" / f"{kind}.wav").exists():
        x, sr = sf.read(SFX_DIR / "eleven" / f"{kind}.wav", always_2d=True)
        assert sr == SR, f"sample rate harus {SR}"
        return x.mean(axis=1)
    f = SFX_DIR / f"{kind}.wav"
    if not f.exists():
        SFX_DIR.mkdir(parents=True, exist_ok=True)
        x = SFX[kind]()
        sf.write(f, (x / (np.max(np.abs(x)) + 1e-9) * 0.9).astype(np.float32), SR, subtype="PCM_16")
    x, sr = sf.read(f, always_2d=True)
    assert sr == SR, f"{f}: sample rate harus {SR}"
    return x.mean(axis=1)


def active_rms(x, thr):
    win = int(0.05 * SR)
    r = np.sqrt(np.convolve(x**2, np.ones(win) / win, mode="same"))
    on = r > thr
    return float(np.sqrt(np.mean(x[on] ** 2))) if on.any() else 0.0


def add(buf, x, at, gain=1.0):
    i = int(at * SR)
    if i < 0:
        x = x[-i:]
        i = 0
    j = min(len(buf), i + len(x))
    if j > i:
        buf[i:j] += x[: j - i] * gain


def norm(w):
    return re.sub(r"[^\w]", "", w.lower())


def cue_time(scene, q, when="start"):
    qt = [norm(x) for x in re.split(r"[\s\-]+", q) if norm(x)]
    words = scene.get("words", [])
    for need in ([2, 1] if len(qt) > 1 else [1]):
        for i, w in enumerate(words):
            ok = True
            for k in range(need):
                if i + k >= len(words):
                    ok = False
                    break
                a, b = norm(words[i + k]["w"].split("-")[0]), qt[k]
                if not (a == b or (min(len(a), len(b)) >= 3 and (a.startswith(b) or b.startswith(a)))):
                    ok = False
            if ok:
                f = words[i + need - 1]["e"] if when == "end" else w["f"] - 3
                return (scene["startFrame"] + f) / FPS
    return None


def main(name):
    proj, work = ROOT / "Projects" / name, ENGINE / "work" / name
    timing = json.loads((work / "timing.json").read_text())
    board = json.loads((proj / "storyboard.json").read_text())
    vo, sr = sf.read(proj / "voice.wav", always_2d=True)
    assert sr == SR, sr
    vo = vo.mean(axis=1)
    total = len(vo)
    music = np.zeros(total)
    sfx = np.zeros(total)
    scenes = timing["scenes"]
    specs = board["scenes"]

    # --- bagian musik per scene ---
    mode = np.zeros(total, dtype=np.int8) + 2  # 0 mati, 1 build, 2 penuh
    for sc, sp in zip(scenes, specs):
        m = {"off": 0, "build": 1, "full": 2, "pad": 3}[sp.get("music", "full")]
        a = int(sc["startFrame"] / FPS * SR)
        b = int((sc["startFrame"] + sc["durationFrames"]) / FPS * SR)
        mode[a:b] = m

    # musik: track ElevenLabs (work/<nama>/music.wav dari `npm run music`) bila ada, kalau tidak musik sintetis.
    # Track ElevenLabs diikuti bagian per scene: full 1.0, build 0.6, pad 0.35, off 0 (dihaluskan 0,4 dtk).
    track = work / "music.wav"
    if track.exists():
        m, msr = sf.read(track, always_2d=True)
        assert msr == SR, f"{track}: sample rate harus {SR}"
        m = m.mean(axis=1)
        m = np.tile(m, int(np.ceil(total / len(m))))[:total]
        lvl = np.choose(mode, [0.0, 0.6, 1.0, 0.35]).astype(float)
        k = int(0.4 * SR)
        lvl = np.convolve(lvl, np.ones(k) / k, mode="same")
        music = m / (np.max(np.abs(m)) + 1e-9) * lvl
        print("Musik: track ElevenLabs (work/<nama>/music.wav)")
    else:
        music = cinematic_bed(mode, total)

    # --- SFX otomatis dari transisi ---
    for k, (sc, sp) in enumerate(zip(scenes, specs)):
        tc = sc["startFrame"] / FPS
        tr = sp.get("trans")
        if k == 0:
            continue
        if tr in ("slash", "shutter", "iris"):
            add(sfx, load_sfx("whoosh"), tc - 0.3, 0.8)
        elif tr == "cut":
            add(sfx, load_sfx("scratch"), tc - 0.05, 0.9)
        elif tr == "flash":
            r = load_sfx("riser")
            add(sfx, r, tc - len(r) / SR, 0.8)
            add(sfx, load_sfx("boom"), tc, 0.9)

    # --- SFX dari cue kata ---
    missing = []
    for sc, sp in zip(scenes, specs):
        for e in sp.get("sfx", []):
            at = cue_time(sc, e["cue"], e.get("when", "start"))
            if at is None:
                missing.append(f"scene {sc['index'] + 1}: '{e['cue']}'")
                continue
            add(sfx, load_sfx(e["type"]), at + e.get("offset", 0) / FPS, e.get("gain", 1.0))

    # --- ducking: musik mengecil saat narasi terdengar ---
    win = int(0.05 * SR)
    rms = np.sqrt(np.convolve(vo**2, np.ones(win) / win, mode="same"))
    active = (rms > 0.02).astype(float)
    smooth = np.convolve(active, np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
    duck = 1 - 0.55 * np.clip(smooth, 0, 1)
    # ekor: musik memudar 1,2 dtk terakhir
    fade = np.ones(total)
    fl = int(1.2 * SR)
    fade[-fl:] = np.linspace(1, 0, fl)
    # kalibrasi: RMS SFX (saat berbunyi) = RMS narasi (saat bicara) - 18 dB
    vo_rms = active_rms(vo, 0.02)
    sfx_rms = active_rms(sfx, 1e-3)
    sfx_gain = vo_rms * 10 ** (-SFX_DB_BELOW_VOICE / 20) / sfx_rms if sfx_rms > 0 else 0
    MUSIC = 0.26
    mix = vo * 1.0 + music * MUSIC * duck * fade + sfx * sfx_gain
    m_rms = active_rms(music * MUSIC * duck * fade, 1e-3)
    print(f"Level: SFX {20 * np.log10(sfx_rms * sfx_gain / vo_rms):.1f} dB, musik {20 * np.log10(m_rms / vo_rms):.1f} dB relatif narasi")
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.9

    raw = work / "cache" / "mix-raw.wav"
    raw.parent.mkdir(parents=True, exist_ok=True)
    sf.write(raw, mix.astype(np.float32), SR, subtype="PCM_16")
    out = work / "mix.wav"
    # loudnorm dua tahap, mode linear (satu gain tetap: tidak ada "pumping" volume)
    p1 = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(raw), "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    m = json.loads(p1[p1.rindex("{") : p1.rindex("}") + 1])
    ln = (
        f"loudnorm=I=-14:TP=-1:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
        f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    )
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-af", ln, "-ar", "44100", "-ac", "2", str(out)], check=True)
    print(f"Selesai: {out.relative_to(ROOT)}")
    if missing:
        print("! cue SFX tidak ditemukan:", "; ".join(missing))


if __name__ == "__main__":
    main(sys.argv[1])
