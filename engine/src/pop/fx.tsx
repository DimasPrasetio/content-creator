// Efek & objek gambar gaya pop cinematic (semua fungsi murni dari waktu).
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { DISPLAY, H, K, Sh, UI, W, extrude, hash, sp, usePop, useT } from "./lib";

// ---------- Latar ----------
export const BgNavy: React.FC<{ glow?: string; gx?: number; gy?: number }> = ({ glow = K.NAVY3, gx = 30, gy = 22 }) => {
  const t = useT();
  return (
    <AbsoluteFill style={{ background: K.NAVY }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 900px at ${gx + Math.sin(t / 70) * 3}% ${gy}%, ${glow}, transparent 70%),
                       radial-gradient(900px 900px at 85% 92%, ${K.NAVY2}, transparent 70%)`,
        }}
      />
      {/* garis wallpaper samar */}
      <AbsoluteFill
        style={{
          opacity: 0.07,
          backgroundImage: `repeating-linear-gradient(90deg, ${K.CREAM} 0 2px, transparent 2px 120px)`,
        }}
      />
    </AbsoluteFill>
  );
};

export const BgCream: React.FC = () => (
  <AbsoluteFill style={{ background: K.CREAM }}>
    <AbsoluteFill
      style={{ background: `radial-gradient(1000px 800px at 50% 40%, #fffaf0, transparent 70%), radial-gradient(900px 700px at 50% 110%, #ead9b6, transparent 70%)` }}
    />
    <AbsoluteFill style={{ opacity: 0.08, backgroundImage: `repeating-linear-gradient(0deg, ${K.OUT} 0 2px, transparent 2px 96px)` }} />
  </AbsoluteFill>
);

// ---------- Tekstur global ----------
export const Grain: React.FC<{ strong?: boolean }> = ({ strong }) => {
  const f = useCurrentFrame();
  const step = strong ? Math.floor((f * 8) / 30) : Math.floor(f / 2);
  const size = strong ? 820 : 512;
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile("pop/grain.png")})`,
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `${Math.floor(hash(step) * 512)}px ${Math.floor(hash(step + 99) * 512)}px`,
        mixBlendMode: "overlay",
        opacity: strong ? 0.85 : 0.4,
        pointerEvents: "none",
      }}
    />
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill style={{ background: "radial-gradient(ellipse 75% 60% at 50% 45%, transparent 55%, rgba(8,6,24,.65) 100%)", pointerEvents: "none" }} />
);

/** Header brand di pojok atas, di dalam zona aman TikTok (y >= 226, kanan berakhir di x 940). */
export const Header: React.FC<{ left?: string; right?: string; dark?: boolean }> = ({ left, right, dark = true }) => (
  <div data-probe="brand" style={{ position: "absolute", top: 226, left: 80, right: 140, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 5 }}>
    <div style={{ fontFamily: UI, fontWeight: 900, fontSize: 30, letterSpacing: 6, color: dark ? K.CREAM : K.OUT }}>{left}</div>
    <div style={{ fontFamily: DISPLAY, fontSize: 52, color: K.BRAND, textShadow: extrude(4, dark ? K.RED2 : K.OUT) }}>{right}</div>
  </div>
);

// ---------- Kamera ----------
export const Camera: React.FC<{
  children: React.ReactNode;
  push?: number;
  punches?: { at: number; amt?: number }[];
  shakes?: { at: number; amp?: number }[];
}> = ({ children, push = 0.02, punches = [], shakes = [] }) => {
  const t = useT();
  const { poster } = usePop();
  // dorongan pelan yang melandai (maks. +4 dtk dorongan) agar scene panjang tidak menabrak header
  let s = 1 + push * 4 * (1 - Math.exp(-t / 120));
  for (const p of punches) {
    if (t >= p.at) {
      const d = t - p.at;
      s += (p.amt ?? 0.08) * Math.exp(-d / 10) * (d < 3 ? d / 3 : 1);
    }
  }
  let x = 0;
  let y = 0;
  let r = 0;
  for (const k of shakes) {
    if (t >= k.at) {
      const d = t - k.at;
      const e = (k.amp ?? 22) * Math.exp(-0.13 * d);
      x += e * Math.sin(d * 2.3);
      y += e * Math.cos(d * 2.9) * 0.7;
      r += (e / 30) * Math.sin(d * 1.9);
    }
  }
  // "line boil" di mode poster
  if (poster) {
    const step = Math.floor((t * 8) / 30);
    x += (hash(step) - 0.5) * 7;
    y += (hash(step + 7) - 0.5) * 7;
    r += (hash(step + 13) - 0.5) * 0.34;
  }
  return (
    <AbsoluteFill style={{ transform: `translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`, transformOrigin: "50% 42%" }}>
      {children}
    </AbsoluteFill>
  );
};

// ---------- Brand ----------
export const Sunburst: React.FC<{ opacity?: number; cy?: number; light?: boolean }> = ({ opacity = 1, cy = 820, light }) => {
  const t = useT();
  const n = 24;
  const R = 1800;
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity }}>
      <defs>
        <radialGradient id="sbmask">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id="sbm">
          <circle cx={W / 2} cy={cy} r={1100} fill="url(#sbmask)" />
        </mask>
      </defs>
      <g mask="url(#sbm)" transform={`rotate(${t * 0.25} ${W / 2} ${cy})`}>
        {Array.from({ length: n }, (_, i) => {
          const a0 = (i / n) * Math.PI * 2;
          const a1 = ((i + 0.5) / n) * Math.PI * 2;
          return (
            <path
              key={i}
              d={`M${W / 2} ${cy} L${W / 2 + R * Math.cos(a0)} ${cy + R * Math.sin(a0)} L${W / 2 + R * Math.cos(a1)} ${cy + R * Math.sin(a1)} Z`}
              fill={light ? "#ffe680" : K.NAVY2}
            />
          );
        })}
      </g>
    </svg>
  );
};

// ---------- Impact kit ----------
export const Halftone: React.FC<{ color?: string; opacity?: number }> = ({ color = K.NAVY3, opacity = 1 }) => (
  <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity }}>
    <defs>
      <pattern id="ht" width="34" height="34" patternUnits="userSpaceOnUse">
        <circle cx="17" cy="17" r="9" fill={color} />
      </pattern>
      <radialGradient id="htg">
        <stop offset="0.15" stopColor="#000" />
        <stop offset="1" stopColor="#fff" />
      </radialGradient>
      <mask id="htm">
        <rect width={W} height={H} fill="url(#htg)" />
      </mask>
    </defs>
    <rect width={W} height={H} fill="url(#ht)" mask="url(#htm)" />
  </svg>
);

export const SpeedLines: React.FC<{ cx?: number; cy?: number; color?: string; seed?: number }> = ({
  cx = W / 2,
  cy = 820,
  color = K.CREAM,
  seed = 1,
}) => {
  const t = useT();
  const step = Math.floor(t / 2);
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.55 }}>
      {Array.from({ length: 46 }, (_, i) => {
        const a = (i / 46) * Math.PI * 2 + hash(i + seed) * 0.1;
        const r0 = 360 + hash(i * 3 + step) * 260;
        const w = 4 + hash(i * 7 + step) * 14;
        return (
          <line
            key={i}
            x1={cx + r0 * Math.cos(a)}
            y1={cy + r0 * Math.sin(a)}
            x2={cx + 2000 * Math.cos(a)}
            y2={cy + 2000 * Math.sin(a)}
            stroke={color}
            strokeWidth={w}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};

/** Ledakan bintang dengan teks bertumpuk 3D. */
export const Starburst: React.FC<{ at: number; text: string; size?: number; fill?: string; color?: string }> = ({
  at,
  text,
  size = 640,
  fill = K.BRAND,
  color = K.RED,
}) => {
  const t = useT();
  const p = sp(t, at, "boing");
  if (t < at) return null;
  const pts = Array.from({ length: 28 }, (_, i) => {
    const r = i % 2 ? 0.62 : 1;
    const a = (i / 28) * Math.PI * 2;
    return `${(Math.cos(a) * r * size) / 2},${(Math.sin(a) * r * size) / 2}`;
  }).join(" ");
  return (
    <div style={{ position: "relative", width: size, height: size, transform: `scale(${p}) rotate(${(1 - p) * 40 - 6}deg)` }}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <polygon points={pts} fill={K.OUT} transform="translate(14 16)" />
        <polygon points={pts} fill={fill} stroke={K.OUT} strokeWidth="8" strokeLinejoin="round" />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: DISPLAY,
          fontSize: size * 0.3,
          color,
          textShadow: extrude(12, K.OUT),
          transform: "rotate(-8deg)",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Kilat putih (1 frame) di sekitar frame `at`. */
export const Flash: React.FC<{ at: number; len?: number }> = ({ at, len = 5 }) => {
  const f = useCurrentFrame();
  if (f < at || f > at + len) return null;
  return <AbsoluteFill style={{ background: "#fff", opacity: 1 - (f - at) / (len + 1), zIndex: 50 }} />;
};

/** Kerucut cahaya (blend screen). */
export const LightCone: React.FC<{ x: number; y: number; w?: number; h?: number; color?: string; opacity?: number }> = ({
  x,
  y,
  w = 760,
  h = 1300,
  color = "#ffe9a8",
  opacity = 0.55,
}) => (
  <svg width={W} height={H} style={{ position: "absolute", inset: 0, mixBlendMode: "screen", opacity }}>
    <defs>
      <linearGradient id={`lc${x}${y}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.9" />
        <stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient>
    </defs>
    <path d={`M${x - 40} ${y} L${x + 40} ${y} L${x + w / 2} ${y + h} L${x - w / 2} ${y + h} Z`} fill={`url(#lc${x}${y})`} />
  </svg>
);

export const Glow: React.FC<{ x: number; y: number; r: number; color?: string; opacity?: number }> = ({
  x,
  y,
  r,
  color = K.BRAND,
  opacity = 0.6,
}) => (
  <div
    style={{
      position: "absolute",
      left: x - r,
      top: y - r,
      width: r * 2,
      height: r * 2,
      borderRadius: "50%",
      background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
      mixBlendMode: "screen",
      opacity,
    }}
  />
);

/** Debu melayang di dalam sorotan. */
export const Motes: React.FC<{ x: number; y: number; w: number; h: number; n?: number }> = ({ x, y, w, h, n = 26 }) => {
  const t = useT();
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const px = x + ((hash(i) * w + t * (0.4 + hash(i + 3))) % w);
        const py = y + ((hash(i + 9) * h - t * (0.6 + hash(i + 5) * 0.8) + h * 10) % h);
        return (
          <div
            key={i}
            style={{ position: "absolute", left: px, top: py, width: 6, height: 6, borderRadius: 3, background: "#fff4c2", opacity: 0.25 + 0.5 * hash(i + 21) }}
          />
        );
      })}
    </>
  );
};

/** Baris teks outline yang bergulir di belakang (marquee). */
export const Marquee: React.FC<{ text: string; y: number; dir?: 1 | -1; color?: string }> = ({ text, y, dir = 1, color = K.CREAM }) => {
  const t = useT();
  return (
    <div
      style={{
        position: "absolute",
        top: y,
        left: -400 + ((dir * t * 3) % 800),
        whiteSpace: "nowrap",
        fontFamily: DISPLAY,
        fontSize: 200,
        color: "transparent",
        WebkitTextStroke: `3px ${color}`,
        opacity: 0.1,
      }}
    >
      {`${text} · `.repeat(8)}
    </div>
  );
};

// ---------- Karakter & objek (fiktif, generik) ----------
export const Developer: React.FC<{ x: number; y: number; typing?: boolean; s?: number }> = ({ x, y, typing = true, s = 1 }) => {
  const t = useT();
  const breathe = Math.sin(t / 14) * 3;
  const hand = typing ? Math.abs(Math.sin(t / 2.2)) * 10 : 0;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* badan */}
      <g transform={`translate(0 ${breathe})`}>
        <Sh fill={K.BLUE} shade="#2f5fc4">
          <path d="M-120 210 Q-120 70 0 70 Q120 70 120 210 Z" />
        </Sh>
        {/* kepala */}
        <Sh fill={K.SKIN} shade={K.SKIN2}>
          <circle cx="0" cy="-10" r="72" />
        </Sh>
        <path d="M-72 -22 Q-70 -95 0 -92 Q70 -95 72 -22 Q40 -60 0 -55 Q-40 -60 -72 -22 Z" fill={K.OUT} />
        <circle cx="-24" cy="0" r="8" fill={K.OUT} />
        <circle cx="26" cy="0" r="8" fill={K.OUT} />
        <path d="M-16 34 Q4 46 22 34" stroke={K.OUT} strokeWidth="6" fill="none" strokeLinecap="round" />
        {/* headphone */}
        <path d="M-80 -10 Q-80 -110 0 -110 Q80 -110 80 -10" stroke={K.RED} strokeWidth="14" fill="none" />
        <Sh fill={K.RED} shade={K.RED2} sw={5} ox={-6} oy={-6}>
          <rect x="-98" y="-30" width="30" height="56" rx="12" />
        </Sh>
        <Sh fill={K.RED} shade={K.RED2} sw={5} ox={-6} oy={-6}>
          <rect x="68" y="-30" width="30" height="56" rx="12" />
        </Sh>
      </g>
      {/* tangan mengetik */}
      <Sh fill={K.SKIN} shade={K.SKIN2} sw={5}>
        <ellipse cx="-70" cy={190 - hand} rx="34" ry="22" />
      </Sh>
      <Sh fill={K.SKIN} shade={K.SKIN2} sw={5}>
        <ellipse cx="70" cy={190 - (10 - hand)} rx="34" ry="22" />
      </Sh>
    </g>
  );
};

export const Robot: React.FC<{ x: number; y: number; color?: string; shade?: string; s?: number; wink?: boolean }> = ({
  x,
  y,
  color = K.CREAM,
  shade = "#d6ccb5",
  s = 1,
  wink,
}) => {
  const t = useT();
  const bob = Math.sin(t / 10 + x) * 5;
  const blink = Math.floor(t + x) % 90 < 4;
  return (
    <g transform={`translate(${x} ${y + bob}) scale(${s})`}>
      <line x1="0" y1="-118" x2="0" y2="-84" stroke={K.OUT} strokeWidth="7" />
      <Sh fill={K.RED} shade={K.RED2} sw={5} ox={-5} oy={-5}>
        <circle cx="0" cy="-126" r="14" />
      </Sh>
      <Sh fill={color} shade={shade}>
        <rect x="-86" y="-86" width="172" height="140" rx="40" />
      </Sh>
      <rect x="-62" y="-56" width="124" height="70" rx="26" fill={K.NAVY} />
      {wink ? (
        <>
          <path d="M-40 -22 Q-28 -32 -16 -22" stroke={K.BRAND} strokeWidth="9" fill="none" strokeLinecap="round" />
          <circle cx="28" cy="-22" r="13" fill={K.BRAND} />
        </>
      ) : blink ? (
        <>
          <rect x="-40" y="-24" width="26" height="6" rx="3" fill={K.BRAND} />
          <rect x="16" y="-24" width="26" height="6" rx="3" fill={K.BRAND} />
        </>
      ) : (
        <>
          <circle cx="-28" cy="-22" r="13" fill={K.BRAND} />
          <circle cx="28" cy="-22" r="13" fill={K.BRAND} />
        </>
      )}
      <Sh fill={color} shade={shade}>
        <path d="M-70 70 Q-70 60 -60 60 H60 Q70 60 70 70 V150 H-70 Z" />
      </Sh>
    </g>
  );
};

export const Lightbulb: React.FC<{ x: number; y: number; on: number }> = ({ x, y, on }) => (
  <g transform={`translate(${x} ${y})`}>
    <line x1="0" y1="-600" x2="0" y2="-110" stroke={K.OUT} strokeWidth="8" />
    <Sh fill="#5b5778" shade="#3d3a58" sw={6}>
      <rect x="-46" y="-120" width="92" height="70" rx="12" />
    </Sh>
    <Sh fill={on > 0.5 ? "#fff2a8" : "#cfd3e6"} shade={on > 0.5 ? K.BRAND : "#a8adc6"}>
      <path d="M-44 -50 Q-110 0 -96 70 Q-80 150 0 160 Q80 150 96 70 Q110 0 44 -50 Z" />
    </Sh>
    <path d="M-24 60 Q0 20 24 60" stroke={on > 0.5 ? K.BRAND2 : "#8c90a8"} strokeWidth="7" fill="none" />
  </g>
);
