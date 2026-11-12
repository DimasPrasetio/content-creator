import React, { createContext, useContext } from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Theme } from "../theme";

export type Word = { w: string; f: number; e: number; guessed?: boolean };

export const SceneCtx = createContext<{ theme: Theme; duration: number; words: Word[] }>({
  theme: "dark",
  duration: 90,
  words: [],
});
export const useScene = () => useContext(SceneCtx);

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const tokensOf = (s: string) => s.split(/[\s\-–\n]+/).map(norm).filter(Boolean);
const match = (a: string, b: string) =>
  a === b || (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a)));

/** Frame (relatif scene) saat frasa `q` mulai diucapkan; null bila tidak ditemukan di narasi. */
export const findCue = (words: Word[], q: string, from = 0): number | null => {
  const qt = tokensOf(q);
  if (!qt.length) return null;
  const wt = words.map((w) => tokensOf(w.w)[0] ?? "");
  // utamakan cocok dua token berurutan, lalu satu token
  for (const need of qt.length > 1 ? [2, 1] : [1]) {
    for (let i = 0; i < words.length; i++) {
      if (words[i].f < from) continue;
      let ok = true;
      for (let k = 0; k < need; k++) if (!wt[i + k] || !match(wt[i + k], qt[k])) ok = false;
      if (ok) return words[i].f;
    }
  }
  return null;
};

/** Delay elemen: muncul sedikit sebelum kata cue diucapkan; fallback bila cue tidak ada di narasi. */
export const useCue = (q: string | undefined, fallback: number, lead = 3) => {
  const { words } = useScene();
  if (!q) return fallback;
  const f = findCue(words, q);
  return f === null ? fallback : Math.max(0, f - lead);
};

/** Progres spring 0..1 yang dimulai setelah `delay` frame. */
export const useIn = (delay = 0, damping = 15, stiffness = 140) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, stiffness, mass: 0.8 } });
};

/** Frame kemunculan elemen ke-i dari n, disebar sepanjang porsi narasi. */
export const useStagger = (i: number, n: number, start = 6, spread = 0.6) => {
  const { duration } = useScene();
  const span = Math.max(duration * spread, 24);
  return Math.round(start + (n <= 1 ? 0 : (i / (n - 1)) * span));
};

export const Pop: React.FC<{ delay?: number; from?: "up" | "scale" | "left"; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  from = "up",
  children,
  style,
}) => {
  const p = useIn(delay);
  const tf =
    from === "scale"
      ? `scale(${0.6 + 0.4 * p})`
      : from === "left"
        ? `translateX(${(1 - p) * -80}px)`
        : `translateY(${(1 - p) * 60}px)`;
  // opacity dari `style` (mis. efek meredup) dikalikan, bukan menimpa opacity animasi masuk
  const extra = typeof style?.opacity === "number" ? style.opacity : 1;
  return <div style={{ ...style, opacity: Math.max(0, Math.min(1, p * 1.4)) * extra, transform: tf }}>{children}</div>;
};
