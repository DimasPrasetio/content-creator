export const W = 1080;
export const H = 1920;
export const FPS = 30;

// Area aman Reels/TikTok: bagian bawah (caption, tombol) dan kanan (aksi) tertutup UI.
export const SAFE = { top: 340, bottom: 460, side: 90 };

export const C = {
  black: "#0b0907",
  ink: "#16120d",
  card: "#1b1711",
  gold: "#E9B949",
  goldLight: "#F7D774",
  goldDark: "#C8962B",
  cream: "#F6EEDC",
  cream2: "#E8D5A6",
  red: "#E5383B",
  green: "#2FCB71",
  white: "#FFFFFF",
  text: "#0d0b08",
};

export type Theme = "dark" | "cream";

export const tone = (t: Theme) =>
  t === "dark"
    ? { fg: C.white, sub: "rgba(255,255,255,0.82)", accent: C.gold, muted: "rgba(255,255,255,0.14)" }
    : { fg: C.text, sub: "rgba(13,11,8,0.78)", accent: C.text, muted: "rgba(13,11,8,0.12)" };

export const goldGradient = `linear-gradient(180deg, ${C.goldLight} 0%, ${C.gold} 45%, ${C.goldDark} 100%)`;
