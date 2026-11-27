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
            ch = "chrome" if b == "chrome" else None
            ctx = pw.chromium.launch_persistent_context(str(profile), channel=ch, **common)
            if headless:
                # Chrome headless baru = browser yang sama, hanya identitasnya "HeadlessChrome" -> samakan dengan Chrome biasa
                pg = ctx.pages[0] if ctx.pages else ctx.new_page()
                ua = pg.evaluate("navigator.userAgent")
                if "HeadlessChrome" in ua:
                    ctx.close()
                    ctx = pw.chromium.launch_persistent_context(str(profile), channel=ch, user_agent=ua.replace("HeadlessChrome", "Chrome"), **common)
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
    if os.environ.get("CC_TIKTOK_MOCK_COVER") == "gagal":  # selftest: editor sampul menolak Save
        ctx.add_init_script("window.__mockCoverFail = true")
    if os.environ.get("CC_TIKTOK_MOCK_CAPTCHA") == "ya":  # selftest: TikTok meminta CAPTCHA setelah video dipilih
        ctx.add_init_script("window.__mockCaptcha = true")
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


class SampulGagal(Exception):
    """Sampul khusus (thumbnail.jpg) tidak terpasang -> unggahan dibatalkan; video tidak boleh tayang tanpa sampul."""


CAPTCHA_STOP: list[str] = []  # pustaka menelan pengecualian langkah formulir -> CAPTCHA dicatat di sini


class CaptchaPerlu(Exception):
    """TikTok meminta CAPTCHA. Tidak pernah ditembus: browser tersembunyi berhenti, browser berjendela menunggu pengguna."""

    def __init__(self, msg: str):
        super().__init__(msg)
        CAPTCHA_STOP.append(msg)


CAPTCHA_SEL = "[id*='captcha' i], [class*='captcha' i], iframe[src*='captcha' i]"
CAPTCHA_WAIT = int(os.environ.get("CC_TIKTOK_CAPTCHA_WAIT", "300"))


def captcha_visible(page) -> bool:
    try:
        loc = page.locator(CAPTCHA_SEL)
        return any(loc.nth(i).is_visible() for i in range(min(loc.count(), 10)))
    except Exception:
        return False


def check_captcha(page, headless: bool) -> None:
    """CAPTCHA muncul: tersembunyi -> berhenti (ulangi dengan --jendela); berjendela -> tunggu pengguna menyelesaikannya."""
    if not captcha_visible(page):
        return
    if headless:
        raise CaptchaPerlu("TikTok meminta CAPTCHA di browser tersembunyi")
    say(f"  TikTok meminta CAPTCHA: selesaikan sendiri di jendela browser (menunggu {CAPTCHA_WAIT // 60} menit) ...")
    end = time.time() + CAPTCHA_WAIT
    while time.time() < end:
        time.sleep(2)
        if not captcha_visible(page):
            say("  CAPTCHA selesai, lanjut")
            time.sleep(1.5)
            return
    raise CaptchaPerlu(f"CAPTCHA tidak diselesaikan dalam {CAPTCHA_WAIT // 60} menit")


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


def expand_settings(page) -> None:
    """Buka 'Show more' di bagian Settings (komentar/reuse/label AI tersembunyi di sana sejak tampilan TikTok 2026)."""
    for t in ("Show more", "More options", "Advanced settings"):
        try:
            loc = page.get_by_text(t, exact=True)
            if loc.count() and loc.first.is_visible():
                loc.first.scroll_into_view_if_needed()
                loc.first.click(timeout=5000)
                time.sleep(1)
                return
        except Exception:
            continue


def _checkbox(page, text: str):
    """Kotak centang TikTok (label.Checkbox__root berisi teks) atau gaya lama (label + input saudara)."""
    new = page.locator("label[class*='Checkbox__root']").filter(has_text=re.compile(rf"^\s*{re.escape(text)}\s*$", re.I))
    if new.count():
        lab = new.first
        state = lambda: (lab.get_attribute("data-checked") or lab.get_attribute("aria-checked") or "") == "true"  # noqa: E731
        disabled = (lab.get_attribute("data-disabled") or lab.get_attribute("aria-disabled") or "") == "true"
        return lab, state, disabled
    old = page.locator(f"xpath=//label[.='{text}']/following-sibling::div/input")
    if old.count():
        inp = old.first
        return inp, inp.is_checked, inp.is_disabled()
    return None, None, False


def set_interactivity(state_out: dict):
    """Komentar & reuse (duet/stitch digabung TikTok jadi 'Reuse of content'; tidak tersedia untuk video > 60 dtk)."""

    def run(page, comment: bool = True, stitch: bool = True, duet: bool = True, *a, **k) -> None:
        expand_settings(page)
        want = {"Comment": comment}
        if page.locator("label[class*='Checkbox__root']").filter(has_text=re.compile(r"Reuse of content", re.I)).count():
            want["Reuse of content"] = duet or stitch
        else:
            want.update({"Duet": duet, "Stitch": stitch})
        done = {}
        for text, on in want.items():
            try:
                el, checked, disabled = _checkbox(page, text)
                if el is None:
                    done[text] = "tidak ada"
                    continue
                if disabled:
                    done[text] = "tidak tersedia"
                    continue
                if checked() != on:
                    el.scroll_into_view_if_needed()
                    el.click(timeout=5000)
                    time.sleep(0.5)
                done[text] = "ya" if checked() else "tidak"
            except Exception as e:
                done[text] = "gagal: " + (str(e).strip().splitlines() or [type(e).__name__])[0][:60]
        state_out["interaksi"] = done

    return run


def cover_signature(edit_btn):
    """Ciri gambar sampul di formulir (src <img> di kotak Cover, cadangan: hash tangkapan kotak itu)."""
    import hashlib

    try:
        box = edit_btn.locator("xpath=ancestor::*[.//img or .//canvas][1]")
        img = box.locator("img")
        if img.count():
            src = img.first.get_attribute("src") or ""
            if src:
                return "src:" + hashlib.sha1(src.encode()).hexdigest()
        return "shot:" + hashlib.sha1(box.first.screenshot(timeout=5000)).hexdigest()
    except Exception:
        return None


def set_cover(state_out: dict):
    """Sampul khusus lewat editor 'Edit cover': tombol Upload cover (pemilih file) -> Save -> sampul formulir harus
    berubah. Gagal -> SampulGagal (unggahan dibatalkan)."""

    def run(page, cover_path: str) -> None:
        dbg = os.environ.get("TIKTOK_DEBUG_DIR")

        def shot(tag):
            if dbg:
                try:
                    page.screenshot(path=str(Path(dbg) / f"sampul-{tag}.png"), full_page=False)
                except Exception:
                    pass

        try:
            if not cover_path or not Path(cover_path).exists():
                raise RuntimeError("file sampul tidak ada")
            btn = page.get_by_text("Edit cover", exact=True)
            if not btn.count():
                btn = page.locator("xpath=//div[contains(@class, 'edit-container')]")
            btn.first.scroll_into_view_if_needed()
            sebelum = cover_signature(btn.first)
            btn.first.click(timeout=15000)
            time.sleep(1.5)
            shot("1-editor")
            # Editor baru (2026-11): "Upload cover" = tombol di samping strip frame, membuka pemilih file.
            # input[type=file] yang tersembunyi diabaikan editor, jadi pakai file chooser dari tombol itu.
            up = page.get_by_text("Upload cover", exact=True).filter(visible=True)
            up.first.wait_for(state="visible", timeout=30000)  # editor selesai memuat frame
            time.sleep(1)
            shot("1b-editor-siap")
            try:
                with page.expect_file_chooser(timeout=8000) as fc:
                    up.first.click(timeout=5000)
                fc.value.set_files(cover_path)
                cara = "pemilih file"
            except Exception:
                inp = page.locator("input[type='file'][accept*='image']")
                inp.last.wait_for(state="attached", timeout=10000)
                inp.last.set_input_files(cover_path)
                cara = "input tersembunyi"
            if dbg:
                say(f"  [debug] sampul dipilih lewat {cara}")
            time.sleep(4)
            shot("2-setelah-pilih-file")
            save = page.get_by_role("button", name=re.compile(r"^\s*(Save|Confirm|Done)\s*$", re.I))
            for i in range(save.count()):
                b = save.nth(i)
                if b.is_visible():
                    for _ in range(30):  # tombol aktif setelah gambar diproses
                        if b.is_enabled() and (b.get_attribute("aria-disabled") or "false") != "true":
                            break
                        time.sleep(0.5)
                    shot("3-sebelum-save")
                    b.click(timeout=10000)
                    break
            else:
                raise RuntimeError("tombol Save sampul tidak ditemukan")
            for _ in range(30):  # editor tertutup = tersimpan
                if not page.get_by_text("Upload cover", exact=True).filter(visible=True).count():
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError("editor sampul tidak tertutup setelah Save")
            time.sleep(1)
            shot("4-setelah-save")
            # Bukti nyata: gambar sampul di formulir harus berubah (editor tertutup saja belum tentu tersimpan).
            sesudah = None
            for _ in range(20):
                b2 = page.get_by_text("Edit cover", exact=True)
                sesudah = cover_signature(b2.first) if b2.count() else None
                if sebelum and sesudah and sesudah != sebelum:
                    break
                time.sleep(0.5)
            if dbg:
                say(f"  [debug] sampul formulir: sebelum {str(sebelum)[:60]!r} · sesudah {str(sesudah)[:60]!r}")
            if not sebelum or not sesudah:
                raise RuntimeError("gambar sampul di formulir tidak terbaca, tidak bisa memastikan sampul terpasang")
            if sesudah == sebelum:
                raise RuntimeError("sampul di formulir tidak berubah setelah Save (TikTok tetap memakai frame video)")
            state_out["sampul"] = True
        except Exception as e:
            state_out["sampul"] = False
            state_out["sampulPesan"] = (str(e).strip().splitlines() or [type(e).__name__])[0][:160]
            say(f"  sampul khusus gagal ({state_out['sampulPesan']}): unggahan DIBATALKAN")
            for name in ("Cancel", "Discard"):  # tutup editor agar formulir bisa lanjut
                try:
                    c = page.get_by_role("button", name=name, exact=True)
                    if c.count() and c.first.is_visible():
                        c.first.click(timeout=3000)
                        time.sleep(0.8)
                        break
                except Exception:
                    pass
            raise SampulGagal(state_out["sampulPesan"])

    return run


POPUP_SCOPES = "[data-floating-ui-portal], [role='dialog'], [class*='TUXModal'], [class*='modal']"
# Tombol yang MENOLAK/menutup popup info TikTok (mis. "Turn on automatic content checks?" -> Cancel, tooltip fitur baru
# -> Got it). Tidak pernah "Turn on"/"Post now"/"Discard": pengaturan akun tidak diubah dan unggahan tidak dibuang.
POPUP_BUTTONS = re.compile(r"^\s*(Got it|Cancel|Not now|Skip|Dismiss|Close|Maybe later|OK)\s*$", re.I)


def dismiss_popups(page, rounds: int = 4) -> int:
    """Tutup popup/tooltip TikTok yang menghalangi klik formulir. Mengembalikan jumlah popup yang ditutup."""
    closed = 0
    for _ in range(rounds):
        hit = False
        for loc in (
            page.locator(POPUP_SCOPES).get_by_role("button", name=POPUP_BUTTONS),
            page.get_by_role("button", name=re.compile(r"^\s*Got it\s*$", re.I)),
        ):
            try:
                n = loc.count()
            except Exception:
                n = 0
            for i in range(n):
                b = loc.nth(i)
                try:
                    if b.is_visible():
                        b.click(timeout=3000)
                        hit = True
                        closed += 1
                        time.sleep(0.7)
                        break
                except Exception:
                    continue
            if hit:
                break
        if not hit:
            break
    if closed:
        say(f"  popup TikTok ditutup ({closed})")
    return closed


def patch_library(page, job: dict, state: dict, headless: bool = True):
    """Sambungkan tiktok-uploader ke browser ber-profil kita, bungkam cetakan cookie, sisipkan label AI & latihan."""
    import tiktok_uploader.auth as tauth
    import tiktok_uploader.upload as tup

    tauth.print = lambda *a, **k: None  # pustaka mencetak isi cookie ("DEBUG: Adding cookie") -> dibungkam
    tup.get_browser = lambda *a, **k: page
    tup._set_description = set_description
    tup._set_cover = set_cover(state)
    tup._set_interactivity = set_interactivity(state)

    # popup TikTok (cek konten otomatis, fitur baru, dsb.) muncul setelah video terunggah dan menghalangi klik:
    # tutup sebelum dan sesudah setiap langkah formulir
    def guarded(fn):
        def run(pg, *a, **k):
            check_captcha(pg, headless)
            dismiss_popups(pg)
            out = fn(pg, *a, **k)
            check_captcha(pg, headless)
            dismiss_popups(pg)
            return out

        return run

    for name in ("_set_video", "_set_cover", "_remove_split_window", "_set_interactivity", "_set_description", "_set_visibility", "_set_schedule_video"):
        if hasattr(tup, name):
            setattr(tup, name, guarded(getattr(tup, name)))
    original_post = tup._post_video

    def post(pg):
        check_captcha(pg, headless)
        dismiss_popups(pg)
        state["form"] = True  # video terunggah ke formulir, caption/sampul/jadwal sudah diisi
        if state.get("sampul") is not True:  # pengaman kedua: tanpa sampul khusus tidak pernah sampai ke Post
            state["sampul"] = False
            state.setdefault("sampulPesan", "sampul khusus belum terpasang")
            raise SampulGagal(state["sampulPesan"])
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
    # bawaan: browser tersembunyi (headless); --jendela = terlihat (untuk CAPTCHA). Tanpa layar selalu tersembunyi.
    headless = True if job.get("headless") is None else bool(job["headless"])
    if not headless and headless_default():
        say("Tidak ada layar di komputer ini: memakai browser tersembunyi.")
        headless = True
    state: dict = {}
    col = Collect()
    logging.getLogger("tiktok_uploader").addHandler(col)
    with sync_playwright() as pw:
        ctx, browser = open_profile(pw, acc / "profil", headless=headless, browser=meta.get("browser"))
        mock = install_mock(ctx)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            page.goto(MAIN, wait_until="domcontentloaded")
            check_captcha(page, headless)
            if not has_session(ctx):
                result(ok=False, alasan="login", pesan="sesi login TikTok tidak ada/kedaluwarsa")
                return 4
            akun = account_name(page) or meta.get("akun")
            if job.get("akunDiharapkan") and akun and akun.lower() != job["akunDiharapkan"].lower():
                result(ok=False, alasan="akun", pesan=f"browser login sebagai {akun}, bukan {job['akunDiharapkan']}")
                return 4
            tup = patch_library(page, job, state, headless)
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
            if CAPTCHA_STOP or (not state.get("posted") and captcha_visible(page)):
                result(ok=False, alasan="captcha", akun=akun, headless=headless, pesan=(CAPTCHA_STOP or ["TikTok meminta CAPTCHA"])[-1])
                try:
                    if job.get("screenshotGagal"):
                        page.screenshot(path=job["screenshotGagal"], full_page=True)
                except Exception:
                    pass
                return 5
            if job.get("latihan") and not state.get("posted"):
                # Latihan dilempar sebagai pengecualian -> dicatat pustaka sebagai gagal; itu yang diharapkan
                ok = bool(state.get("form")) and state.get("sampul") is True and (bool(state.get("labelAI")) or not job.get("labelAI"))
                result(ok=ok, latihan=True, akun=akun, labelAI=bool(state.get("labelAI")), sampul=state.get("sampul"), sampulPesan=state.get("sampulPesan"), interaksi=state.get("interaksi"), screenshot=job.get("screenshot"),
                       pesan=None if ok else "; ".join(errs[-3:]))
                return 0 if ok else 5
            if failed or not state.get("posted"):
                if state.get("sampul") is False:
                    result(ok=False, alasan="sampul", akun=akun, sampul=False, pesan=state.get("sampulPesan") or "sampul khusus tidak terpasang")
                elif job.get("labelAI") and state.get("form") and not state.get("labelAI"):
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
            result(ok=True, akun=akun, labelAI=bool(state.get("labelAI")), sampul=state.get("sampul"), sampulPesan=state.get("sampulPesan"), interaksi=state.get("interaksi"), browser=browser, **extra)
            return 0
        except Exception as e:
            msg = (str(e).strip().splitlines() or [type(e).__name__])[0][:200]
            alasan = "login" if "InsufficientAuth" in type(e).__name__ or "Authentication failed" in msg else "unggah"
            if isinstance(e, CaptchaPerlu) or CAPTCHA_STOP or captcha_visible(page):
                alasan = "captcha"
            result(ok=False, alasan=alasan, headless=headless, pesan=msg)
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
