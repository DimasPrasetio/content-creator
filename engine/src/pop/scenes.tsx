// Registri scene komposisi Pop. Scene khusus per video/brand ditulis di src/pop/custom/<slug>.tsx dan dimuat otomatis:
// setiap file di sana mengekspor `SCENES: Record<string, React.FC>` (key = "key" di storyboard, mis. "A1").
// Folder custom/ milik workspace: tidak ditimpa saat plugin diperbarui (lihat bin/setup.sh).
import React from "react";
import { AbsoluteFill } from "remotion";
import { BgNavy } from "./fx";
import { Headline, K, Kicker, usePop } from "./lib";

declare const require: { context: (dir: string, deep: boolean, re: RegExp) => { keys(): string[]; (k: string): { SCENES?: Record<string, React.FC> } } };

/** Scene cadangan bila key storyboard belum dibuat: narasi scene sebagai judul. */
export const Placeholder: React.FC = () => {
  const { words } = usePop();
  const text = words.map((w) => w.w).join(" ");
  return (
    <AbsoluteFill>
      <BgNavy />
      <div style={{ position: "absolute", top: 300, left: 90, right: 90, display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        <Kicker text="Scene belum dibuat" at={0} color={K.RED} />
        <Headline text={text.slice(0, 60)} at={0} color={K.CREAM} width={900} keepCase />
      </div>
    </AbsoluteFill>
  );
};

export const POP_SCENES: Record<string, React.FC> = { PLACEHOLDER: Placeholder };
const ctx = require.context("./custom", false, /\.tsx$/);
for (const k of ctx.keys()) Object.assign(POP_SCENES, ctx(k).SCENES ?? {});
