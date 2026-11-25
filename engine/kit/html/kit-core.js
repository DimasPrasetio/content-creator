// Kit HTML standar content-creator · inti (pustaka gambar + komponen). Disalin ke Projects/<nama>/html/ oleh `npm run new`.
// Urutan muat: theme.js (THEME dari Brands/<slug>/theme.json) -> kit-core.js -> scenes.js (scene khusus video) -> kit-run.js.
// Semua deklarasi top-level dipakai bersama (script klasik, satu lingkup global). Dokumentasi: Engine/kit/html/README.md.
// ---------- data & util ----------
const THEME_ = typeof THEME === "undefined" ? {} : THEME;
const C = { ...THEME_.colors };
// alias nama lama (dipakai halaman lama): gold=accent, teal=accent2, sky=info, green=ok, orange=warn, red=bad
Object.assign(C, { gold: C.accent, teal: C.accent2, sky: C.info, green: C.ok, orange: C.warn, red: C.bad, magenta: C.extra });
const F = { head: "Poppins", body: "Inter", mono: "Menlo, monospace", ...(THEME_.fonts || {}) };
const SW = THEME_.stroke ?? 5;
const col = (k) => (k && C[k]) || k;   // nama warna tema atau kode hex
const tint = (hex, a) => { const h = col(hex).replace("#", ""); const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
(function applyTheme() {
  const r = document.documentElement.style;
  // tata letak: bawaan zona aman TikTok (kit.css); tema "layout": "penuh" = tata letak lama tanpa zona aman
  if (THEME_.layout === "penuh" && (window.__CANVAS__?.format ?? "9:16") === "9:16") document.getElementById("stage").classList.add("layout-penuh");
  for (const [k, v] of Object.entries(C)) if (v) r.setProperty(`--${k}`, v);
  r.setProperty("--grid", THEME_.colors.grid); r.setProperty("--font-head", F.head); r.setProperty("--font-body", F.body);
  r.setProperty("--progress", col(THEME_.progress || "accent2")); r.setProperty("--label", col(THEME_.label?.text || "accent2"));
  r.setProperty("--glow1", tint(THEME_.glow?.[0] || "accent", 0.09)); r.setProperty("--glow2", tint(THEME_.glow?.[1] || "accent2", 0.035));
  const hl = THEME_.highlight || {}; r.setProperty("--hl-bg", col(hl.bg || "accent")); r.setProperty("--hl-fg", col(hl.fg || "bg")); r.setProperty("--hl-glow", tint(hl.bg || "accent", 0.35));
  const wm = document.getElementById("wm"), W = THEME_.watermark;
  if (W && W.src) { const im = document.createElement("img"); im.src = W.src; im.alt = W.alt || "logo"; Object.assign(im.style, { height: (W.size || 40) + "px", display: "block" }); wm.appendChild(im); wm.style.opacity = W.opacity ?? 1; }
  else if (W && W.parts) { W.parts.forEach(([t, c]) => { const s = document.createElement("span"); s.textContent = t; s.style.color = col(c); wm.appendChild(s); }); wm.style.opacity = W.opacity ?? 1; if (W.size) wm.style.fontSize = W.size + "px"; }
  else wm.remove();
})();
// ---------- kanvas (v0.8): 9:16 bawaan (kit.css), 16:9 / 4:5 / 1:1 ditata di sini ----------
// Koordinat zona untuk scenes.js tetap: tinggi 1000, pusat x 540. Di format lebih lebar zona melebar ke KIRI & KANAN
// (viewBox x ZONE.x0..ZONE.x1), jadi scene lama tetap di tengah dan scene baru boleh memakai ruang ekstra.
const CANVAS = window.__CANVAS__ || { format: "9:16", w: 1080, h: 1920 };
const FMT = CANVAS.format || "9:16";
const KIT_GEO = {
  "9:16": { zone: { left: 14, top: 316, s: 0.9, w: 1080 }, shots: { left: 14, top: 262, s: 0.9, w: 1080 }, sub: { chars: 42 } },
  "16:9": { zone: { left: 96, top: 190, s: 0.66, w: 2618 }, shots: { left: 96, top: 186, s: 0.6, w: 2880 },
    track: { l: 96, t: 124, w: 1728 }, label: { l: 96, t: 140 }, wm: { r: 96, t: 134 }, glow: { l: 610, t: 160, d: 700 },
    sub: { l: 96, t: 868, w: 1728, h: 134, font: 46, cw: 1640, chars: 64 } },
  "4:5": { zone: { left: 54, top: 190, s: 0.86, w: 1130 }, shots: { left: 54, top: 186, s: 0.8, w: 1215 },
    track: { l: 54, t: 120, w: 972 }, label: { l: 54, t: 136 }, wm: { r: 54, t: 130 }, glow: { l: 110, t: 220, d: 860 },
    sub: { l: 54, t: 1112, w: 972, h: 160, font: 46, cw: 912, chars: 40 } },
  "1:1": { zone: { left: 54, top: 186, s: 0.66, w: 1473 }, shots: { left: 54, top: 182, s: 0.6, w: 1620 },
    track: { l: 54, t: 120, w: 972 }, label: { l: 54, t: 136 }, wm: { r: 54, t: 130 }, glow: { l: 240, t: 190, d: 600 },
    sub: { l: 54, t: 866, w: 972, h: 140, font: 44, cw: 912, chars: 40 } },
}[FMT] || null;
if (!KIT_GEO) console.error(`format kanvas tidak dikenal: ${FMT}`);
const ZONE = (() => { const w = KIT_GEO?.zone.w ?? 1080, x0 = (1080 - w) / 2; return { x0, x1: x0 + w, w, h: 1000, cx: 540 }; })();
(function applyCanvas() {
  if (FMT === "9:16" || !KIT_GEO) return;
  const $ = (id) => document.getElementById(id), px = (v) => v + "px", G = KIT_GEO;
  const stage = $("stage"); Object.assign(stage.style, { width: px(CANVAS.w), height: px(CANVAS.h) }); stage.classList.add("fmt-" + FMT.replace(":", "x"));
  const z = $("zone"); z.setAttribute("width", G.zone.w); z.setAttribute("height", 1000); z.setAttribute("viewBox", `${ZONE.x0} 0 ${ZONE.w} 1000`);
  Object.assign(z.style, { left: px(G.zone.left), top: px(G.zone.top), transform: `scale(${G.zone.s})` });
  // stabilo/CTA memakai koordinat layar lama (x = x zona, y = 250 + y zona)
  $("qs").style.transform = `translate(${G.zone.left - ZONE.x0 * G.zone.s}px, ${G.zone.top - 250 * G.zone.s}px) scale(${G.zone.s})`;
  Object.assign($("shots").style, { left: px(G.shots.left), top: px(G.shots.top), width: px(G.shots.w), transform: `scale(${G.shots.s})` });
  Object.assign($("track").style, { left: px(G.track.l), top: px(G.track.t), width: px(G.track.w) });
  Object.assign($("label").style, { left: px(G.label.l), top: px(G.label.t) });
  const wm = $("wm"); if (wm) Object.assign(wm.style, { right: px(G.wm.r), top: px(G.wm.t) });
  Object.assign($("glow").style, { left: px(G.glow.l), top: px(G.glow.t), width: px(G.glow.d), height: px(G.glow.d) });
  Object.assign($("subbox").style, { left: px(G.sub.l), top: px(G.sub.t), width: px(G.sub.w), height: px(G.sub.h) });
  const st = document.createElement("style");
  st.textContent = `#stage.fmt-${FMT.replace(":", "x")} .chunk { width: ${G.sub.cw}px; font-size: ${G.sub.font}px; }`;
  document.head.appendChild(st);
})();
const TM = window.__TIMING__;
const SC = TM.scenes;
const TOTAL = TM.total;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const eo = (p) => 1 - Math.pow(1 - p, 3);
const eio = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const back = (p) => { const c = 1.5; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// antisipasi: elemen muncul LEAD detik sebelum katanya (mata menangkap visual sedikit lebih dulu dari telinga = terasa pas)
const LEAD = THEME_.timing?.lead ?? 0.12;
// jangkar scene: objek utama hadir sejak scene dimulai (bukan menunggu kata); at(s, f) = titik f (0-1) di sepanjang scene
const start = (si, d = 0.05) => SC[si].start + d;
const at = (si, f) => SC[si].start + (SC[si].end - SC[si].start) * f;
function cue(si, word, n = 0) {
  let k = 0;
  for (const w of SC[si].words) {
    if (norm(w.w) === norm(word) || norm(w.w).startsWith(norm(word))) { if (k === n) return Math.max(SC[si].start, w.s - LEAD); k++; }
  }
  if (!(window.__CUE_MISS__ ||= new Set()).has(si + word)) { window.__CUE_MISS__.add(si + word); console.error(`cue tidak ditemukan: scene ${si + 1} "${word}"${n ? " ke-" + (n + 1) : ""}`); }
  return SC[si].start + 0.2;
}

// ---------- svg builders ----------
const NS = "http://www.w3.org/2000/svg";
const zone = document.getElementById("zone");
const items = [];
const groups = [];
let cur = zone;
const LA = { fill: "none", stroke: C.text, "stroke-width": SW, "stroke-linecap": "round", "stroke-linejoin": "round" };
function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  (parent || cur).appendChild(e);
  return e;
}
// garis yang tergambar (stroke draw), opsional isi menyusul
function D(tag, attrs, t0, dur = 0.5, o = {}) {
  if (o.dash) { // garis putus-putus: muncul dengan fade, pola dash tetap
    const { "stroke-dasharray": _, ...rest } = attrs;
    const e = el(tag, { ...LA, ...rest, "stroke-dasharray": `${o.dash} ${o.dash}` });
    items.push({ el: e, kind: "fade", t0, dur, dy: 0, ...o });
    return e;
  }
  const e = el(tag, { ...LA, ...attrs });
  e.setAttribute("pathLength", 1);
  e.style.strokeDasharray = "1 1";
  if (o.fill) { e.setAttribute("fill", o.fill); e.style.fillOpacity = 0; }
  items.push({ el: e, kind: "draw", t0, dur, ...o });
  return e;
}
// teks / bentuk yang muncul: fade + naik sedikit, atau pop
function A(e, t0, kind = "fade", o = {}) {
  if (kind === "pop") { e.style.transformBox = "fill-box"; e.style.transformOrigin = "center"; }
  items.push({ el: e, kind, t0, dur: o.dur ?? (kind === "pop" ? 0.5 : 0.45), ...o });
  return e;
}
function TX(x, y, str, attrs, t0, kind = "fade", o = {}) {
  const e = el("text", { x, y, "text-anchor": "middle", fill: C.text, "font-family": F.body, "font-weight": 700, "font-size": 30, ...attrs });
  e.textContent = str;
  return A(e, t0, kind, o);
}
const rr = (x, y, w, h, r) =>
  `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
// ikon orang line art: kepala + bahu
function person(x, y, s, t0, o = {}) {
  D("circle", { cx: x, cy: y, r: 40 * s, ...(o.attrs || {}) }, t0, 0.45, o);
  D("path", { d: `M${x - 80 * s},${y + 130 * s} C${x - 80 * s},${y + 58 * s} ${x + 80 * s},${y + 58 * s} ${x + 80 * s},${y + 130 * s}`, ...(o.attrs || {}) }, t0 + 0.12, 0.5, o);
}
// meja sidang: daun meja + panel depan (menutupi badan di belakangnya)
function table(x, y, w, t0, o = {}) {
  D("path", { d: rr(x + 40, y + 22, w - 80, 100, 10) }, t0 + 0.1, 0.55, { fill: C.bg, ...o });
  D("path", { d: rr(x, y, w, 24, 8) }, t0, 0.55, { fill: C.bg, ...o });
}
function bubble(x, y, w, h, tail, t0, o = {}) {
  D("path", { d: rr(x, y, w, h, 30), ...(o.attrs || {}) }, t0, 0.5, { fill: C.panel, ...o });
  D("path", { d: tail, ...(o.attrs || {}) }, t0 + 0.25, 0.3, o);
}
function scene(i) { const g = el("g", { id: `s${i + 1}` }, zone); groups[i] = g; cur = g; return g; }
const qsEl = document.getElementById("qs");
const qItems = [];
// teks pertanyaan: tiap baris disapu stabilo emas mengikuti saat diucapkan
function question(si, lines, box) {
  const d = document.createElement("div"); d.className = "q";
  Object.assign(d.style, { left: box.left + "px", top: box.top + "px", width: box.width + "px", textAlign: box.align || "left" });
  if (box.size) d.style.fontSize = box.size + "px";
  lines.forEach(([txt, t0, t1]) => {
    const row = document.createElement("div"); const sp = document.createElement("span");
    sp.textContent = txt; row.appendChild(sp); d.appendChild(row);
    qItems.push({ si, el: sp, t0, t1 });
  });
  qsEl.appendChild(d); qItems.push({ si, el: d, wrap: true });
}
function number(si, label, t0) {
  TX(90, 150, label, { "text-anchor": "start", "font-family": F.head, "font-weight": 900, "font-size": 120, fill: C.accent, filter: "url(#glow)" }, t0, "pop");
}

// ikon kecil yang dipakai berulang
function check(cx, cy, r, t0, col = C.ok, o = {}) {
  D("circle", { cx, cy, r, stroke: col }, t0, 0.35, { fill: tint(col, 0.15), ...o });
  D("path", { d: `M${cx - r * 0.45},${cy} L${cx - r * 0.1},${cy + r * 0.35} L${cx + r * 0.5},${cy - r * 0.35}`, stroke: col, "stroke-width": 6 }, t0 + 0.15, 0.3, o);
}
function cross(cx, cy, r, t0, o = {}) {
  D("circle", { cx, cy, r, stroke: C.red }, t0, 0.3, { fill: tint(C.bad, 0.15), ...o });
  D("path", { d: `M${cx - r * 0.4},${cy - r * 0.4} L${cx + r * 0.4},${cy + r * 0.4} M${cx + r * 0.4},${cy - r * 0.4} L${cx - r * 0.4},${cy + r * 0.4}`, stroke: C.red, "stroke-width": 6 }, t0 + 0.12, 0.3, o);
}


// ---------- komponen kamus visual (Fondasi Brand 8.2) ----------
// Semua koordinat di dalam zona visual (SVG 1080x1000; isi di x 60-1020, y 0-950). Zona ditampilkan diskalakan 0,9 di
// area aman TikTok (layar x = 14 + 0,9·x, y = 316 + 0,9·y; lihat kit.css). t0 = detik muncul (pakai cue()).
// Format lebar (16:9, 4:5, 1:1): pusat tetap x 540, ruang tambahan ZONE.x0..ZONE.x1 (mis. 16:9: -769..1849).
// o: opsi animasi bersama ({ dims: [[detik, opasitas]], attrs: {stroke: ...} }).

// logo/monogram dari tema (THEME.mark: [[teks, warna], ...]); mono() = nama lama
function mark(x, y, size, t0, o = {}) {
  const e = el("text", { x, y, "text-anchor": "middle", "font-family": F.head, "font-weight": 800, "font-size": size, filter: "url(#glow)" });
  (THEME_.mark || [["●", "accent"]]).forEach(([t, c]) => { el("tspan", { fill: col(c) }, e).textContent = t; });
  return A(e, t0, "pop", o);
}
const mono = mark;
// angka/kata besar menyala (font judul, Black)
const big = (x, y, txt, col, t0, size = 120, o = {}) =>
  TX(x, y, txt, { "font-family": F.head, "font-weight": 900, "font-size": size, fill: col, filter: "url(#glow)" }, t0, "pop", o);
// judul/label tebal (font judul)
const head = (x, y, txt, col, t0, size = 48, o = {}) =>
  TX(x, y, txt, { "font-family": F.head, "font-weight": 800, "font-size": size, fill: col, ...(o.attrs || {}) }, t0, o.kind || "pop", o);
// label kecil kapital berjarak (Inter)
const small = (x, y, txt, col, t0, size = 28, o = {}) =>
  TX(x, y, txt, { "font-size": size, fill: col, "letter-spacing": 6, ...(o.attrs || {}) }, t0, "fade", o);
// kalender: badan + pita atas + dua cincin
function cal(x, y, w, h, col, t0, o = {}) {
  D("path", { d: rr(x, y, w, h, 18), stroke: col }, t0, 0.5, { fill: C.panel, ...o });
  D("path", { d: `M${x},${y + 56} H${x + w}`, stroke: col }, t0 + 0.15, 0.3, o);
  D("path", { d: `M${x + w * 0.28},${y - 18} V${y + 22} M${x + w * 0.72},${y - 18} V${y + 22}`, stroke: col, "stroke-width": 7 }, t0 + 0.2, 0.3, o);
  return { cx: x + w / 2, cy: y + 56 + (h - 56) / 2 };
}
// laptop: layar (x, y, w, tinggi o.h atau 0.66w) + alas; kembalikan pusat layar
function laptop(x, y, w, t0, o = {}) {
  const h = o.h ?? Math.round(w * 0.66), at = o.attrs || {};
  D("path", { d: rr(x, y, w, h, 18), ...at }, t0, 0.5, { fill: C.panel, ...o });
  D("path", { d: `M${x - 40},${y + h} H${x + w + 40} L${x + w + 80},${y + h + 50} H${x - 80} Z`, ...at }, t0 + 0.15, 0.4, o);
  return { cx: x + w / 2, cy: y + h / 2, bottom: y + h + 50 };
}
// ponsel: bingkai tegak lebar w (tinggi 2w) + speaker
function phone(x, y, w, t0, o = {}) {
  const at = o.attrs || {};
  D("path", { d: rr(x, y, w, w * 2, 36), ...at }, t0, 0.5, { fill: C.panel, ...o });
  D("path", { d: `M${x + w * 0.38},${y + 28} H${x + w * 0.62}`, ...at }, t0 + 0.2, 0.3, o);
  return { cx: x + w / 2, cy: y + w, bottom: y + w * 2 };
}
// jendela browser: kotak + bilah atas + tiga titik
function browser(x, y, w, h, t0, o = {}) {
  const at = o.attrs || {};
  D("path", { d: rr(x, y, w, h, 18), ...at }, t0, 0.5, { fill: C.panel, ...o });
  D("path", { d: `M${x},${y + 56} H${x + w}`, ...at }, t0 + 0.15, 0.3, o);
  [0, 1, 2].forEach((k) => A(el("circle", { cx: x + 34 + k * 28, cy: y + 28, r: 8, fill: [C.red, C.orange, C.green][k], opacity: 0.8 }), t0 + 0.25 + k * 0.05, "pop", o));
  return { cx: x + w / 2, cy: y + 56 + (h - 56) / 2 };
}
// server: n unit bertumpuk (tinggi 90 per unit) dengan lampu
function server(x, y, w, t0, n = 3, o = {}) {
  for (let k = 0; k < n; k++) {
    D("path", { d: rr(x, y + k * 100, w, 90, 14), ...(o.attrs || {}) }, t0 + k * 0.1, 0.4, { fill: C.panel, ...o });
    A(el("circle", { cx: x + 40, cy: y + k * 100 + 45, r: 9, fill: o.led || C.accent2 }), t0 + 0.2 + k * 0.1, "pop", o);
    D("path", { d: `M${x + 80},${y + k * 100 + 45} H${x + w - 40}`, stroke: C.dim, "stroke-width": 4 }, t0 + 0.25 + k * 0.1, 0.3, o);
  }
  return { cx: x + w / 2, bottom: y + n * 100 };
}
// database: silinder (pusat cx, atas y, jari-jari rx, tinggi h)
function db(cx, y, rx, h, t0, o = {}) {
  const ry = rx * 0.25, at = o.attrs || {};
  D("ellipse", { cx, cy: y, rx, ry, ...at }, t0, 0.4, { fill: C.panel, ...o });
  D("path", { d: `M${cx - rx},${y} V${y + h} A${rx},${ry} 0 0 0 ${cx + rx},${y + h} V${y}`, ...at }, t0 + 0.15, 0.5, o);
  return { cx, cy: y + h / 2, bottom: y + h + ry };
}
// pill / chip berlabel (pusat x)
function pill(x, y, w, txt, col, t0, o = {}) {
  A(el("path", { d: rr(x - w / 2, y - 45, w, 90, 45), fill: o.fill ?? tint(col, 0.10), stroke: col, "stroke-width": 4 }), t0, "pop", o);
  return TX(x, y + 14, txt, { "font-family": o.mono ? F.mono : F.head, "font-weight": 800, "font-size": o.size || 36, fill: col }, t0 + 0.05, "pop", o);
}
// bar progres: track + isi yang tumbuh dari t0 ke t1 sampai frac (0-1)
function bar(x, y, w, h, col, t0, t1, frac = 1, o = {}) {
  A(el("rect", { x, y, width: w, height: h, rx: h / 2, fill: C.track }), t0 - 0.1, "fade", o);
  const f = el("rect", { x, y, width: 0, height: h, rx: h / 2, fill: col });
  items.push({ el: f, kind: "bar", t0, t1, w: w * frac, ...o });
  return f;
}
// panah lurus dengan kepala (request/response, alur)
function arrow(x1, y1, x2, y2, col, t0, o = {}) {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 22;
  const h1 = [x2 - L * Math.cos(a - 0.5), y2 - L * Math.sin(a - 0.5)], h2 = [x2 - L * Math.cos(a + 0.5), y2 - L * Math.sin(a + 0.5)];
  return D("path", { d: `M${x1},${y1} L${x2},${y2} M${h1[0]},${h1[1]} L${x2},${y2} L${h2[0]},${h2[1]}`, stroke: col, "stroke-width": o.w || 6 }, t0, o.dur || 0.45, o);
}
// CTA standar: pertanyaan stabilo (warna highlight tema) + chip "LINK DI BIO" + panah turun.
// lines: [["teks baris", "kata awal", "kata akhir"], ...] (kata dari narasi scene si)
function ctaBio(si, lines, o = {}) {
  question(si, lines.map(([txt, a, b], k) => [txt, cue(si, a) - (k ? 0 : 0.05), cue(si, b) + 0.35]),
    { left: 0, top: 250 + (o.top ?? 120), width: 1080, align: "center", size: o.size || 72 });
  const lin = cue(si, o.cue || "link");
  // jangkar: kerangka chip & panah samar sejak awal scene (separuh bawah tidak menunggu kata "link"), menyala saat katanya
  A(el("path", { d: rr(290, 580, 500, 130, 65), fill: "none", stroke: C.dim, "stroke-width": 4, "stroke-dasharray": "14 12" }), start(si, 0.3), "fade", { dims: [[lin, 0]] });
  TX(615, 665, o.label || THEME_.cta?.label || "LINK DI BIO", { "font-family": F.head, "font-weight": 800, "font-size": 50, fill: C.dim }, start(si, 0.4), "fade", { dims: [[lin, 0]] });
  A(el("path", { d: "M540,760 V880 M510,850 L540,882 L570,850", fill: "none", stroke: C.dim, "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round" }), start(si, 0.5), "fade", { dims: [[lin, 0]] });
  A(el("path", { d: rr(290, 580, 500, 130, 65), fill: tint(C.accent, 0.15), stroke: C.accent, "stroke-width": 5, filter: "url(#glow)" }), lin - 0.1, "pop");
  D("path", { d: "M330,645 a28,28 0 0,1 28,-28 h40 M410,645 a28,28 0 0,1 -28,28 h-40", stroke: C.accent, "stroke-width": 6 }, lin, 0.3);
  TX(615, 665, o.label || THEME_.cta?.label || "LINK DI BIO", { "font-family": F.head, "font-weight": 800, "font-size": 50, fill: C.accent }, lin + 0.05, "pop");
  D("path", { d: "M540,760 V880 M510,850 L540,882 L570,850", stroke: C.accent, "stroke-width": 7 }, lin + 0.2, 0.4);
}
// penutup brand dari tema (THEME.closing): logo -> wordmark -> deskriptor -> baris tagline (kata kedua disorot)
// { "wordmark": [[teks, warna]...], "descriptor": "PARTNER PROJECT IT", "lines": [["Code", "jalan.", "code"], ...] }
function closing(si) {
  const K = THEME_.closing || {}, jp = SC[si].start + 0.05;
  mark(540, 250, 150, jp, { dur: 0.6 });
  if (K.wordmark) {
    const wm = el("text", { x: 540, y: 365, "text-anchor": "middle", "font-family": F.head, "font-weight": 800, "font-size": 76 });
    K.wordmark.forEach(([t, c]) => { el("tspan", { fill: col(c) }, wm).textContent = t; });
    A(wm, jp + 0.3);
  }
  if (K.descriptor) TX(540, 425, K.descriptor, { "font-size": 28, fill: col(K.descriptorColor || "accent2"), "letter-spacing": 8 }, jp + 0.5);
  D("line", { x1: 340, y1: 480, x2: 740, y2: 480, stroke: C.track, "stroke-width": 3 }, jp + 0.6, 0.5);
  (K.lines || []).forEach(([a, b, w], k) => {
    const e = el("text", { x: 540, y: 610 + k * 115, "text-anchor": "middle", "font-family": F.head, "font-weight": 800, "font-size": 82 });
    el("tspan", { fill: C.text }, e).textContent = a + " ";
    el("tspan", { fill: col(K.lineColor || "accent"), filter: "url(#glow)" }, e).textContent = b;
    A(e, w ? cue(si, w) : jp + 0.8 + k * 0.4);
  });
}
// lampu peringatan berkedip lembut (error) dari t0 sampai t1: lingkaran transparan, tidak menutupi teks
function alarm(cx, cy, r, t0, t1, c = C.bad) {
  const e = el("circle", { cx, cy, r, fill: c, "fill-opacity": 0.14, filter: "url(#glow)" });
  items.push({ el: e, kind: "blink", t0, op: 1, dims: [[t1, 0]] });
  return e;
}
