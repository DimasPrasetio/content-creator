// Contoh scene Pop generik (dipakai selftest dan sebagai titik awal). Salin file ini menjadi src/pop/custom/<slug>.tsx
// untuk video baru; setiap scene dipicu kata narasi lewat useCue(kata, cadangan-frame).
import React from "react";
import { AbsoluteFill } from "remotion";
import { BgCream, BgNavy, Camera, Flash, Halftone, Sunburst } from "../fx";
import { Headline, K, Kicker, Stamp, Tape, fade, useCue, useT } from "../lib";

const Abs: React.FC<{ top: number; children: React.ReactNode }> = ({ top, children }) => (
  <div style={{ position: "absolute", top, left: 90, right: 90, display: "flex", flexDirection: "column", alignItems: "center" }}>{children}</div>
);

export const EX1: React.FC = () => {
  const c = useCue();
  const jelas = c("jelas", 60);
  return (
    <AbsoluteFill>
      <Camera punches={[{ at: jelas, amt: 0.06 }]}>
        <BgNavy />
        <Halftone opacity={0.5} />
        <Abs top={300}>
          <Kicker text="Contoh scene" at={0} />
        </Abs>
        <Abs top={380}>
          <Headline text={"VIDEO PENDEK\nITU GAMPANG"} at={c("video", 6)} color={K.CREAM} width={880} />
        </Abs>
        <Abs top={760}>
          <Stamp text="Kalau alurnya jelas" at={jelas} size={80} />
        </Abs>
      </Camera>
      <Flash at={jelas} len={2} />
    </AbsoluteFill>
  );
};

export const EX2: React.FC = () => {
  const c = useCue();
  return (
    <AbsoluteFill>
      <Camera push={0.01}>
        <BgCream />
        <Abs top={320}>
          <Headline text={"NASKAH\nSUARA\nVISUAL"} at={c("naskah", 10)} color={K.OUT} ex={K.BRAND2} size={170} stagger={6} />
        </Abs>
        <Abs top={1020}>
          <Tape text="Semua sinkron" at={c("sinkron", 70)} bg={K.OUT} fg={K.BRAND} size={78} />
        </Abs>
      </Camera>
    </AbsoluteFill>
  );
};

export const EX3: React.FC = () => {
  const t = useT();
  const c = useCue();
  return (
    <AbsoluteFill>
      <Camera>
        <BgNavy glow="#3b2f8f" gx={50} gy={40} />
        <Sunburst opacity={fade(t, 0, 10)} cy={720} />
        <Abs top={420}>
          <Headline text={"DICEK\nOTOMATIS"} at={c("dicek", 6)} size={200} />
        </Abs>
        <Abs top={900}>
          <Tape text="Sebelum diunggah!" at={c("diunggah", 40)} size={84} />
        </Abs>
      </Camera>
    </AbsoluteFill>
  );
};

export const SCENES: Record<string, React.FC> = { EX1, EX2, EX3 };
