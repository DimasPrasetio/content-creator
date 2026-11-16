// Cek tata letak otomatis untuk frame yang sedang tampil (dipakai komposisi Pop/Video lewat <LayoutProbe/> dan
// jalur HTML lewat scripts/html_render.py; file: src/probe/measure.js). Fungsi murni DOM, tanpa dependensi; JANGAN memakai sintaks TS di sini.
// Mengukur setiap teks yang benar-benar terlihat (opasitas efektif >= 0.3, tidak display:none/visibility:hidden),
// memotongnya dengan wadah overflow, lalu memberi:
//   errors: teks keluar bingkai, terpotong wadahnya, menabrak brand pojok, tertutup UI bawah Reels (y > 1700)
//   warns : di atas area aman (y < 340), di area bawah (y > 1460), tabrakan antarteks (> 25% luas yang lebih kecil)
// Elemen brand ditandai data-probe="brand"; elemen dekoratif data-probe="ignore"; lapisan kamera kit (data-probe="camera")
// sengaja memotong UI di tepi bingkai kamera, jadi teks di dalamnya tidak dilaporkan "terpotong oleh wadahnya".
export function probeLayout(opts) {
  // batas: brandBand = pita brand pojok; safeTop/safeBottom = pita teks utama (arahan pop-cinematic: y 150-1500,
  // dengan cadangan untuk judul Reels di atas); uiBottom = mulai area caption/tombol Reels
  const o = Object.assign({ width: 1080, height: 1920, brandBand: 130, safeTop: 220, safeBottom: 1500, uiBottom: 1700 }, opts || {});
  // titik nol: penanda data-probe="root" (komposisi Remotion) bila ada, kalau tidak jendela browser (jalur HTML)
  const rootEl = document.querySelector('[data-probe="root"]');
  const R = rootEl ? rootEl.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const sx = o.width / R.width;
  const sy = o.height / R.height;
  const S = (r) => ({ x: (r.left - R.left) * sx, y: (r.top - R.top) * sy, r: (r.right - R.left) * sx, b: (r.bottom - R.top) * sy });
  const area = (a) => Math.max(0, a.r - a.x) * Math.max(0, a.b - a.y);
  const inter = (a, b) => ({ x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const info = (el) => {
    let op = 1;
    let clip = null;
    let cam = false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (e.dataset && e.dataset.probe === "ignore") return null;
      if (e.dataset && e.dataset.probe === "camera") cam = true;
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") return null;
      op *= parseFloat(cs.opacity || "1");
      if (e !== el && e !== document.body && e !== document.documentElement && (cs.overflow !== "visible" || cs.clipPath !== "none")) {
        const r = S(e.getBoundingClientRect());
        clip = clip ? inter(clip, r) : r;
      }
    }
    return { op, clip, cam };
  };
  const brand = [...document.querySelectorAll('[data-probe="brand"]')].flatMap((b) =>
    [...b.querySelectorAll("*")].filter((c) => c.children.length === 0 && (c.textContent.trim() || c.tagName === "IMG")).map((c) => S(c.getBoundingClientRect())),
  ).filter((r) => area(r) > 4);
  const items = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.replace(/\s+/g, " ").trim();
    if (!text || !n.parentElement || n.parentElement.closest('[data-probe="brand"],script,style')) continue;
    const i = info(n.parentElement);
    if (!i || i.op < 0.3) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const line = S(rg.getBoundingClientRect());
    if (area(line) < 20) continue;
    // kotak baris lebih tinggi dari huruf (ascent/descent, line-height rapat): pakai pita huruf ±0,74 em di tengah
    const fs = parseFloat(getComputedStyle(n.parentElement).fontSize) * sy * (line.r - line.x) / Math.max(1, rg.getBoundingClientRect().width * sx);
    const gh = Math.min(line.b - line.y, 0.74 * fs);
    const mid = (line.y + line.b) / 2;
    const box = { x: line.x, r: line.r, y: mid - gh / 2, b: mid + gh / 2 };
    const vis = i.clip ? inter(box, i.clip) : box;
    if (area(vis) < 20) continue;
    items.push({ t: text.slice(0, 40), el: n.parentElement, box, vis, cut: 1 - area(vis) / area(box), cam: i.cam });
  }
  const errors = [];
  const warns = [];
  const at = (it) => `"${it.t}" (x ${Math.round(it.vis.x)}-${Math.round(it.vis.r)}, y ${Math.round(it.vis.y)}-${Math.round(it.vis.b)})`;
  for (const it of items) {
    const v = it.vis;
    if (v.x < -2 || v.r > o.width + 2 || v.y < -2 || v.b > o.height + 2) errors.push(`keluar bingkai: ${at(it)}`);
    else if (it.cut > 0.04 && !it.cam) errors.push(`terpotong ${Math.round(it.cut * 100)}% oleh wadahnya: ${at(it)}`);
    if (brand.some((b) => area(inter(b, v)) > 4)) errors.push(`menabrak brand pojok: ${at(it)}`);
    else if (!brand.length && v.y < o.brandBand) errors.push(`masuk pita brand pojok (y < ${o.brandBand}): ${at(it)}`);
    else if (v.y < o.safeTop) warns.push(`di atas area aman (y < ${o.safeTop}): ${at(it)}`);
    if (v.b > o.uiBottom) errors.push(`tertutup UI bawah Reels (y > ${o.uiBottom}): ${at(it)}`);
    else if (v.b > o.safeBottom) warns.push(`di area bawah (y > ${o.safeBottom}): ${at(it)}`);
  }
  for (let a = 0; a < items.length; a++)
    for (let b = a + 1; b < items.length; b++) {
      const A = items[a];
      const B = items[b];
      if (A.el === B.el || A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const ov = area(inter(A.vis, B.vis));
      if (ov > 0.25 * Math.min(area(A.vis), area(B.vis))) warns.push(`tabrakan teks: ${at(A)} dengan ${at(B)}`);
    }
  // pita vertikal teks yang terlihat (dipakai export.mjs untuk memutuskan potong atau kecilkan)
  const band = items.length ? [Math.round(Math.min(...items.map((i) => i.vis.y))), Math.round(Math.max(...items.map((i) => i.vis.b)))] : null;
  return { texts: items.length, band, errors, warns };
}
