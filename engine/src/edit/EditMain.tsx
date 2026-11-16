// Komposisi "Edit": footage hasil potong (A-roll) + grafis style (narration) + subtitle karaoke.
// Semua waktu sudah diselesaikan scripts/edit.mjs ke frame; komponen di sini hanya menggambar sebagai fungsi frame.
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, OffthreadVideo, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { LayoutProbe } from "../probe/LayoutProbe";
import type { EditProps, EObj, Face } from "./types";

// ---------------------------------------------------------------- font lokal (tanpa internet)
const FONTS: [string, string, string][] = [
  ["EPoppins", "fonts/Poppins-SemiBold.ttf", "600"],
  ["EPoppins", "fonts/Poppins-ExtraBold.ttf", "800"],
  ["EPoppins", "fonts/Poppins-Black.ttf", "900"],
  ["ECaveat", "fonts/Caveat-Variable.ttf", "400 700"],
];
let fontsLoaded: Promise<unknown> | null = null;
const useFonts = () => {
  const [h] = useState(() => delayRender("font edit"));
  useEffect(() => {
    fontsLoaded ??= Promise.all(
      FONTS.map(([fam, file, weight]) => {
        const f = new FontFace(fam, `url(${staticFile(file)})`, { weight });
        (document.fonts as unknown as { add: (x: FontFace) => void }).add(f);
        return f.load();
      }),
    );
    fontsLoaded.then(() => continueRender(h), () => continueRender(h));
  }, [h]);
};
const HEAD = "EPoppins, sans-serif";
const HAND = "ECaveat, cursive";

// ---------------------------------------------------------------- bantuan gerak
const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return { frame, fps };
};
const pop = (frame: number, at: number, fps: number) => spring({ frame: frame - at, fps, config: { damping: 14, stiffness: 180, mass: 0.6 } });
const vis = (frame: number, at: number, until: number) => frame >= at && frame < until;
const fadeOut = (frame: number, until: number) => interpolate(frame, [until - 5, until], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

type Ctx = { p: EditProps["edit"]["style"]["palette"]; frame: number; fps: number; video: string; faceAt: (f: number) => Face | null };

// ---------------------------------------------------------------- ikon kecil
const Icon: React.FC<{ kind?: string; size?: number; c: Ctx }> = ({ kind, size = 56, c }) => {
  const box: React.CSSProperties = { width: size, height: size, borderRadius: size * 0.22, background: c.p.teal, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" };
  const t: React.CSSProperties = { color: "#fff", fontFamily: HEAD, fontWeight: 900, fontSize: size * 0.42 };
  if (kind === "check") return <div style={{ ...box, borderRadius: "50%", background: c.p.teal }}><svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" stroke="#fff" strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></div>;
  if (kind === "x") return <div style={{ ...box, borderRadius: "50%", background: "#C8473D" }}><svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" /></svg></div>;
  if (kind === "ai") return <div style={box}><svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">{[0, 45, 90, 135].map((r) => <rect key={r} x={11} y={2} width={2.2} height={20} rx={1.1} fill="#fff" transform={`rotate(${r} 12 12)`} />)}</svg></div>;
  if (kind === "play" || kind === "video") return <div style={{ ...box, background: "#1E3B36" }}><svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24"><rect x={3} y={4} width={18} height={16} rx={3} stroke="#fff" strokeWidth={2} fill="none" /><path d="M10 9l5 3-5 3z" fill="#fff" /></svg></div>;
  if (kind === "user") return <div style={{ ...box, borderRadius: "50%" }}><svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24"><circle cx={12} cy={9} r={4} fill="#fff" /><path d="M4 21c1.5-4.5 14.5-4.5 16 0" fill="#fff" /></svg></div>;
  const label = kind === "doc" ? "W" : kind === "md" ? "MD" : kind === "img" ? "IMG" : kind === "skill" ? "★" : (kind ?? "•").slice(0, 3).toUpperCase();
  return <div style={box}><span style={t}>{label}</span></div>;
};

const Chip: React.FC<{ text: string; icon?: string; c: Ctx; size?: number; arrow?: string; dim?: boolean }> = ({ text, icon, c, size = 44, arrow, dim }) => (
  <div data-edit={text} style={{ display: "inline-flex", alignItems: "center", gap: size * 0.32, padding: `${size * 0.26}px ${size * 0.5}px`, borderRadius: size * 0.36, background: dim ? "rgba(227,233,233,0.45)" : c.p.card,
    boxShadow: "0 10px 28px rgba(0,0,0,0.28)", fontFamily: HEAD, fontWeight: 800, fontSize: size, color: c.p.deep ?? "#0B2420", whiteSpace: "nowrap" }}>
    {icon ? <Icon kind={icon} size={size * 1.25} c={c} /> : null}
    <span>{text}</span>
    {arrow ? <span style={{ color: c.p.teal, fontSize: size * 0.85 }}>{arrow}</span> : null}
  </div>
);

// ---------------------------------------------------------------- objek
const Keyword: React.FC<{ o: EObj; c: Ctx; box: Box }> = ({ o, c, box }) => {
  const { frame, fps } = c;
  const kAt = o.kickerAt ?? o.at - 16;
  const tAt = o.titleAt ?? o.at - 8;
  const titles = Array.isArray(o.title) ? o.title : o.title ? [o.title] : [];
  const wipe = interpolate(frame - o.at, [0, 7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const align = o.align ?? (box.center ? "center" : "left");
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, display: "flex", flexDirection: "column", alignItems: align === "center" ? "center" : "flex-start", gap: 4, opacity: fadeOut(frame, o.until) }}>
      {o.kicker && frame >= kAt ? <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 64, color: "rgba(255,255,255,0.9)", transform: `rotate(-3deg) translateY(${(1 - pop(frame, kAt, fps)) * 12}px)`, opacity: pop(frame, kAt, fps), textShadow: "0 4px 16px rgba(0,0,0,.5)" }}>{o.kicker}</div> : null}
      {titles.map((t, i) => frame >= tAt + i * 4 ? <div key={i} style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 66, lineHeight: 1.05, color: "#fff", textShadow: "0 6px 22px rgba(0,0,0,.55)", opacity: pop(frame, tAt + i * 4, fps), transform: `scale(${0.9 + 0.1 * pop(frame, tAt + i * 4, fps)})`, transformOrigin: "left center" }}>{t}</div> : null)}
      {o.keyword && frame >= o.at ? (
        <div style={{ marginTop: 6, padding: "4px 22px 8px", borderRadius: 12, background: c.p.card, boxShadow: "0 14px 40px rgba(0,0,0,.35)",
          clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0 round 12px)`, filter: `blur(${(1 - wipe) * 6}px)` }}>
          <span style={{ fontFamily: HEAD, fontWeight: 900, fontSize: o.size ?? 108, lineHeight: 1.05, color: c.p.tealText, letterSpacing: -1, textTransform: "uppercase", whiteSpace: "nowrap" }}>{o.keyword}</span>
        </div>
      ) : null}
      {o.big && frame >= o.at ? <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: o.size ?? 170, lineHeight: 1, color: "#fff", textTransform: "uppercase", transform: `scale(${0.7 + 0.3 * pop(frame, o.at, fps)})`, textShadow: "0 10px 40px rgba(0,0,0,.6)" }}>{o.big}</div> : null}
      {o.sub && frame >= (o.subAt ?? o.at + 8) ? <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 60, color: "rgba(255,255,255,.9)", transform: "rotate(-3deg)", opacity: pop(frame, o.subAt ?? o.at + 8, fps) }}>{o.sub}</div> : null}
    </div>
  );
};

const Chips: React.FC<{ o: EObj; c: Ctx; box: Box }> = ({ o, c, box }) => (
  <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, display: "flex", flexDirection: "column", alignItems: box.center ? "center" : box.right ? "flex-end" : "flex-start", gap: 18, opacity: fadeOut(c.frame, o.until) }}>
    {o.kicker ? <div style={{ fontFamily: HAND, fontWeight: 700, fontSize: 58, color: "rgba(255,255,255,.92)", transform: "rotate(-3deg)", textShadow: "0 4px 16px rgba(0,0,0,.5)" }}>{o.kicker}</div> : null}
    {(o.items ?? []).map((it, i) => c.frame >= it.at ? (
      <div key={i} style={{ transform: `scale(${0.6 + 0.4 * pop(c.frame, it.at, c.fps)})`, opacity: pop(c.frame, it.at, c.fps), marginLeft: box.center || box.right ? 0 : i * 18 }}>
        <Chip text={it.text} icon={it.icon} c={c} dim={it.dim} />
      </div>
    ) : null)}
  </div>
);

const Annotate: React.FC<{ o: EObj; c: Ctx }> = ({ o, c }) => (
  <>
    {(o.items ?? []).map((it, i) => {
      if (c.frame < it.at) return null;
      const f = c.faceAt(c.frame);
      if (!f) return null;
      const [x, y, w, h, mx, my, ex, ey] = f;
      const tgt = it.target === "mouth" ? [mx, my] : it.target === "eyes" ? [ex, ey] : it.target === "head" ? [x + w / 2, y] : it.target === "top" ? [x + w * 0.2, y - h * 0.6] : [x + w * 0.95, y + h * 0.55];
      const left = it.side ? it.side === "left" : tgt[0] > 540;
      const cx = Math.min(900, Math.max(80, left ? tgt[0] - 330 : tgt[0] + 60));
      const cy = Math.min(1180, Math.max(260, tgt[1] - 30 + (it.dy ?? 0)));
      const a = pop(c.frame, it.at, c.fps);
      const arrow = left ? (tgt[1] > cy + 40 ? "↘" : tgt[1] < cy - 40 ? "↗" : "→") : tgt[1] > cy + 40 ? "↙" : tgt[1] < cy - 40 ? "↖" : "←";
      return <div key={i} style={{ position: "absolute", left: cx, top: cy, opacity: a * fadeOut(c.frame, o.until), transform: `scale(${0.7 + 0.3 * a})` }}><Chip text={it.text} c={c} size={40} arrow={arrow} /></div>;
    })}
  </>
);

const Brackets: React.FC<{ o: EObj; c: Ctx }> = ({ o, c }) => {
  const f = c.faceAt(c.frame);
  if (!f) return null;
  const pad = 0.16;
  const x = f[0] - f[2] * pad, y = f[1] - f[3] * pad, w = f[2] * (1 + 2 * pad), h = f[3] * (1 + 2 * pad);
  const a = pop(c.frame, o.at, c.fps);
  const L = Math.min(w, h) * 0.22;
  const s = 1.15 - 0.15 * a;
  const st: React.CSSProperties = { position: "absolute", width: L, height: L, borderColor: "#fff", borderStyle: "solid", borderWidth: 0 };
  return (
    <div data-probe="ignore" style={{ position: "absolute", left: x, top: y, width: w, height: h, opacity: a * fadeOut(c.frame, o.until), transform: `scale(${s})` }}>
      <div style={{ ...st, left: 0, top: 0, borderLeftWidth: 5, borderTopWidth: 5 }} />
      <div style={{ ...st, right: 0, top: 0, borderRightWidth: 5, borderTopWidth: 5 }} />
      <div style={{ ...st, left: 0, bottom: 0, borderLeftWidth: 5, borderBottomWidth: 5 }} />
      <div style={{ ...st, right: 0, bottom: 0, borderRightWidth: 5, borderBottomWidth: 5 }} />
    </div>
  );
};

const Card: React.FC<{ c: Ctx; box: Box; at: number; until: number; children: React.ReactNode; pad?: number; bg?: string }> = ({ c, box, at, until, children, pad = 34, bg }) => {
  const a = pop(c.frame, at, c.fps);
  return (
    <div data-edit="card" style={{ position: "absolute", left: box.x, top: box.y, width: box.w, padding: pad, borderRadius: 34, background: bg ?? c.p.card, boxShadow: "0 30px 80px rgba(0,0,0,.45)",
      opacity: a * fadeOut(c.frame, until), transform: `translateY(${(1 - a) * 40}px) scale(${0.94 + 0.06 * a})` }}>{children}</div>
  );
};

const Doc: React.FC<{ o: EObj; c: Ctx; box: Box }> = ({ o, c, box }) => (
  <Card c={c} box={box} at={o.at} until={o.until}>
    <div style={{ display: "flex", alignItems: "center", gap: 18, paddingBottom: 18, borderBottom: "2px solid rgba(11,36,32,.12)" }}>
      <Icon kind={o.icon ?? "doc"} size={60} c={c} />
      <span style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 40, color: c.p.deep }}>{o.title}</span>
    </div>
    {(o.rows ?? []).map((r, i) => {
      const on = c.frame >= r.at;
      return (
        <div key={i} style={{ padding: "16px 0", borderBottom: "1px dashed rgba(11,36,32,.12)", opacity: on ? 1 : 0.25 }}>
          <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 30, color: on ? c.p.teal : "#9AA6A4" }}>{r.label}</div>
          {on && r.value ? (
            <div style={{ marginTop: 10, transform: `translateY(${(1 - pop(c.frame, r.at, c.fps)) * 14}px)`, opacity: pop(c.frame, r.at, c.fps) }}>
              {Array.isArray(r.value)
                ? <div style={{ display: "flex", gap: 18 }}>{r.value.map((v) => /^#/.test(v) ? <div key={v} style={{ textAlign: "center" }}><div style={{ width: 84, height: 84, borderRadius: "50%", background: v, border: "2px solid rgba(0,0,0,.08)" }} /><div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 20, color: "#55605E", marginTop: 6 }}>{v}</div></div> : <span key={v} style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 40, color: c.p.deep }}>{v}</span>)}</div>
                : <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 42, color: c.p.deep }}>{r.value}</div>}
            </div>
          ) : null}
        </div>
      );
    })}
  </Card>
);

const Phone: React.FC<{ c: Ctx; box: Box; at: number; until: number; header?: string; children: React.ReactNode; dark?: boolean }> = ({ c, box, at, until, header, children, dark }) => {
  const a = pop(c.frame, at, c.fps);
  const h = box.h ?? 960;
  return (
    <div data-edit="phone" style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: h, borderRadius: 64, background: "#0E1513", padding: 14, boxShadow: "0 40px 90px rgba(0,0,0,.5)",
      opacity: a * fadeOut(c.frame, until), transform: `translateY(${(1 - a) * 60}px)` }}>
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 52, overflow: "hidden", background: dark ? "#000" : "#E6EAEA", display: "flex", flexDirection: "column" }}>
        <div style={{ position: "absolute", top: 18, left: "50%", width: 150, height: 40, marginLeft: -75, borderRadius: 20, background: "#0E1513", zIndex: 3 }} />
        {header ? (
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "78px 30px 20px", background: "#F4F6F6" }}>
            <Icon kind="ai" size={58} c={c} />
            <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 34, color: c.p.deep }}>{header}</div><div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 22, color: "#7A8785" }}>online</div></div>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
};

const Chat: React.FC<{ o: EObj; c: Ctx; box: Box }> = ({ o, c, box }) => (
  <Phone c={c} box={box} at={o.at} until={o.until} header={o.header ?? "AI"}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 18, padding: "20px 26px" }}>
      {/* seperti chat sungguhan: gelembung lama bergulir keluar, maks 3 terlihat (tidak terpotong) */}
      {(o.bubbles ?? []).filter((b) => c.frame >= b.at).slice(-(o.maxBubbles ?? ((box.h ?? 960) > 800 ? 5 : 3))).map((b, i) => c.frame >= b.at ? (
        <div key={i} style={{ alignSelf: b.side === "me" ? "flex-end" : "flex-start", maxWidth: "80%", padding: "18px 24px", borderRadius: 26,
          background: b.side === "me" ? c.p.teal : "#fff", color: b.side === "me" ? "#fff" : c.p.deep, fontFamily: HEAD, fontWeight: 800, fontSize: 30, lineHeight: 1.25,
          boxShadow: "0 8px 20px rgba(0,0,0,.12)", transform: `translateY(${(1 - pop(c.frame, b.at, c.fps)) * 30}px)`, opacity: pop(c.frame, b.at, c.fps), display: "flex", alignItems: "center", gap: 14 }}>
          {b.file ? <Icon kind={b.icon ?? "doc"} size={52} c={c} /> : null}
          <span>{b.file ?? b.text}{b.file && b.text ? <div style={{ fontWeight: 600, fontSize: 22, opacity: 0.8 }}>{b.text}</div> : null}</span>
        </div>
      ) : null)}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px 30px" }}>
      <div style={{ flex: 1, height: 64, borderRadius: 32, background: "#fff", fontFamily: HEAD, fontWeight: 600, fontSize: 24, color: "#9AA6A4", display: "flex", alignItems: "center", paddingLeft: 26 }}>Tulis pesan...</div>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: c.p.teal }} />
    </div>
  </Phone>
);

const Prompt: React.FC<{ o: EObj; c: Ctx; box: Box }> = ({ o, c, box }) => {
  const text = o.text ?? "";
  const end = Math.max(o.at + 10, o.typeUntil ?? o.until - 10);
  const n = Math.round(interpolate(c.frame, [o.at + 4, end], [0, text.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const shown = text.slice(0, n);
  const caret = n < text.length && Math.floor(c.frame / 8) % 2 === 0;
  const marks = (o.mark ?? []).map((m) => m.toLowerCase());
  const parts: React.ReactNode[] = [];
  let rest = shown;
  while (rest.length) {
    const lower = rest.toLowerCase();
    const hit = marks.map((m) => [m, lower.indexOf(m)] as const).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1])[0];
    if (!hit) { parts.push(rest); break; }
    parts.push(rest.slice(0, hit[1]));
    parts.push(<span key={parts.length} style={{ background: c.p.teal, color: "#fff", borderRadius: 8, padding: "0 8px" }}>{rest.slice(hit[1], hit[1] + hit[0].length)}</span>);
    rest = rest.slice(hit[1] + hit[0].length);
  }
  return (
    <Card c={c} box={box} at={o.at} until={o.until} bg="#F4F6F6">
      {o.kicker ? <div style={{ position: "absolute", top: -84, left: 8, fontFamily: HAND, fontWeight: 700, fontSize: 60, color: "#fff", transform: "rotate(-3deg)", textShadow: "0 4px 16px rgba(0,0,0,.5)" }}>{o.kicker}</div> : null}
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: HEAD, fontWeight: 800, fontSize: 28, color: c.p.teal }}><Icon kind="ai" size={42} c={c} />{o.label ?? "prompt"}</div>
      <div style={{ marginTop: 16, minHeight: 150, fontFamily: HEAD, fontWeight: 800, fontSize: 38, lineHeight: 1.35, color: c.p.deep }}>{parts}{caret ? <span style={{ color: c.p.teal }}>|</span> : null}</div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}><div style={{ padding: "12px 26px", borderRadius: 18, background: c.p.teal, color: "#fff", fontFamily: HEAD, fontWeight: 800, fontSize: 28 }}>↑ {o.button ?? "kirim"}</div></div>
    </Card>
  );
};

const FileB: React.FC<{ o: EObj; c: Ctx; box: Box }> = ({ o, c, box }) => (
  <Card c={c} box={{ ...box, w: Math.min(box.w, 620) }} at={o.at} until={o.until} pad={22}>
    {o.kicker ? <div style={{ position: "absolute", top: -78, left: 8, fontFamily: HAND, fontWeight: 700, fontSize: 58, color: "#fff", transform: "rotate(-3deg)", textShadow: "0 4px 16px rgba(0,0,0,.5)" }}>{o.kicker}</div> : null}
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <Icon kind={o.icon ?? "md"} size={70} c={c} />
      <div><div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 40, color: c.p.deep }}>{o.title}</div>{o.sub ? <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 26, color: "#6B7775" }}>{o.sub}</div> : null}</div>
    </div>
  </Card>
);

const ResultCard: React.FC<{ o: EObj; c: Ctx; box: Box }> = ({ o, c, box }) => (
  <Card c={c} box={{ ...box, w: Math.min(box.w, 760) }} at={o.at} until={o.until} pad={30}>
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <Icon kind={o.icon ?? "skill"} size={92} c={c} />
      <div>
        {o.kicker ? <div style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 24, letterSpacing: 2, color: c.p.teal, textTransform: "uppercase" }}>{o.kicker}</div> : null}
        <div style={{ fontFamily: HEAD, fontWeight: 900, fontSize: 46, color: c.p.deep }}>{o.title}</div>
        {o.sub ? <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 28, color: "#6B7775" }}>{o.sub}</div> : null}
      </div>
    </div>
  </Card>
);

/** Video pembicara di dalam bingkai (lingkaran PiP / layar HP), wajah di tengah. */
const Speaker: React.FC<{ c: Ctx; w: number; h: number; round?: boolean; faceFrac?: number }> = ({ c, w, h, round, faceFrac = 0.55 }) => {
  const f = c.faceAt(c.frame) ?? [380, 420, 320, 420, 540, 760, 540, 560];
  const s = Math.max(w / 1080, (faceFrac * h) / f[3]);
  const fx = f[0] + f[2] / 2, fy = f[1] + f[3] / 2;
  return (
    <div data-probe="ignore" style={{ position: "relative", width: w, height: h, overflow: "hidden", borderRadius: round ? "50%" : 0 }}>
      <OffthreadVideo src={staticFile(c.video)} muted style={{ position: "absolute", width: 1080, height: 1920, left: w / 2 - fx * s, top: h / 2 - fy * s, transform: `scale(${s})`, transformOrigin: "0 0" }} />
    </div>
  );
};

const PhoneCTA: React.FC<{ o: EObj; c: Ctx; box: Box }> = ({ o, c, box }) => (
  <Phone c={c} box={box} at={o.at} until={o.until} dark>
    <Speaker c={c} w={box.w - 28} h={(box.h ?? 960) - 28} faceFrac={0.32} />
    <div style={{ position: "absolute", left: 30, right: 30, bottom: 40, display: "flex", alignItems: "center", gap: 16 }}>
      <Icon kind="user" size={64} c={c} />
      <div style={{ flex: 1, height: 14, borderRadius: 7, background: "rgba(255,255,255,.7)" }} />
      <div style={{ padding: "12px 26px", borderRadius: 16, background: c.frame >= (o.followAt ?? o.at + 15) ? c.p.teal : "rgba(255,255,255,.85)", color: c.frame >= (o.followAt ?? o.at + 15) ? "#fff" : c.p.deep, fontFamily: HEAD, fontWeight: 800, fontSize: 28 }}>
        {c.frame >= (o.followAt ?? o.at + 15) ? "✓ Following" : "Follow"}
      </div>
    </div>
  </Phone>
);

const ImageCard: React.FC<{ o: EObj; c: Ctx; box: Box }> = ({ o, c, box }) => (
  <Card c={c} box={box} at={o.at} until={o.until} pad={14}>
    <img src={staticFile(o.src ?? "")} style={{ width: "100%", borderRadius: 24, display: "block" }} />
  </Card>
);

// ---------------------------------------------------------------- tata letak slot (zona aman TikTok: x 60-940, y 220-1440)
type Box = { x: number; y: number; w: number; h?: number; center?: boolean; right?: boolean };
const slotBox = (o: EObj, broll: boolean, hasPip: boolean): Box => {
  const big = ["doc", "chat", "phone", "image"].includes(o.type);
  if (o.box) return o.box;
  const slot = o.slot ?? (o.type === "keyword" || o.type === "big" ? "top" : broll ? "center" : "side");
  if (broll) {
    if (slot === "top") return hasPip ? { x: 420, y: 262, w: 520 } : { x: 80, y: 300, w: 860, center: true };
    if (slot === "middle") return { x: 80, y: 700, w: 860, center: true };
    // di atas zona subtitle (y >= 1244)
    if (o.type === "chat" || o.type === "phone") return { x: 250, y: 600, w: 520, h: 610 };
    return { x: 120, y: big ? 600 : 700, w: 780 };
  }
  if (slot === "top") return { x: 66, y: 262, w: 860 };
  // tengah: tepat di bawah wajah (tidak menutupinya), tetap di atas zona subtitle
  // tengah: di bawah wajah bila muat sebelum zona subtitle (y 1230), selain itu di atas wajah; tidak pernah menutup wajah
  if (slot === "center") {
    const need = o.type === "prompt" ? 400 : o.type === "doc" ? 520 : 300;
    const top = o.face ? o.face.y : 700, bot = o.face ? o.face.y + o.face.h : 900;
    const y = 1230 - (bot + 30) >= need ? bot + 30 : top - 30 - 250 >= need ? 250 : 1230 - need;
    return { x: 120, y, w: 780, center: true };
  }
  if (o.type === "phone") return { x: 70, y: 700, w: 360, h: 640 };
  // samping badan, berlawanan dengan posisi wajah (diputuskan edit.mjs dari wajah & gerak tangan)
  const right = o.side === "right";
  const w = big ? 520 : 460;
  const fy = o.face ? o.face.y + o.face.h + 80 : 860;
  return { x: right ? 940 - w : 66, y: Math.min(1100, Math.max(760, fy)), w, right };
};

// ---------------------------------------------------------------- probe (preview): kotak objek vs wajah
const EditProbe: React.FC<{ enabled?: boolean; mode: string; face: Face | null }> = ({ enabled, mode, face }) => {
  const frame = useCurrentFrame();
  useEffect(() => {
    if (!enabled) return;
    const h = delayRender("cek objek");
    const t = setTimeout(() => {
      const root = document.querySelector('[data-probe="root"]')?.getBoundingClientRect();
      const ox = root?.left ?? 0, oy = root?.top ?? 0, k = root ? 1080 / root.width : 1;
      const boxes = Array.from(document.querySelectorAll("[data-edit]")).map((el) => {
        const r = el.getBoundingClientRect();
        return { label: (el as HTMLElement).dataset.edit, x: (r.left - ox) * k, y: (r.top - oy) * k, w: r.width * k, h: r.height * k };
      });
      console.log(`EDIT_PROBE ${JSON.stringify({ frame, mode, face: face ? { x: face[0], y: face[1], w: face[2], h: face[3] } : null, boxes, sub: !!document.querySelector("[data-sub]") })}`);
      continueRender(h);
    }, 300);
    return () => { clearTimeout(t); continueRender(h); };
  }, [enabled, frame, mode, face]);
  return null;
};

// ---------------------------------------------------------------- utama
export const EditMain: React.FC<EditProps> = ({ timing, edit, layoutCheck }) => {
  useFonts();
  const { frame, fps } = useT();
  const p = edit.style.palette;
  const faceAt = (f: number) => edit.face[Math.min(edit.face.length - 1, Math.max(0, f >> 1))] ?? null;
  const c: Ctx = { p, frame, fps, video: edit.video, faceAt };
  const cut = edit.cuts.find((x) => frame >= x.f0 && frame < x.f1) ?? edit.cuts[edit.cuts.length - 1];
  const v = edit.visuals.find((x) => frame >= x.f0 && frame < x.f1);
  const mode = v?.mode ?? "aroll";
  const broll = mode === "broll";
  const pipOn = broll && (edit.style.broll?.pip ?? null) !== null && edit.face.some(Boolean);
  const bg = edit.style.broll?.background ?? {};
  const live = edit.objects.filter((o) => (broll ? o.mode === "broll" : o.mode !== "broll") && vis(frame, o.at - 30, o.until + 1) && frame >= Math.min(o.at, o.kickerAt ?? o.at, o.titleAt ?? o.at, ...(o.items ?? []).map((i) => i.at)) - 16);
  const sub = edit.subs.find((s) => frame >= s.f0 && frame < s.f1);
  const ST = edit.style.type?.subtitle ?? {};
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* A-roll + punch-in (bertumpu di wajah) */}
      <AbsoluteFill style={{ transform: `scale(${cut?.scale ?? 1})`, transformOrigin: `${cut?.ox ?? 540}px ${cut?.oy ?? 760}px` }}>
        <OffthreadVideo src={staticFile(edit.video)} muted style={{ width: 1080, height: 1920 }} />
      </AbsoluteFill>
      {mode === "dim" ? <AbsoluteFill style={{ background: bg.edge ?? "#0B2320", opacity: interpolate(frame, [v!.f0, v!.f0 + 8], [0, Number(edit.style.broll?.closingTransition?.dim ?? 0.55)], { extrapolateRight: "clamp" }) }} /> : null}
      {broll ? (
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 60% at 50% 45%, ${bg.center ?? "#0D2E29"} 0%, ${bg.edge ?? "#0B2320"} 100%)` }}>
          <AbsoluteFill data-probe="ignore" style={{ backgroundImage: `radial-gradient(rgba(255,255,255,${bg.dots?.opacity ?? 0.05}) 1.6px, transparent 1.8px)`, backgroundSize: `${bg.dots?.spacing ?? 22}px ${bg.dots?.spacing ?? 22}px` }} />
          {pipOn ? (
            <div style={{ position: "absolute", left: 66, top: 250, width: 320, height: 320, borderRadius: "50%", boxShadow: `0 0 0 ${edit.style.broll?.pip?.ring?.width ?? 6}px ${edit.style.broll?.pip?.ring?.color ?? "#fff"}, 0 20px 50px rgba(0,0,0,.45)` }}>
              <Speaker c={c} w={320} h={320} round />
            </div>
          ) : null}
        </AbsoluteFill>
      ) : null}
      {/* objek */}
      {live.map((o) => {
        const box = slotBox(o, broll, pipOn);
        const key = `${o.sid}-${o.k}`;
        switch (o.type) {
          case "keyword": case "big": return <Keyword key={key} o={o.type === "big" ? { ...o, big: o.big ?? o.text } : o} c={c} box={box.center === undefined && o.type === "big" ? { ...box, center: true, x: 80, w: 860, y: broll ? 640 : box.y } : box} />;
          case "chips": return <Chips key={key} o={o} c={c} box={box} />;
          case "annotate": return broll ? null : <Annotate key={key} o={o} c={c} />;
          case "brackets": return broll ? null : <Brackets key={key} o={o} c={c} />;
          case "doc": return <Doc key={key} o={o} c={c} box={box} />;
          case "chat": return <Chat key={key} o={o} c={c} box={box} />;
          case "prompt": return <Prompt key={key} o={o} c={c} box={box} />;
          case "file": return <FileB key={key} o={o} c={c} box={box} />;
          case "card": return <ResultCard key={key} o={o} c={c} box={box} />;
          case "phone": return <PhoneCTA key={key} o={o} c={c} box={box} />;
          case "image": return <ImageCard key={key} o={o} c={c} box={box} />;
          default: return null;
        }
      })}
      {/* subtitle karaoke (zona y 1244-1414) */}
      {sub ? (
        <div data-sub="1" style={{ position: "absolute", left: 100, width: 840, top: (ST.zoneY?.[0] ?? 1244) + 20, textAlign: "center", fontFamily: HEAD, fontWeight: 800, fontSize: ST.size ?? 60, lineHeight: 1.2 }}>
          {sub.words.map((w, i) => {
            const next = sub.words[i + 1]?.f0 ?? sub.f1;
            const on = frame >= w.f0 && frame < next;
            return (
              <span key={i} style={{ color: on ? ST.active?.color ?? p.teal : ST.color ?? "#fff", WebkitTextStroke: on ? `3px ${ST.active?.stroke ?? "#fff"}` : undefined, paintOrder: "stroke fill",
                textShadow: `0 4px 14px ${ST.shadow ?? "rgba(0,0,0,.7)"}`, marginRight: 14, display: "inline-block" }}>{w.w}</span>
            );
          })}
        </div>
      ) : null}
      {edit.brand?.left || edit.brand?.right ? (
        <div data-probe="brand" style={{ position: "absolute", top: 254, left: 66, right: 140, display: "flex", justifyContent: "space-between", fontFamily: HEAD, fontWeight: 800, fontSize: 30, letterSpacing: 4, color: "rgba(255,255,255,.9)" }}>
          <span>{edit.brand.left}</span><span>{edit.brand.right}</span>
        </div>
      ) : null}
      <Audio src={staticFile(timing.audio)} />
      <EditProbe enabled={layoutCheck} mode={mode} face={faceAt(frame)} />
      <LayoutProbe enabled={layoutCheck} />
    </AbsoluteFill>
  );
};
