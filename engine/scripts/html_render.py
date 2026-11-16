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
- Motion blur (rana 180°): --subframes N (0 = otomatis dari halaman: window.__SUBFRAMES__, kit kamera = 16, kit lain = 1).
  Adaptif: bila halaman punya window.__motion(t, dt), sub-frame hanya diambil untuk frame yang sedang bergerak cepat, sebanyak
  perpindahan/4 px (min 4, maks N); frame lain satu screenshot. Sub-frame dalam setengah durasi frame dirata-rata (numpy).
- Video dirender PARALEL: durasi dibagi potongan 2 dtk; --workers Chromium mengambil potongan berikutnya dari antrean
  (beban merata walau ada adegan berat), halaman = fungsi murni dari waktu jadi frame identik; potongan digabung tanpa encode ulang. Bawaan rasterisasi lewat GPU (±2x lebih cepat;
  beda hanya anti-aliasing subpiksel, SSIM ±0,999); --no-gpu = SwiftShader (perangkat lunak) persis seperti versi lama.
  Worker yang gagal tidak menggagalkan render: worker lain menghabiskan antrean, potongan yang belum jadi diulang paralel
  tanpa GPU, lalu 1 worker tanpa GPU. Stills (preview & cek tata letak) selalu SwiftShader.
"""

import os as _os
_os.environ["PATH"] = _os.pathsep.join([_os.path.expanduser("~/.local/share/content-creator/tools/bin"), _os.path.expanduser("~/.local/bin"), _os.environ.get("PATH", "")])


import argparse
import io
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


class Server(http.server.ThreadingHTTPServer):
    # antrean koneksi bawaan Python = 5: Chromium membuka >5 koneksi sekaligus untuk halaman dengan banyak file (skrip, font,
    # gambar) -> macOS memutus sisanya (ERR_CONNECTION_RESET), skrip tidak termuat dan window.seek tidak pernah ada.
    request_queue_size = 128
    daemon_threads = True


def serve(root):
    srv = Server(("127.0.0.1", 0), functools.partial(Handler, directory=str(root)))
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
    page.wait_for_function("typeof window.seek === 'function'", timeout=60000, polling=100)  # timer, bukan rAF (rAF bisa macet saat GPU sibuk)
    page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true")
    seek = lambda t: page.evaluate("t => Promise.resolve(window.seek(t)).then(() => new Promise(r => requestAnimationFrame(() => r(true))))", t)
    return b, page, seek


def subframes_of(page, a):
    """Jumlah sub-frame: --subframes bila > 0, kalau tidak window.__SUBFRAMES__ halaman (bawaan 1)."""
    return a.subframes if a.subframes > 0 else int(page.evaluate("window.__SUBFRAMES__ || 1"))


def grab(page, seek, t, fps, sub):
    """Satu frame JPEG pada waktu t. Bila sub > 1 dan halaman melaporkan gerak cepat (window.__motion -> perpindahan
    dalam px selama rana 180°; true = cepat), ambil n = clamp(px / 4, 4, sub) screenshot dalam rana lalu rata-ratakan."""
    seek(t)
    dt = 0.5 / fps
    mv = page.evaluate("([t, d]) => !window.__motion || window.__motion(t, d)", [t, dt]) if sub > 1 else False
    if not mv:
        return page.screenshot(type="jpeg", quality=95), False
    n = sub if mv is True else max(4, min(sub, int(-(-float(mv) // 4))))
    import numpy as np
    from PIL import Image

    acc = None
    for i in range(n):
        if i:
            seek(t + dt * i / n)
        im = np.asarray(Image.open(io.BytesIO(page.screenshot(type="jpeg", quality=95))).convert("RGB"), dtype=np.float32)
        acc = im if acc is None else acc + im
    buf = io.BytesIO()
    Image.fromarray(np.clip(acc / n + 0.5, 0, 255).astype(np.uint8)).save(buf, "JPEG", quality=95)
    return buf.getvalue(), True


CHUNK_S = 2.0  # panjang potongan kerja (detik): worker yang kosong mengambil potongan berikutnya -> beban merata


def worker(idx, a, jobs, gpu, q):
    """Satu browser; ambil potongan (k, f0, f1, out) dari antrean `jobs` sampai habis, render tiap potongan ke H.264
    perantara tanpa audio. Dijalankan di proses terpisah."""
    from playwright.sync_api import sync_playwright

    errors, blurred, sub, done, ids = [], 0, 1, 0, []
    try:
        inj = json.loads(Path(a.inject).read_text())
        srv = serve(a.root)
        a.url = f"http://127.0.0.1:{srv.server_address[1]}/{a.page}?render"
        with sync_playwright() as p:
            browser, page, seek = open_page(p, a, inj, errors, gpu)
            sub = subframes_of(page, a)
            while (job := jobs.get()) is not None:
                cid, f0, f1, out = job
                # perantara kualitas tinggi (dikompres final sekali oleh html.mjs); JPEG rentang penuh -> rentang video standar
                cmd = ["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(a.fps), "-i", "-",
                       "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", "-color_range", "tv",
                       "-r", str(a.fps), "-threads", "2", out]
                ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
                for k in range(f0, f1):
                    jpg, moved = grab(page, seek, k / a.fps, a.fps, sub)
                    blurred += moved
                    ff.stdin.write(jpg)
                ff.stdin.close()
                if ff.wait() != 0:
                    raise RuntimeError("ffmpeg potongan gagal")
                done += f1 - f0
                ids.append(cid)
                if idx == 0:
                    print(f"\rframe ~{done * a.workers}/{a.n}", end="", file=sys.stderr, flush=True)
            browser.close()
        srv.shutdown()
        q.put((idx, errors, None, blurred, sub, ids))
    except Exception as e:  # noqa: BLE001
        q.put((idx, errors, repr(e), blurred, sub, ids))


def render_chunks(a, chunks, workers, gpu):
    """Render daftar potongan dengan `workers` browser. Kembalikan (id selesai, error halaman, kegagalan worker)."""
    a.workers = workers
    jobs, q = Queue(), Queue()
    for c in chunks:
        jobs.put(c)
    for _ in range(workers):
        jobs.put(None)
    procs = [Process(target=worker, args=(i, a, jobs, gpu, q)) for i in range(workers)]
    for pr in procs:
        pr.start()
    res = sorted((q.get() for _ in procs), key=lambda r: r[0])
    for pr in procs:
        pr.join()
    a.blurred += sum(r[3] for r in res)
    a.sub = max([a.sub] + [r[4] for r in res])
    return {i for r in res for i in r[5]}, [e for r in res for e in r[1]], [r[2] for r in res if r[2]]


def render_video(a, workers, gpu):
    """Potongan 2 dtk dikerjakan paralel. Worker yang gagal (mis. Chromium/GPU timeout) tidak menggagalkan render: worker
    lain menghabiskan antrean, lalu potongan yang belum jadi diulang paralel tanpa GPU, terakhir 1 worker tanpa GPU."""
    tmp = Path(tempfile.mkdtemp(prefix="html-render-"))
    step = max(1, round(CHUNK_S * a.fps))
    chunks = [(i, f0, min(a.n, f0 + step), str(tmp / f"seg{i:04d}.mp4")) for i, f0 in enumerate(range(0, a.n, step))]
    a.blurred, a.sub, a.notes = 0, 1, []
    done, errors, fails = set(), [], []
    for w, g in [(workers, gpu), (workers, False), (1, False)]:
        todo = [c for c in chunks if c[0] not in done]
        if not todo:
            break
        if done or fails:
            a.notes.append(f"{len(todo)} potongan diulang ({w} worker{', GPU' if g else ', tanpa GPU'}) karena: {fails[-1][:120]}")
            print(f"\n! {a.notes[-1]}", file=sys.stderr)
        d, e, f = render_chunks(a, todo, w, g)
        done |= d
        errors += e
        fails += f
    if fails and len(done) == len(chunks) and not a.notes:
        a.notes.append(f"{len(fails)} worker gagal ({fails[0][:120]}); worker lain menyelesaikan semua potongan")
        print(f"\n! {a.notes[-1]}", file=sys.stderr)
    fails = [] if len(done) == len(chunks) else fails or ["ada potongan yang tidak dirender"]
    if not fails:
        lst = tmp / "list.txt"
        lst.write_text("".join(f"file '{c[3]}'\n" for c in chunks))
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
    ap.add_argument("--subframes", type=int, default=0, help="motion blur: sub-frame per frame (0 = otomatis dari halaman, 1 = mati)")
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
        if fails:
            raise SystemExit(f"render gagal: {fails}")
        mb = f", motion blur {a.blurred} frame (maks x{a.sub})" if a.sub > 1 else ""
        ulang = f", {len(a.notes)} pengulangan" if a.notes else ""
        print(f"\rframe {a.n}/{a.n} ({workers} worker{', GPU' if a.gpu else ''}{mb}{ulang}, {time.time() - t0:.0f} dtk)", file=sys.stderr)
    print(json.dumps({"errors": list(dict.fromkeys(errors))[:20], "layout": layout}))


if __name__ == "__main__":
    main()
