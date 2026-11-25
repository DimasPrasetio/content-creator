import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { PopMain, type PopProps } from "./pop/PopMain";
import { EditMain } from "./edit/EditMain";
import type { EditProps } from "./edit/types";
import { SinemaMain, type SinemaProps } from "./sinema/SinemaMain";
import { FPS, H, W } from "./theme";
import type { VideoProps } from "./types";

const demo: VideoProps = {
  name: "demo",
  brand: { left: "NAMA BRAND", right: "PROGRAM" },
  storyboard: { scenes: [{ type: "headline", title: "Demo", sticker: "Studio" }] },
  timing: {
    fps: FPS,
    totalFrames: 90,
    audio: "audio/none.wav",
    scenes: [{ index: 0, text: "Demo", startFrame: 0, durationFrames: 90 }],
  },
};

const editDemo: EditProps = {
  name: "demo",
  timing: demo.timing,
  edit: { video: "media/edit/demo.mp4", totalFrames: 90, cuts: [{ f0: 0, f1: 90, scale: 1, ox: 540, oy: 760 }], face: [], visuals: [], objects: [], subs: [], style: { palette: {}, type: {}, broll: {}, aroll: {} } },
};

const sinemaDemo: SinemaProps = {
  name: "demo", totalFrames: 90, video: "media/sinema/demo.mp4", audio: null,
  layout: { footage: { y: 267, size: 1080 }, subtitle: { centerY: 0.465 }, watermark: { centerY: 0.905 } },
  sub: { size: 40, weight: 900, italic: true, color: "#F8F5F0", key: "#F5E14A", emotion: "#E8423A" },
  watermark: null, shots: [{ f0: 0, f1: 90 }], cards: [], fx: {}, ending: null,
};

const popDemo: PopProps = { name: "demo", brand: {}, storyboard: { scenes: [{ key: "S1" }] }, timing: demo.timing };

export const Root: React.FC = () => (
  <>
  <Composition
    id="Video"
    component={Main}
    width={W}
    height={H}
    fps={FPS}
    durationInFrames={90}
    defaultProps={demo}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, props.timing.totalFrames) })}
  />
  <Composition
    id="Pop"
    component={PopMain}
    width={W}
    height={H}
    fps={FPS}
    durationInFrames={90}
    defaultProps={popDemo}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, props.timing.totalFrames) })}
  />
  <Composition
    id="Edit"
    component={EditMain}
    width={W}
    height={H}
    fps={FPS}
    durationInFrames={90}
    defaultProps={editDemo}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, props.timing.totalFrames), width: props.edit.canvas?.w ?? W, height: props.edit.canvas?.h ?? H })}
  />
  <Composition
    id="Sinema"
    component={SinemaMain}
    width={W}
    height={H}
    fps={FPS}
    durationInFrames={90}
    defaultProps={sinemaDemo}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, props.totalFrames) })}
  />
  </>
);
