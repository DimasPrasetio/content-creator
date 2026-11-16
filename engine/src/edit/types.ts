// Data komposisi "Edit" (dihasilkan scripts/edit.mjs; semua waktu dalam frame).
import type { Timing } from "../types";

/** [x, y, w, h, mulutX, mulutY, mataX, mataY] dalam piksel 1080x1920 (setelah potong 9:16). */
export type Face = number[];

export type EAt = { at: number; text: string; icon?: string; dim?: boolean; target?: string; side?: string; dy?: number };

export type EObj = {
  type: string;
  sid: string;
  k: number;
  mode: string;
  at: number;
  until: number;
  side?: string;
  slot?: string;
  box?: { x: number; y: number; w: number; h?: number; center?: boolean };
  face?: { x: number; y: number; w: number; h: number; cx: number; cy: number } | null;
  kicker?: string;
  kickerAt?: number;
  title?: string | string[];
  titleAt?: number;
  keyword?: string;
  big?: string;
  text?: string;
  sub?: string;
  subAt?: number;
  size?: number;
  align?: string;
  icon?: string;
  header?: string;
  label?: string;
  button?: string;
  mark?: string[];
  typeUntil?: number;
  followAt?: number;
  maxBubbles?: number;
  src?: string;
  items?: EAt[];
  rows?: { at: number; label: string; value?: string | string[] }[];
  bubbles?: { at: number; side: string; text?: string; file?: string; icon?: string }[];
};

export type EditProps = {
  name: string;
  timing: Timing;
  layoutCheck?: boolean;
  brand?: { left?: string; right?: string };
  edit: {
    video: string;
    totalFrames: number;
    cuts: { f0: number; f1: number; scale: number; ox: number; oy: number }[];
    face: (Face | null)[];
    visuals: { id: string; mode: string; f0: number; f1: number }[];
    objects: EObj[];
    subs: { f0: number; f1: number; words: { w: string; f0: number; f1: number }[] }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    style: { palette: Record<string, string>; type: any; broll: any; aroll: any };
    brand?: { left?: string; right?: string };
  };
};
