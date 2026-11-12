// Komposisi "Pop": scene pop cinematic + transisi grafis + tekstur global, disinkronkan ke narasi.
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Grain, Header, Vignette } from "./fx";
import { H, K, PopCtx, W } from "./lib";
import { POP_SCENES } from "./scenes";
import { LayoutProbe } from "../probe/LayoutProbe";
import type { Brand, Timing } from "../types";

export type PopScene = { key: string; poster?: boolean; light?: boolean; trans?: "slash" | "shutter" | "iris" | "flash" | "cut" | "none" };
export type PopProps = { name: string; timing: Timing; storyboard: { brand?: Brand; scenes: PopScene[] }; brand: Brand; layoutCheck?: boolean };

const ease = (t: number, a: number, b: number) =>
  interpolate(t, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (x) => 1 - Math.pow(1 - x, 3) });

/** Overlay transisi di sekitar frame batas `tc` (scene berganti tepat saat tertutup penuh). */
const Transition: React.FC<{ type: PopScene["trans"]; tc: number }> = ({ type, tc }) => {
  const f = useCurrentFrame();
  if (!type || type === "none" || type === "cut" || f < tc - 10 || f > tc + 12) return null;
  if (type === "flash") {
    return <AbsoluteFill style={{ background: "#fff", opacity: f < tc ? ease(f, tc - 4, tc) : 1 - ease(f, tc, tc + 8), zIndex: 40 }} />;
  }
  if (type === "slash") {
    const D = 8;
    const pos = (lag: number) => -1 + ease(f, tc - D + lag, tc + lag) + ease(f, tc + lag, tc + D + lag);
    const panel = (lag: number, color: string) => (
      <div
        style={{
          position: "absolute",
          top: -600,
          left: -900,
          width: W * 2.6,
          height: H + 1200,
          background: color,
          transform: `translateX(${pos(lag) * W * 2.3}px) rotate(-14deg)`,
          boxShadow: "0 0 0 10px #17132E",
        }}
      />
    );
    return (
      <AbsoluteFill style={{ zIndex: 40, overflow: "hidden" }}>
        {panel(0, K.BRAND)}
        {panel(2, K.NAVY)}
      </AbsoluteFill>
    );
  }
  if (type === "shutter") {
    return (
      <AbsoluteFill style={{ zIndex: 40, overflow: "hidden" }}>
        {Array.from({ length: 6 }, (_, i) => {
          const lag = i * 0.75;
          const y = f < tc ? -1 + ease(f, tc - 8 + lag, tc + lag * 0.2) : ease(f, tc + lag, tc + 8 + lag);
          return (
            <div
              key={i}
              style={{ position: "absolute", top: 0, left: (i * W) / 6, width: W / 6 + 2, height: H, background: i % 2 ? K.BRAND : K.CREAM, transform: `translateY(${y * H}px)`, borderLeft: `6px solid ${K.OUT}` }}
            />
          );
        })}
      </AbsoluteFill>
    );
  }
  // iris: lingkaran menutup ke titik lalu membuka lagi
  const r = f < tc ? (1 - ease(f, tc - 9, tc)) * 1300 : ease(f, tc, tc + 10) * 1300;
  return (
    <AbsoluteFill
      style={{ zIndex: 40, background: `radial-gradient(circle at 50% 46%, transparent ${r}px, ${K.OUT} ${r + 1}px)` }}
    />
  );
};

export const PopMain: React.FC<PopProps> = ({ timing, storyboard, brand, layoutCheck }) => {
  const f = useCurrentFrame();
  const scenes = storyboard.scenes;
  const cur = timing.scenes.findIndex((s) => f >= s.startFrame && f < s.startFrame + s.durationFrames);
  const posterNow = cur >= 0 && !!scenes[cur]?.poster;
  const lightNow = cur >= 0 && (scenes[cur]?.light ?? scenes[cur]?.key === "S6");
  return (
    <AbsoluteFill style={{ background: K.NAVY }}>
      <AbsoluteFill style={{ filter: posterNow ? "contrast(1.12) saturate(1.1)" : undefined }}>
        {timing.scenes.map((sc, i) => {
          const spec = scenes[i] ?? { key: "S1" };
          const Comp = POP_SCENES[spec.key] ?? POP_SCENES.PLACEHOLDER;
          return (
            <Sequence key={i} from={sc.startFrame} durationInFrames={sc.durationFrames}>
              <PopCtx.Provider value={{ duration: sc.durationFrames, words: sc.words ?? [], poster: !!spec.poster, index: i }}>
                <Comp />
              </PopCtx.Provider>
            </Sequence>
          );
        })}
      </AbsoluteFill>
      <Grain strong={posterNow} />
      <Vignette />
      <Header left={brand.left} right={brand.right} dark={!lightNow} />
      {timing.scenes.slice(1).map((sc, i) => (
        <Transition key={i} type={scenes[i + 1]?.trans} tc={sc.startFrame} />
      ))}
      <Audio src={staticFile(timing.audio)} />
      <LayoutProbe enabled={layoutCheck} />
    </AbsoluteFill>
  );
};
