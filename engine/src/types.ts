import type { Theme } from "./theme";
import type { IconName } from "./components/Icon";

/** `cue`: kata/frasa di narasi yang memicu munculnya elemen (default: teks elemen itu sendiri). */
export type Item = { text: string; ok?: boolean; cue?: string };

export type SceneBase = { theme?: Theme };

export type HeadlineScene = SceneBase & {
  type: "headline";
  pre?: string;
  title: string;
  post?: string;
  sticker?: string;
  icon?: IconName;
  badge?: string;
  cue?: string;
  preCue?: string;
  stickerCue?: string;
};
export type KineticScene = SceneBase & { type: "kinetic"; text?: string; highlight?: string[] };
export type ChecklistScene = SceneBase & {
  type: "checklist";
  intro?: string;
  items: Item[];
  caption?: string;
  sticker?: string;
  captionCue?: string;
  stickerCue?: string;
};
export type CompareScene = SceneBase & {
  type: "compare";
  intro?: string;
  bars: { label: string; value: number; color?: "gold" | "red"; cue?: string }[];
  sticker?: string;
};
export type CardsScene = SceneBase & {
  type: "cards";
  a: { icon: IconName; title: string; sub?: string; cue?: string };
  b: { icon: IconName; title: string; sub?: string; cue?: string };
  stickerCue?: string;
  items?: Item[];
  sticker?: string;
};
export type HierarchyScene = SceneBase & {
  type: "hierarchy";
  pre?: string;
  title: string;
  post?: string;
  levels: number[];
  bad?: boolean;
  sticker?: string;
  cue?: string;
  treeCue?: string;
};
export type StatScene = SceneBase & {
  type: "stat";
  pre?: string;
  value: number;
  suffix?: string;
  label?: string;
  sticker?: string;
  down?: boolean;
  cue?: string;
};
export type CtaScene = SceneBase & {
  type: "cta";
  title: string;
  line?: string;
  handle?: string;
  image?: string;
  cue?: string;
};

export type ToolsScene = SceneBase & {
  type: "tools";
  intro?: string;
  items: { name: string; sub?: string; highlight?: boolean; cue?: string }[];
  sticker?: string;
};
export type Camera = { cx: number; cy: number; zoom: number };
export type ImageScene = SceneBase & {
  type: "image";
  src: string;
  imgW: number;
  imgH: number;
  pre?: string;
  caption?: string;
  from: Camera;
  to?: Camera;
  box?: { x: number; y: number; w: number; h: number };
  sticker?: string;
  /** frasa yang memulai gerak kamera / caption / stiker */
  cue?: string;
  captionCue?: string;
  stickerCue?: string;
};

export type SceneSpec =
  | HeadlineScene
  | KineticScene
  | ChecklistScene
  | CompareScene
  | CardsScene
  | HierarchyScene
  | StatScene
  | CtaScene
  | ToolsScene
  | ImageScene;

export type Timing = {
  fps: number;
  totalFrames: number;
  audio: string;
  scenes: {
    index: number;
    text: string;
    startFrame: number;
    durationFrames: number;
    words?: { w: string; f: number; e: number; guessed?: boolean }[];
  }[];
};

export type Brand = {
  left?: string;
  right?: string;
  logoLeft?: string;
  logoRight?: string;
};

export type VideoProps = {
  name: string;
  timing: Timing;
  storyboard: { brand?: Brand; scenes: SceneSpec[] };
  brand: Brand;
  layoutCheck?: boolean;
};
