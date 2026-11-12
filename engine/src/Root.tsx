import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { PopMain, type PopProps } from "./pop/PopMain";
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
  </>
);
