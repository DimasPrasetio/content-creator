// Kit HTML standar content-creator · KAMERA (gaya "produk-kamera"): lapisan DOM "dunia" per scene dengan kamera sendiri
// yang maju, mengikuti aksi, mundur, dan meluncur antar layar; UI produk dibangun ulang (jendela aplikasi, ponsel, kartu,
// chip, tombol, kursor, cap) dan difilmkan dari dekat. Teknik diadaptasi dari skill explainer-default
// (github.com/Barty-Bart/motion-graphics, MIT). Opsional: scene yang tidak memanggil shot()/statement() tidak terpengaruh.
// Urutan muat: theme.js -> kit-core.js -> kit-camera.js -> scenes.js -> kit-run.js (kit-run memanggil SHOTS[i].seek).
// Dokumentasi & contoh: Engine/kit/html/README.md bagian "Kit kamera".
const SHOTS = [];
const shotsEl = document.getElementById("shots");
// palet UI produk (layar terang di atas latar gelap). Brand menimpa lewat theme.json "ui"; nilai boleh nama warna tema.
const UI = (() => {
  const u = { bg: "#F7F7F8", card: "#FFFFFF", text: "#111114", dim: "#6B6B76", line: "#E7E7EC", primary: "#1F2937", soft: "#EEF0F4",
    accent: "accent", accentSoft: null, frame: "#1F2937", ok: "#15803D", okSoft: "#E9F8EE", warn: "#B45309", warnSoft: "#FFF6E0",
    bad: "#B91C1C", badSoft: "#FDECEC", stamp: null, ...(THEME_.ui || {}) };
  for (const k in u) if (typeof u[k] === "string" && C[u[k]]) u[k] = C[u[k]];
  u.accentSoft = u.accentSoft || tint(u.accent, 0.16);
  return u;
})();
const CAM_X = 540, CAM_Y = 580;   // pusat kamera di lapisan shot (lapisan mulai layar y 190 -> pusat layar y 770)
const seg = (t, a, b) => clamp((t - a) / (b - a || 1e-6));
const rp = (n) => "Rp" + Math.round(n).toLocaleString("id-ID");
const TONE = { ok: ["ok", "okSoft"], warn: ["warn", "warnSoft"], bad: ["bad", "badSoft"], accent: ["accent", "accentSoft"], soft: ["primary", "soft"] };

function shot(si, o = {}) {
  const wrap = document.createElement("div"); wrap.className = "shot"; wrap.dataset.probe = "camera"; shotsEl.appendChild(wrap);
  const world = document.createElement("div"); world.className = "world"; wrap.appendChild(world);
  const recs = new Map(), fns = [], fast = [];
  const S = { si, wrap, world, keys: [[SC[si].start, 0, 0, 1]], blur: o.blur ?? true, fast };
  // ---- keadaan per elemen (semua efek digabung jadi satu opacity + transform) ----
  const rec = (e) => { if (!recs.has(e)) recs.set(e, { e, op: [], tf: [], post: [] }); return recs.get(e); };
  // ---- kamera ----
  // keys: [[t, x, y, zoom, mode?], ...] x,y = titik dunia di tengah layar; mode "glide" (zoom-out di tengah perpindahan)
  // atau "drift" (linier, untuk dorongan pelan terus-menerus). Bawaan antar kunci: ease in-out.
  S.cam = (keys) => { S.keys = keys.slice().sort((a, b) => a[0] - b[0]); return S; };
  S.camAt = (t) => {
    const K = S.keys;
    if (t <= K[0][0]) return K[0].slice(1, 4);
    for (let i = 1; i < K.length; i++) {
      const [a, ax, ay, az] = K[i - 1], [b, bx, by, bz, mode] = K[i];
      if (t > b) continue;
      const lin = seg(t, a, b), p = mode === "drift" ? lin : eio(lin);
      let z = lerp(az, bz, p);
      if (mode === "glide") z -= 0.3 * Math.min(az, bz) * Math.sin(Math.PI * p);
      return [lerp(ax, bx, p), lerp(ay, by, p), z];
    }
    return K[K.length - 1].slice(1, 4);
  };
  // ---- pembangun ----
  S.box = (parent, x, y, css = {}, txt) => {
    const e = document.createElement("div"); e.className = "ui";
    Object.assign(e.style, { left: x + "px", top: y + "px" }, css);
    if (txt != null) e.textContent = txt;
    (parent || world).appendChild(e); return e;
  };
  S.text = (parent, x, y, txt, size = 20, weight = 500, color = UI.text, css = {}) =>
    S.box(parent, x, y, { font: `${weight} ${size}px ${weight >= 800 ? F.head : F.body}`, color, ...css }, txt);
  // jendela aplikasi: bilah judul + (opsional) menu samping. Kembalikan {el, x0} (x0 = kiri area isi)
  S.window = (x, y, w, h, o = {}) => {
    const el = S.box(null, x, y, { width: w + "px", height: h + "px", background: UI.bg, borderRadius: "22px", overflow: "hidden", color: UI.text,
      boxShadow: `0 40px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06), 0 0 80px ${tint(C.accent, 0.10)}` });
    const bar = S.box(el, 0, 0, { width: w + "px", height: "64px", background: UI.card, borderBottom: `1px solid ${UI.line}` });
    ["#F0B4B4", "#F2D49B", "#B9DDB0"].forEach((c, i) => S.box(bar, 24 + i * 22, 26, { width: "12px", height: "12px", borderRadius: "50%", background: c }));
    if (o.title) S.text(bar, 110, 19, o.title, 22, 800, UI.primary);
    if (o.user) {
      S.box(bar, w - 132, 16, { width: "32px", height: "32px", borderRadius: "50%", background: UI.soft, color: UI.primary, font: `700 16px ${F.body}`, lineHeight: "32px", textAlign: "center" }, o.user[0]);
      S.text(bar, w - 90, 21, o.user, 17, 600, UI.dim);
    }
    let x0 = 30;
    if (o.nav) {
      const side = S.box(el, 0, 64, { width: "200px", height: h - 64 + "px", background: UI.card, borderRight: `1px solid ${UI.line}` });
      o.nav.forEach((n, i) => S.box(side, 16, 24 + i * 54, { width: "168px", height: "44px", lineHeight: "44px", paddingLeft: "16px", boxSizing: "border-box", borderRadius: "10px",
        font: `${i === o.active ? 700 : 500} 18px ${F.body}`, color: i === o.active ? UI.primary : UI.dim, background: i === o.active ? UI.soft : "transparent" }, n));
      x0 = 230;
    }
    return { el, x0 };
  };
  // ponsel: bingkai tebal warna UI.frame + layar. Kembalikan {el, screen}
  S.phone = (x, y, o = {}) => {
    const w = o.w ?? 400, h = o.h ?? 820;
    const el = S.box(null, x, y, { width: w + "px", height: h + "px", borderRadius: "60px", background: UI.frame,
      boxShadow: `0 40px 90px rgba(0,0,0,.6), 0 0 90px ${tint(C.accent, 0.14)}` });
    const screen = S.box(el, 14, 14, { width: w - 28 + "px", height: h - 28 + "px", borderRadius: "47px", background: UI.bg, overflow: "hidden", color: UI.text });
    if (o.clock !== false) S.text(screen, 34, 18, "9:41", 15, 700);
    return { el, screen };
  };
  S.card = (parent, x, y, w, h, css = {}) => S.box(parent, x, y, { width: w + "px", height: h + "px", background: UI.card, border: `1.5px solid ${UI.line}`,
    borderRadius: "22px", boxShadow: `0 8px 24px ${tint(UI.primary, 0.07)}`, ...css });
  S.chip = (parent, x, y, txt, tone = "soft", css = {}) => {
    const [fg, bg] = TONE[tone] || TONE.soft;
    return S.box(parent, x, y, { height: "36px", lineHeight: "36px", padding: "0 16px", borderRadius: "18px", font: `700 16px ${F.body}`, color: UI[fg], background: UI[bg], ...css }, txt);
  };
  S.button = (parent, x, y, w, txt, css = {}) => S.box(parent, x, y, { width: w + "px", height: "50px", display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: "12px", background: UI.primary, color: "#fff", font: `700 18px ${F.body}`, ...css }, txt);
  // ikon dokumen kecil (bukti, file unggahan)
  S.file = (parent, x, y, css = {}) => {
    const e = S.box(parent, x, y, { width: "44px", height: "56px", borderRadius: "6px", background: UI.card, border: `1.5px solid ${UI.line}`, boxSizing: "border-box", overflow: "hidden", ...css });
    S.box(e, 0, 0, { width: "100%", height: "14px", background: UI.soft });
    [[22, 26], [30, 26], [38, 16]].forEach(([yy, ww]) => S.box(e, 8, yy, { width: ww + "px", height: "4px", borderRadius: "2px", background: UI.line }));
    return e;
  };
  // bar progres yang terisi dari t0 ke t1 sampai frac
  S.progress = (parent, x, y, w, t0, t1, frac = 1, color = UI.accent) => {
    S.box(parent, x, y, { width: w + "px", height: "6px", borderRadius: "3px", background: UI.soft });
    const f = S.box(parent, x, y, { width: "0px", height: "6px", borderRadius: "3px", background: color });
    fns.push((t) => { f.style.width = w * frac * eio(seg(t, t0, t1)) + "px"; });
    return f;
  };
  // label dunia (titik + kapital), mis. "TIM WO" di atas layar saat kamera mundur
  S.label = (x, y, txt, t0, color = C.accent) => {
    const e = S.box(null, x, y, { font: `700 30px ${F.body}`, letterSpacing: ".16em", color });
    e.innerHTML = `<i style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${color};margin-right:14px;vertical-align:3px;box-shadow:0 0 12px ${color}"></i>`;
    e.appendChild(document.createTextNode(txt));
    S.in(e, t0, { dy: 0, center: true });   // x = tengah label
    return e;
  };
  // ---- gerak (semua fungsi murni dari waktu) ----
  // muncul: fade + naik dy (bawaan 20) atau pop (skala 0.85->1)
  S.in = (e, t0, o = {}) => {
    const d = o.dur ?? 0.4, r = rec(e);
    r.op.push((t) => eo(seg(t, t0, t0 + d)));
    r.tf.push((t) => { const q = eo(seg(t, t0, t0 + d)); return { y: (o.dy ?? 20) * (1 - q), s: o.pop ? lerp(0.85, 1, q) : 1 }; });
    if (o.center) r.center = true;
    return e;
  };
  S.out = (e, t0, d = 0.2) => { rec(e).op.push((t) => 1 - seg(t, t0, t0 + d)); return e; };
  S.dim = (e, t0, to = 0.35) => { rec(e).op.push((t) => lerp(1, to, eo(seg(t, t0, t0 + 0.4)))); return e; };
  // a hilang, b muncul (mis. tombol -> chip status)
  S.swap = (a, b, t0) => { S.out(a, t0 - 0.05, 0.15); S.in(b, t0, { dy: 0, pop: true, dur: 0.25 }); return b; };
  S.press = (e, t0) => { rec(e).tf.push((t) => ({ s: 1 - 0.05 * Math.sin(Math.PI * seg(t, t0, t0 + 0.15)) })); return e; };
  // denyut glow (mis. dua status menyala bersamaan)
  S.pulse = (e, t0, color = UI.ok, d = 0.7) => {
    const r = rec(e);
    r.tf.push((t) => ({ s: 1 + 0.06 * Math.sin(Math.PI * seg(t, t0, t0 + d)) }));
    r.post.push((t) => { const k = Math.sin(Math.PI * seg(t, t0, t0 + d)); e.style.boxShadow = k > 0 ? `0 0 ${28 * k}px ${tint(color, 0.45 * k)}` : ""; });
    return e;
  };
  // pindah posisi kiri/atas: keys [[t, x, y], ...] (ease in-out di tiap ruas)
  S.move = (e, keys) => {
    for (let i = 1; i < keys.length; i++) fast.push([keys[i - 1][0], keys[i][0]]);
    S.posOf(e, keys);
    rec(e).post.push((t) => { const [x, y] = S.posAt(e, t); e.style.left = x + "px"; e.style.top = y + "px"; });
    return e;
  };
  const POS = new Map();
  S.posOf = (e, keys) => POS.set(e, keys);
  S.posAt = (e, t) => {
    const K = POS.get(e);
    if (!K) return [parseFloat(e.style.left) || 0, parseFloat(e.style.top) || 0];
    if (t <= K[0][0]) return [K[0][1], K[0][2]];
    for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const p = eio(seg(t, K[i - 1][0], K[i][0])); return [lerp(K[i - 1][1], K[i][1], p), lerp(K[i - 1][2], K[i][2], p)]; }
    return [K[K.length - 1][1], K[K.length - 1][2]];
  };
  // angka berjalan (count-up)
  S.count = (e, from, to, t0, t1, fmt = rp) => { fns.push((t) => { e.textContent = fmt(lerp(from, to, eio(seg(t, t0, t1)))); }); return e; };
  // riak sentuhan jari (ponsel) di (x, y) koordinat parent
  S.tap = (parent, x, y, t0) => {
    const e = S.box(parent, x, y, { borderRadius: "50%", background: "rgba(255,255,255,.5)", width: "0px", height: "0px" });
    fns.push((t) => { const k = seg(t, t0, t0 + 0.45), r = 160 * eo(k);
      Object.assign(e.style, { opacity: k > 0 && k < 1 ? 0.6 * (1 - k) : 0, width: r + "px", height: r + "px", left: x - r / 2 + "px", top: y - r / 2 + "px" }); });
    return e;
  };
  // kursor macOS (koordinat dunia). path: [[t, x, y], ...] (ujung panah), clicks: [t, ...] -> tekan + riak emas
  S.cursor = (path, clicks = [], o = {}) => {
    const e = S.box(null, 0, 0, { width: "30px", height: "44px" });
    e.innerHTML = '<svg width="30" height="44" viewBox="0 0 15 22"><path d="M1 1 L1 17 L5 13.2 L7.6 19.6 L10.2 18.5 L7.6 12.3 L13 12.3 Z" fill="#111" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    const rip = clicks.map(() => S.box(null, 0, 0, { borderRadius: "50%", border: `3px solid ${C.accent}`, boxSizing: "border-box" }));
    for (let i = 1; i < path.length; i++) fast.push([path[i - 1][0], path[i][0]]);
    const t0 = path[0][0], tEnd = o.hide ?? path[path.length - 1][0] + 0.8;
    const at = (t) => {
      if (t <= path[0][0]) return [path[0][1], path[0][2]];
      for (let i = 1; i < path.length; i++) if (t <= path[i][0]) {
        const p = eio(seg(t, path[i - 1][0], path[i][0]));
        return [lerp(path[i - 1][1], path[i][1], p), lerp(path[i - 1][2], path[i][2], p) - 30 * Math.sin(Math.PI * p)];
      }
      return [path[path.length - 1][1], path[path.length - 1][2]];
    };
    fns.push((t) => {
      const [x, y] = at(t), press = Math.max(0, ...clicks.map((c) => Math.sin(Math.PI * seg(t, c, c + 0.12))));
      e.style.opacity = String(seg(t, t0 - 0.2, t0) * (1 - seg(t, tEnd, tEnd + 0.3)));
      e.style.transform = `translate(${x - 4}px, ${y - 2}px) scale(${1 - 0.12 * press})`;
      clicks.forEach((c, i) => { const k = seg(t, c + 0.03, c + 0.5), r = 30 + 110 * eo(k), [cx, cy] = at(c);
        Object.assign(rip[i].style, { opacity: k > 0 && k < 1 ? 0.8 * (1 - k) : 0, width: r + "px", height: r + "px", transform: `translate(${cx - r / 2}px, ${cy + 6 - r / 2}px)` }); });
    });
    return e;
  };
  // cap / segel menekan di (cx, cy) parent: dari besar 1.7x ke ukuran asli, sedikit miring. Gambar: theme.ui.stamp
  // (file brand yang disalin `npm run new` ke html/stamp.*) atau bawaan lingkaran ✓ warna UI.accent.
  S.stamp = (parent, cx, cy, size, t0, o = {}) => {
    const e = S.box(parent, cx - size / 2, cy - size / 2, { width: size + "px", height: size + "px", color: UI.accent });
    const src = o.src ?? UI.stampSrc;
    e.innerHTML = src ? `<img src="${src}" width="${size}" height="${size}">`
      : `<svg viewBox="0 0 100 100" width="${size}" height="${size}" fill="none" stroke="currentColor"><circle cx="50" cy="50" r="46" stroke-width="2"/><circle cx="50" cy="50" r="38" stroke-width="1" opacity=".6"/><path d="M33 51 L45 62 L68 38" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    fast.push([t0, t0 + 0.25]);
    const r = rec(e);
    r.op.push((t) => eo(seg(t, t0, t0 + 0.25)));
    r.tf.push((t) => ({ s: lerp(1.7, 1, eo(seg(t, t0, t0 + 0.25))), r: o.rotate ?? -10 }));
    return e;
  };
  // garis cahaya penghubung dua titik dunia (boleh fungsi waktu untuk objek yang bergerak): tergambar t0->t1, pudar dari t2
  S.link = (from, to, t0, t1, t2 = t1 + 0.6, o = {}) => {
    const NSs = "http://www.w3.org/2000/svg", OFF = 3000;
    const svg = document.createElementNS(NSs, "svg");
    Object.assign(svg.style, { position: "absolute", left: -OFF + "px", top: -OFF + "px", overflow: "visible" });
    svg.setAttribute("width", 2 * OFF); svg.setAttribute("height", 2 * OFF); world.appendChild(svg);
    const mk = (tag, a) => { const n = document.createElementNS(NSs, tag); for (const k in a) n.setAttribute(k, a[k]); svg.appendChild(n); return n; };
    const color = o.color ?? C.accent;
    const g = mk("path", { fill: "none", stroke: color, "stroke-width": 18, "stroke-opacity": 0.22, "stroke-linecap": "round" });
    const l = mk("path", { fill: "none", stroke: color, "stroke-width": 5, "stroke-linecap": "round" });
    const h = mk("circle", { r: 10, fill: "#fff" });
    const P = (p, t) => (typeof p === "function" ? p(t) : p);
    fns.push((t) => {
      const [x0, y0] = P(from, t), [x1, y1] = P(to, t), bend = o.bend ?? 220;
      const d = `M${x0 + OFF},${y0 + OFF} C${x0 + OFF - bend * 0.5},${y0 + OFF + bend} ${x1 + OFF + bend},${y1 + OFF - bend * 0.2} ${x1 + OFF},${y1 + OFF}`;
      g.setAttribute("d", d); l.setAttribute("d", d);
      const L = l.getTotalLength(), p = eio(seg(t, t0, t1)), fade = 1 - seg(t, t2, t2 + 0.5);
      [g, l].forEach((n) => { n.setAttribute("stroke-dasharray", `${L * p} ${L}`); n.style.opacity = p > 0 ? fade : 0; });
      const hp = l.getPointAtLength(L * p); h.setAttribute("cx", hp.x); h.setAttribute("cy", hp.y);
      h.style.opacity = p > 0 && p < 1 ? 1 : 0;
    });
    return svg;
  };
  // titik dunia dari posisi di dalam elemen yang (mungkin) bergerak: pointIn(ponsel.el, 165, 516) -> fungsi waktu
  S.pointIn = (e, dx, dy) => (t) => { const [x, y] = S.posAt(e, t); return [x + dx, y + dy]; };
  S.at = (fn) => { fns.push(fn); return S; };
  // ---- seek (dipanggil kit-run.js dengan opasitas crossfade scene) ----
  S.seek = (t, o) => {
    wrap.style.display = o > 0.001 ? "" : "none";
    if (o <= 0.001) return;
    wrap.style.opacity = String(o);
    wrap.style.filter = S.blur && o < 0.999 ? `blur(${(12 * (1 - o)).toFixed(2)}px)` : "none";
    const [x, y, z] = S.camAt(t);
    world.style.transform = `translate(${CAM_X - x * z}px, ${CAM_Y - y * z}px) scale(${z})`;
    for (const r of recs.values()) {
      let op = 1, ty = 0, sc = 1, rot = 0;
      for (const f of r.op) op *= f(t);
      for (const f of r.tf) { const v = f(t); ty += v.y ?? 0; sc *= v.s ?? 1; rot += v.r ?? 0; }
      r.e.style.opacity = String(op);
      r.e.style.transform = `${r.center ? "translateX(-50%) " : ""}translateY(${ty}px) scale(${sc}) rotate(${rot}deg)`;
      for (const f of r.post) f(t);
    }
    for (const f of fns) f(t);
  };
  SHOTS.push(S);
  return S;
}

// Pernyataan besar (2-3 kata): kata muncul pada katanya, kata bertanda disapu stabilo, kamera maju pelan, kontur berdenyut.
// parts: [[teks, kataCue?, sorot?], ...] ("\n" = baris baru). o: {size: 64, from: 1, to: 1.4}
function statement(si, parts, o = {}) {
  const S = shot(si, o);
  const svgNS = "http://www.w3.org/2000/svg", ring = document.createElementNS(svgNS, "svg");
  Object.assign(ring.style, { position: "absolute", left: "-700px", top: "-700px", overflow: "visible" });
  ring.setAttribute("width", 1400); ring.setAttribute("height", 1400); S.world.appendChild(ring);
  for (let i = 0; i < 7; i++) {
    const w = 260 + i * 130, h = 170 + i * 110, r = document.createElementNS(svgNS, "rect");
    Object.entries({ x: 700 - w / 2, y: 700 - h / 2, width: w, height: h, rx: 40 + i * 18, fill: "none", stroke: C.track, "stroke-width": 2, opacity: 1 - i * 0.12 })
      .forEach(([k, v]) => r.setAttribute(k, v));
    ring.appendChild(r);
  }
  S.box(null, -460, -460, { width: "920px", height: "920px", borderRadius: "50%", background: `radial-gradient(circle, ${tint(C.accent, 0.16)} 0%, ${tint(C.accent, 0)} 65%)` });
  S.at((t) => { ring.style.transform = `scale(${1 + 0.03 * Math.sin(t * 2.4)})`; });
  const line = S.box(null, 0, 0, { textAlign: "center", whiteSpace: "nowrap", font: `${o.weight ?? 600} ${o.size ?? 64}px/1.25 ${F.head}`, color: C.text });
  line.style.transform = "translate(-50%, -50%)";
  parts.forEach(([txt, w, hl]) => {
    if (txt === "\n") { line.appendChild(document.createElement("br")); return; }
    const sp = document.createElement("span");
    sp.textContent = txt;
    Object.assign(sp.style, { display: "inline-block", margin: "0 0.14em", padding: "0 0.18em", borderRadius: "10px", color: hl ? C.accent : C.text });
    line.appendChild(sp);
    const t0 = w ? cue(si, w) : start(si, 0.1);
    S.in(sp, t0, { dy: 18 });
    if (hl) {
      Object.assign(sp.style, { backgroundImage: `linear-gradient(${tint(C.accent, 0.2)}, ${tint(C.accent, 0.2)})`, backgroundRepeat: "no-repeat", backgroundSize: "0% 100%" });
      S.at((t) => { sp.style.backgroundSize = `${100 * eio(seg(t, t0 + 0.08, t0 + 0.45))}% 100%`; });
    }
  });
  S.cam([[SC[si].start, 0, 0, o.from ?? 1], [SC[si].end + 0.3, 0, 0, o.to ?? 1.4, "drift"]]);
  return S;
}

// Motion blur adaptif untuk renderer (html_render.py): perpindahan terbesar (px layar) selama rana [t, t+dt], atau false
// bila diam (< 1,5 px). Renderer mengambil perpindahan/4 sub-frame (min 4, maks theme "motionBlur", bawaan 16).
// Objek berpindah, kursor, dan cap (S.fast) dianggap cepat (64 px).
window.__motion = (t, dt) => {
  let m = 0;
  for (const S of SHOTS) {
    const s = SC[S.si];
    if (t < s.start - 0.4 || t > s.end + 0.4) continue;
    if (S.fast.some(([a, b]) => t + dt >= a && t <= b)) m = Math.max(m, 64);
    const [x0, y0, z0] = S.camAt(t), [x1, y1, z1] = S.camAt(t + dt);
    m = Math.max(m, Math.abs(x1 - x0) * z1 + Math.abs(y1 - y0) * z1 + Math.abs(z1 / z0 - 1) * 700);
  }
  return m > 1.5 ? m : false;
};
Object.defineProperty(window, "__SUBFRAMES__", { get: () => (SHOTS.length ? THEME_.motionBlur ?? 16 : 1) });
