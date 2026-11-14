// Kit HTML standar content-creator · subtitle karaoke, label bab, progress bar, window.seek. Butuh LABEL (opsional KEY) dari scenes.js.
// ---------- subtitle kata per kata ----------
const KEY_ = typeof KEY === "undefined" ? {} : KEY;
const SUB = { said: col(THEME_.subtitle?.said || "text"), unsaid: col(THEME_.subtitle?.unsaid || "dim"), key: col(THEME_.subtitle?.key || "accent") };
const subbox = document.getElementById("subbox");
const chunks = [];
SC.forEach((sc, si) => {
  const seen = {};
  let words = [], len = 0;
  const flush = () => { if (words.length) chunks.push({ si, words }); words = []; len = 0; };
  sc.words.forEach((w, wi) => {
    const n = norm(w.w); seen[n] = (seen[n] ?? -1) + 1;
    const key = (KEY_[si] || []).some((k) => { const [kw, occ] = k.split("#"); return n === kw && (occ === undefined || +occ === seen[n]); });
    const L = w.w.length + 1;
    if (len + L > 42 && words.length) flush();
    words.push({ ...w, key }); len += L;
    if (/[.?:]["”]?$/.test(w.w) && len >= 18 && wi < sc.words.length - 1) flush();
  });
  flush();
});
chunks.forEach((c, i) => { c.t0 = i === 0 || chunks[i - 1].si !== c.si ? SC[c.si].start : c.words[0].s - 0.12; });
chunks.forEach((c, i) => {
  c.t1 = i < chunks.length - 1 ? chunks[i + 1].t0 : 1e9;
  const d = document.createElement("div"); d.className = "chunk";
  c.spans = c.words.map((w, k) => { const sp = document.createElement("span"); sp.textContent = w.w; d.appendChild(sp); if (k < c.words.length - 1) d.appendChild(document.createTextNode(" ")); return sp; });
  subbox.appendChild(d); c.div = d;
});

// ---------- label bab ----------
const labelEl = document.getElementById("label"), labelTxt = document.getElementById("labeltxt"), labelDot = labelEl.querySelector("i");
const fillEl = document.getElementById("fill"), dotEl = document.getElementById("dot");
const same = (a, b) => (a && b ? a[0] === b[0] : a === b);

// ---------- seek: semua keadaan dihitung dari waktu saja ----------
function dimFactor(it, t) {
  let f = 1;
  for (const [at, to] of it.dims || []) f = lerp(f, to, eo(clamp((t - at) / 0.4)));
  return f;
}
function apply(it, t) {
  const e = it.el, p = clamp((t - it.t0) / it.dur);
  const op = it.op ?? 1, df = dimFactor(it, t);
  switch (it.kind) {
    case "draw": {
      const q = eo(p);
      e.style.strokeDashoffset = String(1 - q);
      if (it.fill) e.style.fillOpacity = String(clamp((t - it.t0 - 0.15) / 0.4));
      e.style.opacity = String((t >= it.t0 ? 1 : 0) * df * op);
      break;
    }
    case "fade": {
      const q = eo(p);
      e.style.transform = `translateY(${(1 - q) * (it.dy ?? 20)}px)`;
      e.style.opacity = String(q * df * op);
      break;
    }
    case "pop": {
      const q = clamp(p);
      e.style.transform = `scale(${0.4 + 0.6 * back(q)})`;
      e.style.opacity = String(clamp(q * 2.5) * df * op);
      break;
    }
    case "meter": {
      const q = eo(clamp((t - it.t0) / (it.t1 - it.t0)));
      e.setAttribute("width", String(30 + q * it.w));
      e.setAttribute("fill", t >= it.hot ? C.orange : C.text);
      e.style.opacity = String((t >= it.t0 ? 1 : 0) * df);
      break;
    }
    case "move": {
      const [p0, p1, p2] = it.path;
      let x = p0[1], y = p0[2];
      if (t > p1[0]) { const k = eo(clamp((t - p1[0]) / (p2[0] - p1[0]))); x = lerp(p1[1], p2[1], k); y = lerp(p1[2], p2[2], k); }
      e.setAttribute("transform", `translate(${x} ${y})`);
      e.style.opacity = String(eo(clamp((t - it.t0) / 0.4)) * (1 - 0.65 * eo(clamp((t - it.fadeOut) / 0.4))));
      break;
    }
    case "timer": {
      const k = clamp((t - it.t0) / it.len);
      e.style.strokeDashoffset = String(k);
      e.style.opacity = String(t >= it.t0 ? 1 : 0);
      break;
    }
    case "domino": {
      const k = eio(clamp((t - it.at) / 0.35));
      e.setAttribute("transform", `rotate(${k * 62} ${it.cx} ${it.cy})`);
      e.style.opacity = String(clamp((t - it.t0) / 0.3));
      break;
    }
    case "grow": { const q = eo(p); e.setAttribute("r", String(lerp(it.r0, it.r1, q))); e.style.opacity = String((t >= it.t0 ? 1 : 0) * (1 - 0.5 * q) * op); break; }
    case "spin": { e.setAttribute("transform", `rotate(${(t - it.t0) * it.rate} ${it.cx} ${it.cy})`); e.style.opacity = t >= it.t0 ? "1" : "0"; break; }
    case "countup": {
      const k = eo(clamp((t - it.t0) / (it.t1 - it.t0)));
      e.textContent = String(Math.round(it.to * k)) + it.suffix;
      break;
    }
    case "prefix": { if (!e.textContent.startsWith(it.prefix)) e.textContent = it.prefix + e.textContent; break; }
    case "type": {
      const k = clamp((t - it.t0) / (it.t1 - it.t0));
      e.style.clipPath = `inset(-30px ${(1 - k) * 100}% -30px -30px)`;
      break;
    }
    case "shackle": { const k = eo(clamp((t - it.t0) / 0.35)); e.setAttribute("transform", `translate(0 ${-26 * k})`); e.setAttribute("stroke", k > 0 ? C.red : C.text); break; }
    case "bar": { e.setAttribute("width", String(Math.max(0, it.w * eo(clamp((t - it.t0) / (it.t1 - it.t0)))))); e.style.opacity = t >= it.t0 ? "1" : "0"; break; }
    case "blink": { e.style.opacity = String(t < it.t0 ? 0 : (Math.floor((t - it.t0) * 2.2) % 2 === 0 ? 1 : 0) * df * op); break; }
    case "count": {
      e.textContent = String(Math.max(0, it.from - Math.floor(Math.max(0, t - it.t0))));
      break;
    }
  }
}

window.seek = function (t) {
  // adegan aktif
  let si = SC.findIndex((s) => t >= s.start && t < s.end);
  if (si < 0) si = t < SC[0].start ? 0 : SC.length - 1;
  const sceneOp = (i) => {
    const s = SC[i];
    if (!(t >= s.start - 0.01 && t < s.end + 0.01)) return 0;
    let o = 1;
    if (i > 0) o *= eo(clamp((t - s.start) / 0.25));
    if (i < SC.length - 1) o *= clamp((s.end - t) / 0.22);
    return o;
  };
  for (const q of qItems) {
    if (q.wrap) { const o = sceneOp(q.si); q.el.style.display = o > 0.001 ? "" : "none"; q.el.style.opacity = String(o); continue; }
    const k = eo(clamp((t - q.t0) / (q.t1 - q.t0)));
    q.el.style.visibility = t >= q.t0 ? "visible" : "hidden";
    q.el.style.clipPath = `inset(-30px ${(1 - k) * 100}% -30px -30px)`;
  }
  groups.forEach((g, i) => {
    const s = SC[i];
    let o = 0;
    if (t >= s.start - 0.01 && t < s.end + 0.01) {
      o = 1;
      if (i > 0) o *= eo(clamp((t - s.start) / 0.25));
      if (i < SC.length - 1) o *= clamp((s.end - t) / 0.22);
    }
    g.style.display = o > 0.001 ? "" : "none";
    g.style.opacity = String(o);
  });
  for (const it of items) apply(it, t);
  // progress bar
  const k = clamp(t / TOTAL);
  fillEl.style.width = `${k * 960}px`;
  dotEl.style.left = `${k * 960}px`;
  // label bab
  const L = LABEL[si], s = SC[si];
  if (L) {
    labelTxt.textContent = L[0]; labelEl.style.color = col(THEME_.label?.text || "accent2"); labelDot.style.background = L[1]; labelDot.style.color = L[1];
    let o = 1;
    if (si > 0 && !same(LABEL[si - 1], L)) o *= eo(clamp((t - s.start) / 0.35));
    if (si < SC.length - 1 && !same(LABEL[si + 1], L)) o *= clamp((s.end - t) / 0.25);
    labelEl.style.opacity = String(o);
  } else labelEl.style.opacity = "0";
  // subtitle
  for (const c of chunks) {
    const on = t >= c.t0 && t < c.t1;
    c.div.style.display = on ? "block" : "none";
    if (!on) continue;
    // karaoke: kata menyala tepat saat diucapkan (sudah = said, kata kunci = key, belum = unsaid)
    c.words.forEach((w, j) => {
      const said = t >= w.s - 0.03;
      c.spans[j].style.color = said ? (w.key ? SUB.key : SUB.said) : SUB.unsaid;
    });
  }
  return true;
};
window.seek(0);
