import React from "react";
import { BODY, DISPLAY } from "../fonts";
import { C, goldGradient } from "../theme";
import { Pop, useScene } from "./anim";
import { Icon, type IconName } from "./Icon";

/** Stiker miring ala referensi: merah (default) atau emas. */
export const Sticker: React.FC<{ text: string; delay?: number; tilt?: number; gold?: boolean; size?: number }> = ({
  text,
  delay = 0,
  tilt = -3,
  gold,
  size = 84,
}) => (
  <Pop delay={delay} from="scale">
    <div
      style={{
        display: "inline-block",
        transform: `rotate(${tilt}deg)`,
        padding: "10px 34px 14px",
        background: gold ? goldGradient : C.red,
        color: gold ? C.text : C.white,
        fontFamily: DISPLAY,
        fontSize: size,
        lineHeight: 1.05,
        textTransform: "uppercase",
        borderRadius: 8,
        boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  </Pop>
);

export const Small: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({
  children,
  size = 46,
  style,
}) => {
  const { theme } = useScene();
  return (
    <div
      style={{
        fontFamily: BODY,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.3,
        textAlign: "center",
        color: theme === "dark" ? "rgba(255,255,255,0.9)" : "rgba(13,11,8,0.8)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Judul besar Anton; ukuran otomatis menyesuaikan baris terpanjang. */
export const Big: React.FC<{ text: string; color?: string; gold?: boolean; max?: number; width?: number }> = ({
  text,
  color,
  gold,
  max = 190,
  width = 900,
}) => {
  const { theme } = useScene();
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(max, Math.floor(width / (longest * 0.44)));
  const useGold = gold ?? theme === "dark";
  return (
    <div
      style={{
        fontFamily: DISPLAY,
        fontSize: size,
        lineHeight: 1.02,
        textTransform: "uppercase",
        textAlign: "center",
        letterSpacing: 1,
        whiteSpace: "pre-line",
        ...(color
          ? { color }
          : useGold
            ? { backgroundImage: goldGradient, WebkitBackgroundClip: "text", color: "transparent" }
            : { color: C.text }),
      }}
    >
      {text}
    </div>
  );
};

export const IconBadge: React.FC<{ name: IconName; size?: number }> = ({ name, size = 120 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: goldGradient,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: C.text,
      boxShadow: "0 14px 34px rgba(233,185,73,0.35)",
    }}
  >
    <Icon name={name} size={size * 0.52} stroke={2.2} />
  </div>
);

/** Kartu satu baris dengan penanda centang hijau / silang merah. */
export const CheckRow: React.FC<{ text: string; ok?: boolean }> = ({ text, ok = true }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 28,
      padding: "26px 34px",
      borderRadius: 24,
      background: "linear-gradient(180deg,#201b14,#14110c)",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
      width: "100%",
    }}
  >
    <div
      style={{
        width: 70,
        height: 70,
        borderRadius: 18,
        background: ok ? C.green : C.red,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: C.white,
        flex: "none",
      }}
    >
      <Icon name={ok ? "check" : "x"} size={44} stroke={3.2} />
    </div>
    <div
      style={{
        fontFamily: DISPLAY,
        fontSize: 66,
        lineHeight: 1.05,
        color: C.white,
        textTransform: "uppercase",
        letterSpacing: 0.5,
      }}
    >
      {text}
    </div>
  </div>
);
