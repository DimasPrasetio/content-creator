"""Render satu halaman HTML ber-`window.seek(seconds)` (kontrak motion-graphics-skills) menjadi MP4 atau PNG.

Pemakaian (dipanggil oleh scripts/html.mjs):
  python html_render.py --root <folder html> --inject <file.json> --fps 30 --duration 31.2 --out video.mp4 [--audio a.wav]
                        [--workers 4] [--no-gpu]
  python html_render.py --root <folder html> --inject <file.json> --stills 3.2,7.5 --png-dir <folder>

- Folder html disajikan lewat server lokal (ES module tidak jalan dari file://); /vendor/ = Engine/node_modules,
  /fonts/ = Engine/fonts (Fira Sans, Anton, Poppins, Inter, JetBrains Mono), /kit/ = Engine/kit (kit HTML standar).
  Tidak ada yang dimuat dari internet.
- Sebelum halaman jalan disisipkan: window.__TIMING__ (scene & kata dari voice over), window.__BRAND__,
  window.__RENDER__ = true. Halaman dibuka dengan ?render sehingga menunggu seek.
- Tiap frame: await window.seek(t) -> screenshot JPEG (q95) -> ffmpeg H.264 yuv420p 30 fps.
- Video dirender PARALEL: durasi dibagi --workers potongan berurutan, tiap potongan oleh Chromium sendiri (halaman = fungsi
  murni dari waktu, jadi frame identik), segmen digabung tanpa encode ulang. Bawaan rasterisasi lewat GPU (±2x lebih cepat;
  beda hanya anti-aliasing subpiksel, SSIM ±0,999); --no-gpu = SwiftShader (perangkat lunak) persis seperti versi lama.
  Bila mode GPU/paralel gagal, otomatis diulang dengan 1 worker tanpa GPU. Stills (preview & cek tata letak) selalu SwiftShader.
"""

import os as _os
_os.environ["PATH"] = _os.pathsep.join([_os.path.expanduser("~/.local/share/content-creator/tools/bin"), _os.path.expanduser("~/.local/bin"), _os.environ.get("PATH", "")])


import argparse
import functools
import http.server
import json
import subprocess
import sys
import tempfile
import threading
import time
from multiprocessing import Process, Queue
from pathlib import Path

ENGINE = Path(__file__).resolve().parent.parent
PROBE = (ENGINE / "src" / "probe" / "measure.js").read_text().replace("export function", "function")
W, H = 1080, 1920
SOFT_GL = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def translate_path(self, p):
        p = p.split("?", 1)[0].split("#", 1)[0]
        if p.startswith("/vendor/"):
            return str(ENGINE / "node_modules" / p[len("/vendor/") :])
        if p.startswith("/fonts/"):
            return str(ENGINE / "fonts" / p[len("/fonts/") :])
        if p.startswith("/kit/"):
            return str(ENGINE / "kit" / p[len("/kit/") :])
        return super().translate_path(p)


def serve(root):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def open_page(p, a, inj, errors, gpu):
    b = p.chromium.launch(args=["--no-sandbox", *([] if gpu else SOFT_GL)])
    page = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.add_init_script(
        f"window.__TIMING__={json.dumps(inj.get('timing'))};window.__BRAND__={json.dumps(inj.get('brand', {}))};window.__RENDER__=true;"
    )
    page.goto(a.url, wait_until="load")
    page.wait_for_function("typeof window.seek === 'function'", timeout=30000)
    page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true")
    seek = lambda t: page.evaluate("t => Promise.resolve(window.seek(t)).then(() => new Promise(r => requestAnimationFrame(() => r(true))))", t)
    return b, page, seek


def segment(idx, a, f0, f1, out, gpu, q):
    """Render frame [f0, f1) ke `out` (H.264 perantara tanpa audio). Dijalankan di proses terpisah."""
    from playwright.sync_api import sync_playwright

    errors = []
    try:
        inj = json.loads(Path(a.inject).read_text())
        srv = serve(a.root)
        a.url = f"http://127.0.0.1:{srv.server_address[1]}/{a.page}?render"
        with sync_playwright() as p:
            b, page, seek = open_page(p, a, inj, errors, gpu)
            # perantara kualitas tinggi (dikompres final sekali oleh html.mjs); JPEG rentang penuh -> rentang video standar
            cmd = ["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(a.fps), "-i", "-",
                   "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", "-color_range", "tv",
                   "-r", str(a.fps), "-threads", "2", out]
            ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            for k in range(f0, f1):
                seek(k / a.fps)
                ff.stdin.write(page.screenshot(type="jpeg", quality=95))
                if idx == 0 and (k - f0) % (a.fps * 5) == 0:
                    print(f"\rframe ~{(k - f0) * a.workers}/{a.n}", end="", file=sys.stderr, flush=True)
            ff.stdin.close()
            if ff.wait() != 0:
                raise RuntimeError("ffmpeg segmen gagal")
            b.close()
        srv.shutdown()
        q.put((idx, errors, None))
    except Exception as e:  # noqa: BLE001
        q.put((idx, errors, repr(e)))


def render_video(a, workers, gpu):
    a.workers = workers
    tmp = Path(tempfile.mkdtemp(prefix="html-render-"))
    bounds = [round(a.n * i / workers) for i in range(workers + 1)]
    segs = [str(tmp / f"seg{i:02d}.mp4") for i in range(workers)]
    q = Queue()
    procs = [Process(target=segment, args=(i, a, bounds[i], bounds[i + 1], segs[i], gpu, q)) for i in range(workers)]
    for pr in procs:
        pr.start()
    res = sorted(q.get() for _ in procs)
    for pr in procs:
        pr.join()
    fails = [r[2] for r in res if r[2]]
    errors = [e for r in res for e in r[1]]
    if not fails:
        lst = tmp / "list.txt"
        lst.write_text("".join(f"file '{s}'\n" for s in segs))
        cmd = ["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(lst)]
        if a.audio:
            cmd += ["-i", a.audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest"]
        cmd += ["-c:v", "copy", "-movflags", "+faststart", a.out]
        if subprocess.run(cmd).returncode != 0:
            fails.append("ffmpeg gabung segmen gagal")
    for f in tmp.iterdir():
        f.unlink()
    tmp.rmdir()
    return fails, errors


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--page", default="index.html")
    ap.add_argument("--inject", required=True, help="JSON {timing, brand}")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--duration", type=float)
    ap.add_argument("--out")
    ap.add_argument("--audio")
    ap.add_argument("--stills")
    ap.add_argument("--png-dir")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--gpu", action=argparse.BooleanOptionalAction, default=True)
    a = ap.parse_args()
    t0 = time.time()
    errors = []
    layout = []
    if a.stills:
        from playwright.sync_api import sync_playwright

        inj = json.loads(Path(a.inject).read_text())
        srv = serve(a.root)
        a.url = f"http://127.0.0.1:{srv.server_address[1]}/{a.page}?render"
        with sync_playwright() as p:
            b, page, seek = open_page(p, a, inj, errors, False)
            out = Path(a.png_dir)
            out.mkdir(parents=True, exist_ok=True)
            for i, t in enumerate(float(x) for x in a.stills.split(",")):
                seek(t)
                page.screenshot(path=str(out / f"scene-{i + 1:02d}.png"))
                rep = page.evaluate(f"(() => {{ {PROBE}\n return probeLayout(); }})()")
                layout.append({"label": f"scene {i + 1}", "t": t, **rep})
            b.close()
        srv.shutdown()
    else:
        a.n = round(a.duration * a.fps)
        workers = max(1, min(a.workers, a.n // 30 or 1))
        fails, errors = render_video(a, workers, a.gpu)
        if fails and (workers > 1 or a.gpu):
            print(f"\n! render paralel/GPU gagal ({fails[0]}); ulang 1 worker tanpa GPU", file=sys.stderr)
            fails, errors = render_video(a, 1, False)
        if fails:
            raise SystemExit(f"render gagal: {fails}")
        print(f"\rframe {a.n}/{a.n} ({workers} worker{', GPU' if a.gpu else ''}, {time.time() - t0:.0f} dtk)", file=sys.stderr)
    print(json.dumps({"errors": list(dict.fromkeys(errors))[:20], "layout": layout}))


if __name__ == "__main__":
    main()
