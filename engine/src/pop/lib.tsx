// Primitif gaya "pop cinematic": token warna, waktu ter-posterize, spring, shading, tipografi grafis.
import React, { createContext, useContext, useId } from "react";
import { interpolate, spring, useCurrentFrame } from "remotion";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { findCue, type Word } from "../components/anim";

export const DISPLAY = loadAnton("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
export const UI = loadInter("normal", { weights: ["600", "800", "900"], subsets: ["latin"] }).fontFamily;

export const K = {
  NAVY: "#141235",
  NAVY2: "#23205A",
  NAVY3: "#34307A",
  OUT: "#17132E",
  CREAM: "#F7EEDB",
  BRAND: "#FFD21F",
  BRAND2: "#F2A516",
  RED: "#FF3B30",
  RED2: "#B81F2A",
  SKIN: "#EDB08A",
  SKIN2: "#C98463",
  GREEN: "#2ECC71",
  BLUE: "#4C8DFF",
  PURPLE: "#7B5CFF",
};

export const FPS = 30;
export const W = 1080;
export const H = 1920;

/** Hash ber-seed (pengganti Math.random agar setiap frame deterministik). */
export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// ---- Konteks scene: durasi, kata narasi, mode posterize ----
export const PopCtx = createContext<{ duration: number; words: Word[]; poster: boolean; index: number }>({
  duration: 90,
  words: [],
  poster: false,
  index: 0,
});
export const usePop = () => useContext(PopCtx);

/** Frame scene; di scene "poster" waktu dipatah menjadi 8 fps (stepped time). */
export const useT = () => {
  const f = useCurrentFrame();
  const { poster } = usePop();
  return poster ? Math.floor((f * 8) / FPS + 1e-6) * (FPS / 8) : f;
};

/** Frame (relatif scene) saat kata/frasa diucapkan, sedikit lebih awal; fallback bila tidak ditemukan. */
export const useCue = () => {
  const { words } = usePop();
  return (q: string, fallback: number, lead = 3) => {
    const f = findCue(words, q);
    return f === null ? fallback : Math.max(0, f - lead);
  };
};

export const SPR = {
  text: { stiffness: 170, damping: 27, mass: 1 },
  ui: { stiffness: 400, damping: 22, mass: 1 },
  heavy: { stiffness: 90, damping: 15, mass: 1 },
  boing: { stiffness: 300, damping: 11, mass: 1 },
};
export const sp = (t: number, start: number, cfg: keyof typeof SPR = "text") =>
  t < start ? 0 : spring({ frame: t - start, fps: FPS, config: SPR[cfg] });

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const lin = (t: number, a: number, b: number) => clamp01((t - a) / Math.max(1, b - a));

/** Getaran kamera yang meluruh dari frame `t0` (fungsi murni waktu). */
export const shake = (t: number, t0: number, amp = 18, decay = 0.12) => {
  if (t < t0) return { x: 0, y: 0, r: 0 };
  const d = t - t0;
  const e = amp * Math.exp(-decay * d);
  return { x: e * Math.sin(d * 2.1), y: e * Math.cos(d * 2.7) * 0.7, r: (e / amp) * 1.2 * Math.sin(d * 1.7) };
};

// ---- Shading core-shadow (cahaya dari kiri atas) ----
export const Sh: React.FC<{
  fill: string;
  shade: string;
  ox?: number;
  oy?: number;
  sw?: number;
  stroke?: string;
  children: React.ReactElement;
}> = ({ fill, shade, ox = -16, oy = -14, sw = 6, stroke = K.OUT, children }) => {
  const id = useId().replace(/:/g, "");
  return (
    <>
      <clipPath id={id}>{children}</clipPath>
      <g clipPath={`url(#${id})`}>
        <g fill={shade}>{children}</g>
        <g fill={fill} transform={`translate(${ox} ${oy})`}>
          {children}
        </g>
      </g>
      <g fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
        {children}
      </g>
    </>
  );
};

// ---- Tipografi grafis ----
export const extrude = (n = 12, c = K.RED2) =>
  Array.from({ length: n }, (_, i) => `${i + 1}px ${i + 1}px 0 ${c}`).join(",") + `, ${n + 8}px ${n + 18}px 30px rgba(0,0,0,.45)`;

/** Ukuran font Anton agar baris terpanjang muat di lebar tertentu. */
export const fit = (text: string, width = 900, max = 230) => {
  const longest = Math.max(...text.split("\n").map((l) => l.length));
  return Math.min(max, Math.floor(width / (longest * 0.5)));
};

/** Baris naik dari balik masker (tanpa overshoot). Tersembunyi penuh sebelum mulai. */
export const MaskRise: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  at,
  children,
  style,
}) => {
  const t = useT();
  const p = sp(t, at, "text");
  return (
    <div style={{ overflow: "hidden", padding: "0 30px 34px", margin: "0 -30px -34px", opacity: t < at ? 0 : 1, ...style }}>
      <div style={{ transform: `translateY(${(1 - p) * 105}%)` }}>{children}</div>
    </div>
  );
};

export const Headline: React.FC<{
  text: string;
  at: number;
  color?: string;
  ex?: string;
  size?: number;
  width?: number;
  stagger?: number;
  keepCase?: boolean;
}> = ({ text, at, color = K.BRAND, ex = K.RED2, size, width = 900, stagger = 5, keepCase }) => {
  const fs = size ?? fit(text, width);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {text.split("\n").map((line, i) => (
        <MaskRise key={i} at={at + i * stagger}>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: fs,
              lineHeight: 0.9,
              color,
              textTransform: keepCase ? "none" : "uppercase",
              textShadow: extrude(Math.round(fs / 14), ex),
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {line}
          </div>
        </MaskRise>
      ))}
    </div>
  );
};

/** Label kecil berspasi lebar dengan bar di depan. */
export const Kicker: React.FC<{ text: string; at: number; color?: string }> = ({ text, at, color = K.BRAND }) => {
  const t = useT();
  const p = sp(t, at, "text");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        opacity: t < at ? 0 : p,
        transform: `translateX(${(1 - p) * -40}px)`,
        fontFamily: UI,
        fontWeight: 900,
        fontSize: 34,
        letterSpacing: 8,
        color,
        textTransform: "uppercase",
      }}
    >
      <div style={{ width: 54 * p, height: 8, background: color, borderRadius: 4 }} />
      {text}
    </div>
  );
};

/** Pita lakban zig-zag untuk kata pukulan. */
export const Tape: React.FC<{ text: string; at: number; bg?: string; fg?: string; rot?: number; size?: number }> = ({
  text,
  at,
  bg = K.RED,
  fg = K.CREAM,
  rot = -4,
  size = 70,
}) => {
  const t = useT();
  const p = sp(t, at, "ui");
  const zig = Array.from({ length: 9 }, (_, i) => `${i % 2 ? 1.6 : 0}% ${(i / 8) * 100}%`).join(",");
  const zag = Array.from({ length: 9 }, (_, i) => `${i % 2 ? 98.4 : 100}% ${100 - (i / 8) * 100}%`).join(",");
  return (
    <div style={{ transform: `rotate(${rot}deg)`, opacity: t < at ? 0 : 1 }}>
      <div
        style={{
          transform: `scaleX(${p})`,
          transformOrigin: "left center",
          background: bg,
          color: fg,
          fontFamily: DISPLAY,
          fontSize: size,
          lineHeight: 1.1,
          padding: "8px 46px 12px",
          textTransform: "uppercase",
          clipPath: `polygon(${zig},${zag})`,
          whiteSpace: "nowrap",
          filter: "drop-shadow(8px 10px 0 rgba(23,19,46,.55))",
        }}
      >
        {text}
      </div>
    </div>
  );
};

/** Stempel karet: border ganda merah, miring, menghantam dari skala besar. */
export const Stamp: React.FC<{ text: string; at: number; size?: number; color?: string; rot?: number; keepCase?: boolean }> = ({
  text,
  at,
  size = 64,
  color = K.RED,
  rot = -11,
  keepCase,
}) => {
  const t = useT();
  const p = sp(t, at, "ui");
  const s = shake(t, at + 4, 10, 0.25);
  if (t < at) return null;
  return (
    <div
      style={{
        transform: `translate(${s.x}px,${s.y}px) rotate(${rot}deg) scale(${2.4 - 1.4 * p})`,
        opacity: clamp01(p * 2),
        border: `7px solid ${color}`,
        outline: `3px solid ${color}`,
        outlineOffset: 7,
        color,
        fontFamily: DISPLAY,
        fontSize: size,
        lineHeight: 1,
        padding: "10px 30px 14px",
        textTransform: keepCase ? "none" : "uppercase",
        borderRadius: 10,
        whiteSpace: "nowrap",
        mixBlendMode: "normal",
      }}
    >
      {text}
    </div>
  );
};

/** Balon ucapan krem bergaris tegas dengan bayangan keras merah. */
export const Bubble: React.FC<{ at: number; children: React.ReactNode; tail?: "left" | "right" | "bottom" }> = ({
  at,
  children,
  tail = "bottom",
}) => {
  const t = useT();
  const p = sp(t, at, "boing");
  if (t < at) return null;
  return (
    <div style={{ position: "relative", transform: `scale(${p})`, transformOrigin: tail === "left" ? "0% 100%" : "50% 100%" }}>
      <div
        style={{
          background: K.CREAM,
          border: `6px solid ${K.OUT}`,
          borderRadius: 34,
          boxShadow: `12px 12px 0 ${K.RED}`,
          padding: "26px 38px",
          fontFamily: UI,
          fontWeight: 900,
          fontSize: 44,
          color: K.OUT,
          lineHeight: 1.15,
        }}
      >
        {children}
      </div>
      <svg
        width="70"
        height="56"
        style={{ position: "absolute", bottom: -50, left: tail === "left" ? 40 : tail === "right" ? undefined : "45%", right: tail === "right" ? 50 : undefined }}
      >
        <path d="M6 0 L64 0 L18 52 Z" fill={K.CREAM} stroke={K.OUT} strokeWidth="6" strokeLinejoin="round" />
        <rect x="6" y="-8" width="56" height="10" fill={K.CREAM} />
      </svg>
    </div>
  );
};

/** Angka berpola outline (isi transparan). */
export const Outline: React.FC<{ n: string; size?: number; color?: string }> = ({ n, size = 120, color = K.BRAND }) => (
  <div style={{ fontFamily: DISPLAY, fontSize: size, lineHeight: 0.9, color: "transparent", WebkitTextStroke: `4px ${color}` }}>{n}</div>
);

export const fade = (t: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(t, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
