"""Pembantu unggah TikTok untuk `npm run tiktok` (dipanggil oleh scripts/tiktok.mjs, bukan langsung).

Memakai pustaka tiktok-uploader (wkaisertexas, MIT, dipatok di setup) dengan browser Playwright ber-profil tetap per
brand: login dilakukan PENGGUNA SENDIRI di jendela browser, cookie tersimpan di profil itu (folder lokal, di luar repo
dan workspace). Skrip ini tidak pernah mencetak nilai cookie.

  login   --dir <folder akun brand> [--cookies <cookies.txt>] [--timeout 600]
  upload  <job.json>       (dibuat tiktok.mjs; hasil: baris "HASIL {json}")
  selfcheck                (tanpa jaringan: pustaka & titik sambung yang dipakai masih ada)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import re
import sys
import time
from pathlib import Path

MAIN = "https://www.tiktok.com/"
LOGIN = "https://www.tiktok.com/login"
ACCOUNT_INFO = "https://www.tiktok.com/passport/web/account/info/?aid=1459"


def say(msg: str) -> None:
    print(msg, flush=True)


def result(**kw) -> None:
    print("HASIL " + json.dumps(kw, ensure_ascii=False), flush=True)


def headless_default() -> bool:
    # Linux tanpa layar (server/WSL tanpa X) tidak bisa membuka jendela
    return sys.platform.startswith("linux") and not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))


def open_profile(pw, profile: Path, headless: bool, browser: str | None = None):
    """Browser ber-profil tetap. Chrome asli bila terpasang (login Google lebih mulus), selain itu Chromium Playwright."""
    profile.mkdir(parents=True, exist_ok=True)
    os.chmod(profile.parent, 0o700)
    common = dict(
        headless=headless,
        locale="en-US",  # selektor tiktok-uploader memakai teks bahasa Inggris
        viewport={"width": 1280, "height": 860},
        args=["--disable-blink-features=AutomationControlled"],
        ignore_default_args=["--enable-automation"],
    )
    order = [browser] if browser else ["chrome", "chromium"]
    err = None
    for b in order:
        try:
            ctx = pw.chromium.launch_persistent_context(str(profile), channel="chrome" if b == "chrome" else None, **common)
            ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            return ctx, b
        except Exception as e:  # Chrome asli tidak ada -> Chromium
            err = e
    raise RuntimeError(f"browser tidak bisa dibuka: {str(err).splitlines()[0] if err else '?'}")


def install_mock(ctx) -> bool:
    """Selftest: semua permintaan dijawab halaman TikTok tiruan lokal (CC_TIKTOK_MOCK), tanpa jaringan."""
    mock = os.environ.get("CC_TIKTOK_MOCK")
    if not mock:
        return False
    html = Path(mock).read_text()

    def handle(route):
        url = route.request.url
        if "account/info" in url:
            route.fulfill(status=200, content_type="application/json", body='{"data": {"username": "akun_uji"}}')
        elif "tiktok.com" in url:
            route.fulfill(status=200, content_type="text/html", body=html)
        else:
            route.abort()

    ctx.route("**/*", handle)
    return True


def has_session(ctx) -> dict | None:
    for c in ctx.cookies(MAIN):
        if c.get("name") == "sessionid" and c.get("value"):
            return c
    return None


def account_name(page) -> str | None:
    """Nama akun yang sedang login (best effort; tidak wajib)."""
    try:
        # lewat fetch di halaman tiktok.com (cookie ikut, dan selftest tiruan ikut tercegat)
        if "tiktok.com" not in page.url:
            page.goto(MAIN, wait_until="domcontentloaded")
        d = (page.evaluate("async (u) => (await fetch(u, {credentials: 'include'})).json()", ACCOUNT_INFO) or {}).get("data") or {}
        name = d.get("username") or d.get("screen_name")
        return f"@{name}" if name and not str(name).startswith("@") else name
    except Exception:
        return None


def netscape_cookies(path: Path) -> list[dict]:
    out = []
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("#HttpOnly_"):
            line = line[len("#HttpOnly_"):]
        elif not line.strip() or line.startswith("#"):
            continue
        f = [x.strip() for x in line.split("\t")]
        if len(f) < 7 or "tiktok" not in f[0]:
            continue
        c = {"name": f[5], "value": f[6], "domain": f[0], "path": f[2] or "/", "secure": f[3].upper() == "TRUE"}
        try:
            exp = int(float(f[4]))
            if exp > 0:
                c["expires"] = exp
        except ValueError:
            pass
        out.append(c)
    return out


def write_account(acc_dir: Path, ctx, page, browser: str) -> dict:
    s = has_session(ctx)
    info = {
        "akun": account_name(page),
        "loginAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "sesiBerakhir": dt.datetime.fromtimestamp(s["expires"], dt.timezone.utc).isoformat(timespec="seconds") if s and s.get("expires", -1) > 0 else None,
        "browser": browser,
    }
    (acc_dir / "akun.json").write_text(json.dumps(info, indent=2, ensure_ascii=False) + "\n")
    return info


def cmd_login(a) -> int:
    from playwright.sync_api import sync_playwright

    acc = Path(a.dir)
    with sync_playwright() as pw:
        if a.cookies:
            ctx, browser = open_profile(pw, acc / "profil", headless=True, browser="chromium" if os.environ.get("CC_TIKTOK_MOCK") else None)
            install_mock(ctx)
            cookies = netscape_cookies(Path(a.cookies).expanduser())
            if not cookies:
                say("File cookies tidak berisi cookie tiktok.com (format Netscape cookies.txt).")
                return 2
            ctx.add_cookies(cookies)
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(MAIN, wait_until="domcontentloaded")
            if not has_session(ctx):
                say("Cookie tidak berisi sesi login TikTok yang masih berlaku (sessionid). Ekspor ulang dari browser yang sedang login.")
                ctx.close()
                return 2
        else:
            ctx, browser = open_profile(pw, acc / "profil", headless=False)
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            if not has_session(ctx):
                page.goto(LOGIN, wait_until="domcontentloaded")
                say("Silakan login TikTok di jendela browser yang terbuka (paling mudah: kode QR dari aplikasi TikTok).")
                say("Jendela tertutup sendiri setelah login berhasil. Jangan ketik sandi di obrolan.")
                t0 = time.time()
                while not has_session(ctx):
                    if time.time() - t0 > a.timeout:
                        say(f"Batas waktu {a.timeout // 60} menit habis sebelum login selesai.")
                        ctx.close()
                        return 3
                    if not ctx.pages:
                        say("Jendela browser ditutup sebelum login selesai.")
                        return 3
                    time.sleep(2)
                time.sleep(3)  # biarkan TikTok menulis cookie lain
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
        info = write_account(acc, ctx, page, browser)
        ctx.close()
    result(ok=True, **info)
    return 0


class Latihan(Exception):
    """Mode latihan: formulir terisi, tombol Post tidak diklik."""


class LabelAIGagal(Exception):
    pass


def set_ai_label(page) -> None:
    """Centang 'AI-generated content' di formulir unggah TikTok web. Gagal -> LabelAIGagal (unggahan dibatalkan)."""
    try:
        for t in ("Show more", "More options", "Advanced settings"):
            loc = page.get_by_text(t, exact=True)
            if loc.count() and loc.first.is_visible():
                loc.first.click()
                time.sleep(1)
                break
        label = page.get_by_text(re.compile(r"AI-generated content", re.I)).first
        label.wait_for(state="visible", timeout=15000)
        label.scroll_into_view_if_needed()
        box = label.locator("xpath=ancestor::*[.//input[@type='checkbox'] or .//*[@role='switch']][1]")
        sw = box.locator("input[type='checkbox'], [role='switch']").first

        def on() -> bool:
            try:
                return sw.is_checked()
            except Exception:
                return (sw.get_attribute("aria-checked") or "") == "true"

        if not on():
            sw.click(force=True)
            try:  # dialog konfirmasi
                page.get_by_role("button", name=re.compile(r"^(Turn on|Confirm|OK|Got it)$", re.I)).first.click(timeout=4000)
            except Exception:
                pass
            time.sleep(0.8)
        if not on():
            raise LabelAIGagal("sakelar label AI tidak berubah")
    except LabelAIGagal:
        raise
    except Exception as e:
        raise LabelAIGagal((str(e).strip().splitlines() or [type(e).__name__])[0][:160])


def set_description(page, text: str) -> None:
    """Ketik caption baris per baris. Tagar diketik lalu diakhiri spasi (tanpa memilih saran, agar tagar tidak berubah)."""
    from tiktok_uploader import config

    box = page.locator(f"xpath={config.selectors.upload.description}").first
    box.wait_for(state="visible", timeout=config.implicit_wait * 1000)
    box.click()
    box.press("Meta+A" if sys.platform == "darwin" else "Control+A")
    box.press("Backspace")
    time.sleep(0.5)
    popup = page.locator(f"xpath={config.selectors.upload.mention_box}")
    lines = text.split("\n")
    for i, line in enumerate(lines):
        words = [w for w in line.split(" ") if w]
        for j, w in enumerate(words):
            box.press_sequentially(w, delay=40 if w.startswith(("#", "@")) else 8)
            if w.startswith(("#", "@")):
                time.sleep(0.6)
            box.press_sequentially(" " if j < len(words) - 1 or w.startswith(("#", "@")) else "")
            try:
                if popup.first.is_visible():
                    box.press("Escape")
            except Exception:
                pass
        if i < len(lines) - 1:
            box.press("Enter")
    time.sleep(0.5)


def patch_library(page, job: dict, state: dict):
    """Sambungkan tiktok-uploader ke browser ber-profil kita, bungkam cetakan cookie, sisipkan label AI & latihan."""
    import tiktok_uploader.auth as tauth
    import tiktok_uploader.upload as tup

    tauth.print = lambda *a, **k: None  # pustaka mencetak isi cookie ("DEBUG: Adding cookie") -> dibungkam
    tup.get_browser = lambda *a, **k: page
    tup._set_description = set_description
    original_post = tup._post_video

    def post(pg):
        state["form"] = True  # video terunggah ke formulir, caption/sampul/jadwal sudah diisi
        if job.get("labelAI"):
            say("  label konten AI ...")
            set_ai_label(pg)
            state["labelAI"] = True
        if job.get("latihan"):
            shot = job.get("screenshot")
            if shot:
                pg.screenshot(path=shot, full_page=True)
            raise Latihan()
        say("  klik Post ...")
        original_post(pg)
        state["posted"] = True

    tup._post_video = post
    return tup


class Collect(logging.Handler):
    def __init__(self):
        super().__init__(logging.ERROR)
        self.msgs: list[str] = []

    def emit(self, record):
        try:
            msg = str(record.getMessage()).strip()
        except Exception:
            return
        if not msg:
            return
        if "cookie" in msg.lower():
            msg = "(pesan tentang cookie disembunyikan)"
        self.msgs.append(msg.splitlines()[0][:200])


def cmd_upload(a) -> int:
    from playwright.sync_api import sync_playwright

    job = json.loads(Path(a.job).read_text())
    acc = Path(job["dir"])
    meta = json.loads((acc / "akun.json").read_text()) if (acc / "akun.json").exists() else {}
    headless = job.get("headless") if job.get("headless") is not None else headless_default()
    state: dict = {}
    col = Collect()
    logging.getLogger("tiktok_uploader").addHandler(col)
    with sync_playwright() as pw:
        ctx, browser = open_profile(pw, acc / "profil", headless=headless, browser=meta.get("browser"))
        mock = install_mock(ctx)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            page.goto(MAIN, wait_until="domcontentloaded")
            if not has_session(ctx):
                result(ok=False, alasan="login", pesan="sesi login TikTok tidak ada/kedaluwarsa")
                return 4
            akun = account_name(page) or meta.get("akun")
            if job.get("akunDiharapkan") and akun and akun.lower() != job["akunDiharapkan"].lower():
                result(ok=False, alasan="akun", pesan=f"browser login sebagai {akun}, bukan {job['akunDiharapkan']}")
                return 4
            tup = patch_library(page, job, state)
            sched = dt.datetime.fromisoformat(job["jadwalUTC"]).astimezone(dt.timezone.utc) if job.get("jadwalUTC") else None
            up = tup.TikTokUploader(cookies_list=[c for c in ctx.cookies(MAIN)], browser="chromium", headless=headless)
            say(f"Mengunggah ke TikTok {akun or ''} ({'jadwal ' + job['jadwalLokal'] if sched else 'tayang sekarang'}"
                f"{', privat' if job.get('privat') else ''}{', LATIHAN tanpa klik Post' if job.get('latihan') else ''}) ...")
            failed = up.upload_videos(
                [{"path": job["video"], "description": job["caption"], **({"schedule": sched} if sched else {}),
                  **({"cover": job["cover"]} if job.get("cover") else {}),
                  **({"visibility": "only_you"} if job.get("privat") else {})}],
                comment=job.get("comment", True), stitch=job.get("stitch", True), duet=job.get("duet", True),
            )
            errs = [m for m in col.msgs if m]
            if job.get("latihan") and not state.get("posted"):
                # Latihan dilempar sebagai pengecualian -> dicatat pustaka sebagai gagal; itu yang diharapkan
                ok = bool(state.get("form")) and (bool(state.get("labelAI")) or not job.get("labelAI"))
                result(ok=ok, latihan=True, akun=akun, labelAI=bool(state.get("labelAI")), screenshot=job.get("screenshot"),
                       pesan=None if ok else "; ".join(errs[-3:]))
                return 0 if ok else 5
            if failed or not state.get("posted"):
                if job.get("labelAI") and state.get("form") and not state.get("labelAI"):
                    result(ok=False, alasan="labelAI", akun=akun, pesan="label konten AI tidak bisa dicentang; unggah video ini manual")
                else:
                    result(ok=False, alasan="unggah", akun=akun, pesan="; ".join(errs[-3:]) or "unggahan gagal")
                try:
                    if job.get("screenshotGagal"):
                        page.screenshot(path=job["screenshotGagal"], full_page=True)
                except Exception:
                    pass
                return 5
            extra = {"tiruan": page.evaluate("window.__posted || null")} if mock else {}
            result(ok=True, akun=akun, labelAI=bool(state.get("labelAI")), browser=browser, **extra)
            return 0
        except Exception as e:
            msg = (str(e).strip().splitlines() or [type(e).__name__])[0][:200]
            alasan = "login" if "InsufficientAuth" in type(e).__name__ or "Authentication failed" in msg else "unggah"
            result(ok=False, alasan=alasan, pesan=msg)
            try:
                if job.get("screenshotGagal"):
                    page.screenshot(path=job["screenshotGagal"], full_page=True)
            except Exception:
                pass
            return 5
        finally:
            try:
                ctx.close()
            except Exception:
                pass


def cmd_selfcheck(_a) -> int:
    import importlib.metadata as md

    import tiktok_uploader.auth as tauth
    import tiktok_uploader.upload as tup
    from tiktok_uploader import config

    need = ["get_browser", "_post_video", "_set_description", "complete_upload_form", "TikTokUploader", "_set_cover", "_set_schedule_video", "_set_visibility"]
    miss = [n for n in need if not hasattr(tup, n)]
    if not hasattr(tauth, "AuthBackend"):
        miss.append("auth.AuthBackend")
    # cookie tidak tercetak setelah dibungkam
    import contextlib
    import io

    buf = io.StringIO()
    tauth.print = lambda *x, **k: None
    with contextlib.redirect_stdout(buf):
        tauth.print("DEBUG: Adding cookie: {'value': 'rahasia'}")
    leak = "rahasia" in buf.getvalue()
    tmp = Path(os.environ.get("TMPDIR", "/tmp")) / "cc-tiktok-selfcheck.txt"
    tmp.write_text("# Netscape HTTP Cookie File\n.tiktok.com\tTRUE\t/\tTRUE\t4102444800\tsessionid\tx\n#HttpOnly_.tiktok.com\tTRUE\t/\tTRUE\t0\ttt\ty\n.example.com\tTRUE\t/\tFALSE\t0\ta\tb\n")
    parsed = netscape_cookies(tmp)
    tmp.unlink()
    ok = not miss and not leak and [c["name"] for c in parsed] == ["sessionid", "tt"] and "upload" in str(config.paths.upload) and bool(config.selectors.upload.description) and bool(config.selectors.upload.mention_box)
    result(ok=ok, versi=md.version("tiktok-uploader"), hilang=miss, bocorCookie=leak, cookieTerbaca=len(parsed))
    return 0 if ok else 6


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    lg = sub.add_parser("login")
    lg.add_argument("--dir", required=True)
    lg.add_argument("--cookies")
    lg.add_argument("--timeout", type=int, default=600)
    upl = sub.add_parser("upload")
    upl.add_argument("job")
    sub.add_parser("selfcheck")
    a = ap.parse_args()
    return {"login": cmd_login, "upload": cmd_upload, "selfcheck": cmd_selfcheck}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
