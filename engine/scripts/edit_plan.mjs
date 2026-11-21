// Perencana murni (tanpa berkas/ffmpeg) untuk mesin edit v0.10: zoom rekaman layar, layar diam/loading, rentang layar
// per kalimat voice over, slot potongan mengikuti ketukan musik, dan pemilihan momen montase. Dipakai scripts/edit.mjs.
// Semua kotak dalam koordinat 0-1 bingkai sumber: [x, y, w, h].

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Sampel aktivitas (edit_media.py activity) di rentang detik [t0, t1]: jumlah sampel aktif, layar berganti, kotak gabungan. */
export function activityIn(act, t0, t1) {
  if (!act?.n) return { active: 0, full: 0, n: 0, box: null };
  const [GX, GY] = act.grid;
  const k0 = clamp(Math.ceil(t0 * act.fps), 0, act.n - 1), k1 = clamp(Math.floor(t1 * act.fps), 0, act.n - 1);
  const count = new Map();
  let active = 0, full = 0, n = 0;
  for (let k = k0; k <= k1; k++) {
    n++;
    const c = act.cells[k];
    if (c === "F") { full++; continue; }
    if (!c?.length) continue;
    active++;
    for (const i of c) count.set(i, (count.get(i) ?? 0) + 1);
  }
  if (!count.size) return { active, full, n, box: null };
  // sel yang berubah >= 2 sampel (kursor yang lewat sekali tidak ikut), kecuali aktivitasnya memang singkat
  const need = active >= 4 ? 2 : 1;
  let x0 = GX, y0 = GY, x1 = -1, y1 = -1;
  for (const [i, v] of count) {
    if (v < need) continue;
    const x = i % GX, y = Math.floor(i / GX);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (x1 < 0) return { active, full, n, box: null };
  return { active, full, n, box: [x0 / GX, y0 / GY, (x1 - x0 + 1) / GX, (y1 - y0 + 1) / GY] };
}

/**
 * Kotak zoom sebentuk kanvas dari kotak aktivitas: diberi ruang (pad), minimal 1/maxZoom bingkai, tidak keluar bingkai.
 * null = tampil utuh (bila kotak terlalu besar dan bentuk sumber ≈ kanvas).
 */
export function zoomBox(box, { srcW, srcH, cw, ch, maxZoom = 2, pad = 0.08, fullFrac = 0.55 }) {
  if (!box) return null;
  const A = cw / ch, same = Math.abs(srcW / srcH - A) / A < 0.12;
  let bx = box[0] * srcW - pad * srcW, by = box[1] * srcH - pad * srcH;
  let bw = box[2] * srcW + 2 * pad * srcW, bh = box[3] * srcH + 2 * pad * srcH;
  const minH = srcH / maxZoom;
  let h = Math.max(bh, bw / A, Math.min(minH, srcW / A)), w = h * A;
  if (h > srcH) { h = srcH; w = h * A; }
  if (w > srcW) { w = srcW; h = w / A; }
  if (same && (w * h) / (srcW * srcH) > fullFrac) return null;
  const cx = bx + bw / 2, cy = by + bh / 2;
  const x = clamp(cx - w / 2, 0, srcW - w), y = clamp(cy - h / 2, 0, srcH - h);
  return [x / srcW, y / srcH, w / srcW, h / srcH].map((v) => +v.toFixed(4));
}

const iou = (a, b) => {
  if (!a || !b) return a === b ? 1 : 0;
  const ix = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])), iy = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const i = ix * iy;
  return i / (a[2] * a[3] + b[2] * b[3] - i);
};

/**
 * Rangkai kotak zoom per unit (kalimat/potongan) menjadi keadaan kamera yang tenang: unit berurutan dengan kotak mirip
 * (IoU >= 0,5) digabung, keadaan < holdF frame ikut keadaan sebelumnya, dan (kanvas beda bentuk dari sumber) unit tanpa
 * kotak memakai kotak terdekat. units: [{f0, f1, box}] -> [{f0, f1, box}] bersambung.
 */
export function zoomKeys(units, { holdF = 60, keepWhenNull = false } = {}) {
  const u = units.map((x) => ({ ...x }));
  if (keepWhenNull) {
    let last = u.find((x) => x.box)?.box ?? null;
    for (const x of u) { if (x.box) last = x.box; else x.box = last; }
  }
  const keys = [];
  for (const x of u) {
    const k = keys.at(-1);
    if (k && iou(k.box, x.box) >= 0.5) k.f1 = x.f1;
    else keys.push({ f0: x.f0, f1: x.f1, box: x.box });
  }
  // keadaan pendek: gabung ke sebelumnya (atau sesudahnya bila di awal)
  for (let i = 0; i < keys.length; i++) {
    if (keys.length < 2 || keys[i].f1 - keys[i].f0 >= holdF) continue;
    if (i > 0) { keys[i - 1].f1 = keys[i].f1; keys.splice(i, 1); i -= 2; }
    else { keys[1].f0 = keys[0].f0; keys.splice(0, 1); i = -1; }
  }
  for (let i = 1; i < keys.length; i++) keys[i].f0 = keys[i - 1].f1;
  return keys;
}

/**
 * Rentang layar per scene voice over (layar bisu + narasi AI): bagian rekaman yang aktif dibagi berurutan sebanding dengan
 * durasi tiap scene. scenes: [{d}] (detik) -> [[a, b]] detik sumber.
 */
export function screenRanges(act, dur, scenes) {
  const spans = [];
  if (act?.n) {
    const on = act.cells.map((c) => c === "F" || (c?.length ?? 0) > 0);
    let a = null, lastOn = -1;
    on.forEach((v, k) => {
      const t = k / act.fps;
      if (v) { if (a === null) a = t; lastOn = t; }
      else if (a !== null && t - lastOn > 1.5) { spans.push([Math.max(0, a - 0.3), Math.min(dur, lastOn + 0.5)]); a = null; }
    });
    if (a !== null) spans.push([Math.max(0, a - 0.3), Math.min(dur, lastOn + 0.5)]);
  }
  if (!spans.length) spans.push([0, dur]);
  const total = spans.reduce((t, [a, b]) => t + (b - a), 0);
  const D = scenes.reduce((t, s) => t + s.d, 0) || 1;
  /** detik aktif ke-x -> detik sumber */
  const at = (x, start = false) => {
    let r = x;
    for (const [a, b] of spans) { if (start ? r < b - a - 1e-9 : r <= b - a + 1e-9) return a + r; r -= b - a; }
    return spans.at(-1)[1];
  };
  let cum = 0;
  return scenes.map((s) => {
    const a = at((cum / D) * total, true);
    cum += s.d;
    const b = at((cum / D) * total);
    return [+a.toFixed(2), +Math.max(b, a + 0.5).toFixed(2)];
  });
}

/**
 * Slot potongan mengikuti ketukan: mulai di ketukan pertama birama, panjang 2 ketukan saat musik ramai (energi >= 0,6)
 * dan 4 ketukan saat tenang, dijaga dalam [minSec, maxSec]; berakhir di awal birama terakhir <= start + targetSec.
 * Tanpa ketukan: kisi tetap 100 BPM (musik sintetis). -> [{t0, t1}]
 */
export function beatSlots(bt, { start = 0, targetSec = 30, beatsPerShot = [2, 4], shotSec = [0.6, 3.5], introBeats = 4 } = {}) {
  let beats = bt?.beats?.length >= 8 ? bt.beats : Array.from({ length: Math.ceil((targetSec + 20) / 0.6) }, (_, k) => +(k * 0.6).toFixed(3));
  const energy = bt?.beats?.length >= 8 ? bt.energy ?? [] : [];
  const downs = bt?.downbeats?.length ? bt.downbeats : beats.filter((_, k) => k % 4 === 0);
  const s0 = downs.find((t) => t >= start - 0.05) ?? beats.find((t) => t >= start) ?? 0;
  const end = [...downs].reverse().find((t) => t <= s0 + targetSec + 0.05 && t - s0 >= Math.min(targetSec, 6)) ?? s0 + targetSec;
  let i = beats.findIndex((t) => Math.abs(t - s0) < 0.05);
  if (i < 0) i = 0;
  const slots = [];
  let first = true;
  while (i < beats.length - 1 && beats[i] < end - 0.3) {
    let n = first ? introBeats : (energy[i] ?? 0.5) >= 0.6 ? beatsPerShot[0] : beatsPerShot[1];
    const len = (k) => (beats[Math.min(beats.length - 1, i + k)] ?? end) - beats[i];
    while (len(n) < shotSec[0] && i + n < beats.length - 1) n *= 2;
    while (len(n) > shotSec[1] && n > 1) n = Math.floor(n / 2);
    const j = Math.min(beats.length - 1, i + n);
    const t1 = Math.min(beats[j], end);
    if (t1 - beats[i] < 0.3) break;
    slots.push({ t0: +beats[i].toFixed(3), t1: +t1.toFixed(3) });
    i = j;
    first = false;
  }
  // sisa sangat pendek di akhir digabung ke slot terakhir
  if (slots.length && end - slots.at(-1).t1 > 0 && end - slots.at(-1).t1 < 0.3) slots.at(-1).t1 = +end.toFixed(3);
  return slots;
}

/** Bagi rentang [t0, t1] (voice over montase) jadi potongan 1,5-3 dtk, tepinya ditarik ke ketukan terdekat (±0,25 dtk). */
export function splitSlots(t0, t1, beats = [], [lo, hi] = [1.5, 3]) {
  const d = t1 - t0;
  const n = Math.max(1, Math.round(d / ((lo + hi) / 2)));
  const cuts = Array.from({ length: n - 1 }, (_, k) => {
    const t = t0 + ((k + 1) * d) / n;
    const b = beats.reduce((best, x) => (Math.abs(x - t) < Math.abs(best - t) ? x : best), Infinity);
    return Math.abs(b - t) <= 0.25 ? b : t;
  });
  const pts = [t0, ...cuts, t1];
  return pts.slice(0, -1).map((a, k) => ({ t0: +a.toFixed(3), t1: +pts[k + 1].toFixed(3) }));
}

/** Rata-rata skor momen di [a, a+L] detik. */
const winScore = (m, a, L) => {
  const k0 = Math.max(0, Math.round(a * m.fps)), k1 = Math.min(m.n - 1, Math.round((a + L) * m.fps));
  let s = 0, c = 0;
  for (let k = k0; k <= k1; k++) { s += m.score[k]; c++; }
  return c ? s / c : 0;
};
/** Jendela terbaik sepanjang L di [lo, hi] (langkah 0,2 dtk) yang tidak menabrak rentang terpakai. */
const bestWindow = (m, L, lo, hi, used) => {
  let best = null;
  for (let a = lo; a + L <= hi + 1e-9; a += 0.2) {
    if (used.some(([u0, u1]) => a < u1 && a + L > u0)) continue;
    const s = winScore(m, a, L);
    if (!best || s > best.s) best = { a: +a.toFixed(2), s };
  }
  return best;
};

/**
 * Pilih momen untuk tiap slot. srcs: [{src (indeks), dur, m (edit_media moments)}] dalam urutan cerita. Slot boleh
 * membawa "allow": [indeks sumber]. Tanpa allow: slot dibagi berurutan ke sumber sebanding panjang bagian bagusnya,
 * lalu di tiap sumber rentangnya dibagi rata agar momen tersebar sesuai alur waktu. -> [{src, from, dur, score}]
 */
export function pickMoments(slots, srcs, { edge = 0.3, order = "urut" } = {}) {
  const used = new Map(srcs.map((s) => [s.src, []]));
  const usable = srcs.map((s) => Math.max(0, s.dur - 2 * edge));
  const pick = (s, L, lo, hi) => {
    const m = s.m ?? { fps: 1, n: 1, score: [0.5] };
    const span0 = Math.max(edge, lo), span1 = Math.min(s.dur - edge, hi);
    let w = span1 - span0 >= L ? bestWindow(m, L, span0, span1, used.get(s.src)) : null;
    if (!w) w = bestWindow(m, L, edge, s.dur - edge, used.get(s.src));
    if (!w) w = bestWindow(m, Math.min(L, Math.max(0.2, s.dur - 0.1)), 0, s.dur, []); // klip lebih pendek dari slot: dipakai utuh
    if (!w) return null;
    const len = Math.min(L, s.dur - w.a);
    used.get(s.src).push([w.a, w.a + len]);
    return { src: s.src, from: w.a, dur: +L.toFixed(3), score: +w.s.toFixed(2), ...(len < L - 0.05 ? { hold: +(L - len).toFixed(3) } : {}) };
  };
  const out = new Array(slots.length).fill(null);
  // slot tanpa allow: alokasi berurutan sebanding panjang sumber (sisa terbesar)
  const free = slots.map((s, k) => ({ ...s, k })).filter((s) => !s.allow?.length);
  if (free.length && srcs.length) {
    const tot = usable.reduce((a, b) => a + b, 0) || 1;
    const raw = usable.map((u) => (u / tot) * free.length);
    const cnt = raw.map(Math.floor);
    let rest = free.length - cnt.reduce((a, b) => a + b, 0);
    raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { cnt[i]++; rest--; } });
    // urutan slot per sumber: "urut" = klip 1 dulu, lalu klip 2, ... (kronologis, cocok untuk vlog);
    // "selang" = bergiliran 1,2,3,1,2,3 (montase musik yang lebih dinamis); di dalam tiap klip tetap kronologis
    const seq = [];
    if (order === "selang") { const left = [...cnt]; while (seq.length < free.length) srcs.forEach((_, i) => { if (left[i]-- > 0) seq.push(i); }); }
    else cnt.forEach((c, i) => { for (let j = 0; j < c; j++) seq.push(i); });
    srcs.forEach((s, i) => {
      const mine = free.filter((_, k) => seq[k] === i);
      mine.forEach((sl, j) => {
        const lo = edge + (j * usable[i]) / mine.length, hi = edge + ((j + 1) * usable[i]) / mine.length;
        out[sl.k] = pick(s, sl.t1 - sl.t0, lo, hi);
      });
    });
  }
  // slot dengan allow: sumber yang diizinkan dengan jendela terbaik yang belum terpakai
  slots.forEach((sl, k) => {
    if (out[k] || !sl.allow?.length) return;
    let best = null;
    for (const s of srcs.filter((x) => sl.allow.includes(x.src))) {
      const w = bestWindow(s.m ?? { fps: 1, n: 1, score: [0.5] }, sl.t1 - sl.t0, edge, s.dur - edge, used.get(s.src));
      if (w && (!best || w.s > best.w.s)) best = { s, w };
    }
    if (best) { used.get(best.s.src).push([best.w.a, best.w.a + (sl.t1 - sl.t0)]); out[k] = { src: best.s.src, from: best.w.a, dur: +(sl.t1 - sl.t0).toFixed(3), score: +best.w.s.toFixed(2) }; }
    else out[k] = pick(srcs.find((x) => sl.allow.includes(x.src)) ?? srcs[0], sl.t1 - sl.t0, 0, Infinity);
  });
  return out;
}

/** Jendela terbaik per klip untuk konteks (B-roll vlog): [{a, b, score}] tidak bertumpuk, maks n. */
export function topWindows(m, dur, { L = 3, n = 3, edge = 0.3 } = {}) {
  const used = [], out = [];
  for (let k = 0; k < n; k++) {
    const w = bestWindow(m, Math.min(L, Math.max(0.5, dur - 2 * edge)), edge, dur - edge, used);
    if (!w || w.s < 0.15) break;
    used.push([w.a, w.a + L]);
    out.push({ a: w.a, b: +Math.min(dur, w.a + L).toFixed(2), score: +w.s.toFixed(2) });
  }
  return out.sort((a, b) => a.a - b.a);
}
