"""Render satu halaman HTML ber-`window.seek(seconds)` (kontrak motion-graphics-skills) menjadi MP4 atau PNG.

Pemakaian (dipanggil oleh scripts/html.mjs):
  python html_render.py --root <folder html> --inject <file.json> --fps 30 --duration 31.2 --out video.mp4 [--audio a.wav]
  python html_render.py --root <folder html> --inject <file.json> --stills 3.2,7.5 --png-dir <folder>

- Folder html disajikan lewat server lokal (ES module tidak jalan dari file://); /vendor/ = Engine/node_modules, /fonts/ = Engine/fonts (Fira Sans, Anton)
  (mis. /vendor/three/build/three.module.js). Tidak ada yang dimuat dari internet.
- Sebelum halaman jalan disisipkan: window.__TIMING__ (scene & kata dari voice over), window.__BRAND__,
  window.__RENDER__ = true. Halaman dibuka dengan ?render sehingga menunggu seek.
- Tiap frame: await window.seek(t) -> screenshot JPEG (q95) -> ffmpeg H.264 yuv420p 30 fps.
"""

import argparse
import functools
import http.server
import json
import subprocess
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ENGINE = Path(__file__).resolve().parent.parent
PROBE = (ENGINE / "src" / "probe" / "measure.js").read_text().replace("export function", "function")
W, H = 1080, 1920


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def translate_path(self, p):
        p = p.split("?", 1)[0].split("#", 1)[0]
        if p.startswith("/vendor/"):
            return str(ENGINE / "node_modules" / p[len("/vendor/") :])
        if p.startswith("/fonts/"):
            return str(ENGINE / "fonts" / p[len("/fonts/") :])
        return super().translate_path(p)


def serve(root):
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


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
    a = ap.parse_args()
    inj = json.loads(Path(a.inject).read_text())
    srv = serve(a.root)
    url = f"http://127.0.0.1:{srv.server_address[1]}/{a.page}?render"
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        page = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.add_init_script(
            f"window.__TIMING__={json.dumps(inj.get('timing'))};window.__BRAND__={json.dumps(inj.get('brand', {}))};window.__RENDER__=true;"
        )
        page.goto(url, wait_until="load")
        page.wait_for_function("typeof window.seek === 'function'", timeout=30000)
        page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true")
        seek = lambda t: page.evaluate("t => Promise.resolve(window.seek(t)).then(() => new Promise(r => requestAnimationFrame(() => r(true))))", t)
        layout = []
        if a.stills:
            out = Path(a.png_dir)
            out.mkdir(parents=True, exist_ok=True)
            for i, t in enumerate(float(x) for x in a.stills.split(",")):
                seek(t)
                page.screenshot(path=str(out / f"scene-{i + 1:02d}.png"))
                rep = page.evaluate(f"(() => {{ {PROBE}\n return probeLayout(); }})()")
                layout.append({"label": f"scene {i + 1}", "t": t, **rep})
        else:
            n = round(a.duration * a.fps)
            cmd = ["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(a.fps), "-i", "-"]
            if a.audio:
                cmd += ["-i", a.audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "192k", "-shortest"]
            cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(a.fps), "-movflags", "+faststart", a.out]
            ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            for k in range(n):
                seek(k / a.fps)
                ff.stdin.write(page.screenshot(type="jpeg", quality=95))
                if k % (a.fps * 5) == 0:
                    print(f"\rframe {k}/{n}", end="", file=sys.stderr, flush=True)
            ff.stdin.close()
            if ff.wait() != 0:
                raise SystemExit("ffmpeg gagal")
            print(f"\rframe {n}/{n}", file=sys.stderr)
        b.close()
    srv.shutdown()
    print(json.dumps({"errors": errors[:20], "layout": layout}))


if __name__ == "__main__":
    main()
