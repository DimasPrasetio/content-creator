// Komposisi "Sinema" (npm run sinema): film dipotong persegi di kanvas hitam 9:16, subtitle kata per kata di tengah
// footage (italic tebal, putih + kata kunci kuning / emosi merah), watermark berjarak, efek per shot (zoom, flash, whip),
// penutup: whip blur -> flash putih -> lingkaran memudar ke hitam. Semua data dihitung scripts/sinema.mjs.
import React from "react";
import { AbsoluteFill, Audio, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/Montserrat";

const italic = loadFont("italic", { weights: ["800", "900"], subsets: ["latin"] });
loadFont("normal", { weights: ["400", "500"], subsets: ["latin"] });
const FONT = italic.fontFamily;

export type SinemaWord = { w: string; f: number; k?: number };
export type SinemaCard = { f0: number; f1: number; lines: SinemaWord[][] };
export type SinemaShot = { f0: number; f1: number; zoom?: number[]; fx?: string[] };
export type SinemaProps = {
  name: string;
  totalFrames: number;
  video: string;
  audio?: string | null;
  layout: { background?: string; footage: { y: number; size: number }; subtitle: { centerY: number; maxWidth?: number }; watermark?: { centerY: number } };
  sub: { size: number; weight: number; italic?: boolean; lineHeight?: number; letterSpacing?: number; color: string; key: string; emotion: string; shadow?: string; keyGlow?: string };
  watermark?: { text: string; size: number; weight?: number; letterSpacing: string; opacity: number } | null;
  shots: SinemaShot[];
  cards: SinemaCard[];
  fx: { flashFrames?: number; whipFrames?: number };
  ending?: { f0: number; whip: number; flash: number; fade: number } | null;
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const SinemaMain: React.FC<SinemaProps> = (p) => {
  const frame = useCurrentFrame();
  const L = p.layout;
  const fy = L.footage.y, fs = L.footage.size;
  const shot = p.shots.find((s) => frame >= s.f0 && frame < s.f1) ?? p.shots[p.shots.length - 1];

  // zoom pelan dalam shot (punch-in)
  const z = shot?.zoom ?? [1, 1];
  const prog = shot ? (frame - shot.f0) / Math.max(1, shot.f1 - shot.f0 - 1) : 0;
  let scale = z[0] + (z[1] - z[0]) * Easing.inOut(Easing.quad)(Math.min(1, Math.max(0, prog)));

  // whip: masuk shot dengan geser + blur horizontal
  let blurX = 0, blurY = 0, shiftX = 0;
  const wf = p.fx.whipFrames ?? 8;
  if (shot?.fx?.includes("whip") && frame - shot.f0 < wf) {
    const q = 1 - (frame - shot.f0) / wf;
    blurX = 28 * q * q;
    shiftX = 80 * q * q;
  }
  // flash putih di awal shot
  const ff = p.fx.flashFrames ?? 2;
  const flash = shot?.fx?.includes("flash") ? interpolate(frame - shot.f0, [0, ff, ff + 4], [0.95, 0.8, 0], clamp) : 0;

  // penutup
  let endFlash = 0, endR: number | null = null;
  const E = p.ending;
  if (E && frame >= E.f0) {
    const k = frame - E.f0;
    if (k < E.whip) {
      const q = k / Math.max(1, E.whip);
      blurX += 24 * q;
      blurY += 6 * q;
      scale *= 1 + 0.14 * q;
    } else if (k < E.whip + E.flash) {
      blurX += 24;
      blurY += 6;
      scale *= 1.14;
      endFlash = 1;
    } else {
      const q = Math.min(1, (k - E.whip - E.flash) / Math.max(1, E.fade));
      blurX += 12;
      scale *= 1.14;
      endFlash = Math.max(0, 0.85 - q * 1.6);
      endR = 78 * (1 - Easing.out(Easing.quad)(q));
    }
  }

  const card = p.cards.find((c) => frame >= c.f0 && frame < c.f1);
  const S = p.sub;
  const blurred = blurX + blurY > 0.3;

  return (
    <AbsoluteFill style={{ background: L.background ?? "#000" }}>
      {p.audio ? <Audio src={staticFile(p.audio)} /> : null}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="sinema-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={`${blurX.toFixed(2)} ${blurY.toFixed(2)}`} />
          </filter>
        </defs>
      </svg>
      <div style={{ position: "absolute", left: 0, top: fy, width: 1080, height: fs, overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", transform: `translateX(${shiftX}px) scale(${scale})`, filter: blurred ? "url(#sinema-blur)" : undefined }}>
          <OffthreadVideo src={staticFile(p.video)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        {flash > 0 ? <AbsoluteFill style={{ background: "#fff", opacity: flash }} /> : null}

        {p.watermark ? (
          <div
            style={{
              position: "absolute", left: 0, right: 0, top: fs * (L.watermark?.centerY ?? 0.9), transform: "translateY(-50%)", textAlign: "center",
              fontFamily: FONT, fontStyle: "normal", fontWeight: p.watermark.weight ?? 400, fontSize: p.watermark.size, letterSpacing: p.watermark.letterSpacing,
              paddingLeft: p.watermark.letterSpacing, color: "#fff", opacity: p.watermark.opacity, textShadow: "0 1px 3px rgba(0,0,0,0.6)", whiteSpace: "nowrap",
            }}
          >
            {p.watermark.text}
          </div>
        ) : null}

        {card ? (
          <div
            style={{
              position: "absolute", left: 0, right: 0, top: fs * L.subtitle.centerY, transform: "translateY(-50%)", display: "flex", flexDirection: "column", alignItems: "center",
              fontFamily: FONT, fontWeight: S.weight, fontStyle: S.italic ? "italic" : "normal", fontSize: S.size, lineHeight: S.lineHeight ?? 1.18,
              letterSpacing: S.letterSpacing ?? 0, textTransform: "uppercase",
            }}
          >
            {card.lines.map((ln, i) => (
              <div key={i} style={{ display: "flex", gap: "0.3em", whiteSpace: "nowrap", maxWidth: L.subtitle.maxWidth ?? 800 }}>
                {ln.map((w, j) => {
                  const o = interpolate(frame - w.f, [0, 3], [0, 1], clamp);
                  const col = w.k === 2 ? S.emotion : w.k === 1 ? S.key : S.color;
                  const glow = w.k === 1 ? S.keyGlow : w.k === 2 ? `0 0 10px ${S.emotion}88` : "";
                  return (
                    <span key={j} style={{ display: "inline-block", opacity: o, color: col, transform: `translateY(${((1 - o) * 6).toFixed(1)}px)`, textShadow: [S.shadow, glow].filter(Boolean).join(", ") }}>
                      {w.w}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}

        {endFlash > 0 ? <AbsoluteFill style={{ background: "#fff", opacity: endFlash }} /> : null}
        {endR !== null ? <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ${endR.toFixed(1)}%, #000 ${(endR + 16).toFixed(1)}%)` }} /> : null}
      </div>
    </AbsoluteFill>
  );
};
