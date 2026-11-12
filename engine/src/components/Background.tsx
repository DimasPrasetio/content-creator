import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, type Theme } from "../theme";

const grid = (c: string) =>
  `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`;

export const Background: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 40;
  if (theme === "dark") {
    return (
      <AbsoluteFill style={{ background: C.black }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(900px 700px at ${20 + drift / 8}% 8%, rgba(233,185,73,0.22), transparent 70%),
                         radial-gradient(1000px 800px at 85% 96%, rgba(233,185,73,0.20), transparent 70%)`,
          }}
        />
        <AbsoluteFill style={{ backgroundImage: grid("rgba(255,255,255,0.045)"), backgroundSize: "90px 90px" }} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: C.cream }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 900px at ${15 + drift / 10}% 100%, rgba(233,185,73,0.55), transparent 70%),
                       radial-gradient(900px 700px at 90% 0%, rgba(232,213,166,0.7), transparent 70%)`,
        }}
      />
      <AbsoluteFill style={{ backgroundImage: grid("rgba(13,11,8,0.06)"), backgroundSize: "90px 90px" }} />
    </AbsoluteFill>
  );
};
