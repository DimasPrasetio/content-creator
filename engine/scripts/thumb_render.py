"""Render varian thumbnail (kit/thumb/thumb.html) menjadi PNG 1080x1920 (YouTube: 1280x720 bila spec "yt") + laporan tata letak.

Pemakaian (dipanggil scripts/thumbnail.mjs):
  python thumb_render.py --root <folder berisi thumb.html + gambar> --specs <specs.json> --out-dir <folder>
specs.json = [ {window.__THUMB__ varian 1}, ... ]  ->  <out-dir>/thumb-1.png ... ; stdout = JSON laporan per varian.
Server lokal yang sama dengan html_render.py (/fonts/ = Engine/fonts); tidak ada yang dimuat dari internet.
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from html_render import H, SOFT_GL, W, serve  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--specs", required=True)
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright

    specs = json.loads(Path(a.specs).read_text())
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    srv = serve(Path(a.root))
    url = f"http://127.0.0.1:{srv.server_address[1]}/thumb.html"
    reports = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox", *SOFT_GL])
        for i, spec in enumerate(specs):
            vw, vh = (1280, 720) if spec.get("yt") else (W, H)
            page = b.new_page(viewport={"width": vw, "height": vh}, device_scale_factor=1)
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.add_init_script(f"window.__THUMB__ = {json.dumps(spec)};")
            page.goto(url)
            page.wait_for_function("window.__READY__ === true", timeout=30000)
            rep = page.evaluate("window.__REPORT__")
            page.screenshot(path=str(out / f"thumb-{i + 1}.png"))
            reports.append({**rep, "errors": errors})
            page.close()
        b.close()
    srv.shutdown()
    print(json.dumps(reports))


if __name__ == "__main__":
    main()
