import React from "react";
import { Img, staticFile } from "remotion";
import { BODY, DISPLAY } from "../fonts";
import { C, goldGradient, tone, type Theme } from "../theme";
import type { Brand } from "../types";

const Mark: React.FC<{ text?: string; logo?: string; theme: Theme; gold?: boolean; align: "left" | "right" }> = ({
  text,
  logo,
  theme,
  gold,
  align,
}) => {
  if (logo) return <Img src={staticFile(logo)} style={{ height: 84, maxWidth: 380, objectFit: "contain" }} />;
  if (!text) return <div />;
  const t = tone(theme);
  return (
    <div
      style={{
        fontFamily: gold ? DISPLAY : BODY,
        fontWeight: 800,
        fontSize: gold ? 54 : 34,
        lineHeight: 1.02,
        textTransform: "uppercase",
        textAlign: align,
        maxWidth: 380,
        letterSpacing: gold ? 0 : 0.5,
        ...(gold && theme === "dark"
          ? { backgroundImage: goldGradient, WebkitBackgroundClip: "text", color: "transparent" }
          : { color: gold ? C.goldDark : t.fg }),
      }}
    >
      {text}
    </div>
  );
};

/** Dua penanda brand di pojok atas (di dalam area aman). */
export const Header: React.FC<{ theme: Theme; brand: Brand }> = ({ theme, brand }) => (
  <div
    data-probe="brand"
    style={{
      position: "absolute",
      top: 130,
      left: 90,
      right: 90,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
    }}
  >
    <Mark text={brand.left} logo={brand.logoLeft} theme={theme} align="left" />
    <Mark text={brand.right} logo={brand.logoRight} theme={theme} gold align="right" />
  </div>
);
