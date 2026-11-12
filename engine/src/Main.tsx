import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { SceneCtx, type Word } from "./components/anim";
import { Background } from "./components/Background";
import { Header } from "./components/Header";
import { Cards, Checklist, Compare, Cta, Headline, Hierarchy, Kinetic, Stat } from "./scenes/Scenes";
import { ImageZoom, Tools } from "./scenes/More";
import { SAFE, type Theme } from "./theme";
import type { SceneSpec, VideoProps } from "./types";
import { LayoutProbe } from "./probe/LayoutProbe";

const renderScene = (s: SceneSpec, text: string) => {
  switch (s.type) {
    case "headline":
      return <Headline s={s} />;
    case "checklist":
      return <Checklist s={s} />;
    case "compare":
      return <Compare s={s} />;
    case "cards":
      return <Cards s={s} />;
    case "hierarchy":
      return <Hierarchy s={s} />;
    case "stat":
      return <Stat s={s} />;
    case "cta":
      return <Cta s={s} />;
    case "tools":
      return <Tools s={s} />;
    case "image":
      return <ImageZoom s={s} />;
    default:
      return <Kinetic s={s} text={text} />;
  }
};

const Frame: React.FC<{
  theme: Theme;
  duration: number;
  words: Word[];
  brand: VideoProps["brand"];
  children: React.ReactNode;
}> = ({ theme, duration, words, brand, children }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: "clamp" });
  return (
    <SceneCtx.Provider value={{ theme, duration, words }}>
      <AbsoluteFill style={{ opacity: o }}>
        <Background theme={theme} />
        <Header theme={theme} brand={brand} />
        <div
          style={{
            position: "absolute",
            left: SAFE.side,
            right: SAFE.side,
            top: SAFE.top,
            bottom: SAFE.bottom,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
    </SceneCtx.Provider>
  );
};

export const Main: React.FC<VideoProps> = ({ timing, storyboard, brand, layoutCheck }) => {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {timing.scenes.map((sc, i) => {
        const spec: SceneSpec = storyboard.scenes[i] ?? { type: "kinetic" };
        const theme: Theme = spec.theme ?? (i % 2 === 0 ? "dark" : "cream");
        return (
          <Sequence key={i} from={sc.startFrame} durationInFrames={sc.durationFrames}>
            <Frame theme={theme} duration={sc.durationFrames} words={sc.words ?? []} brand={brand}>
              {renderScene(spec, sc.text)}
            </Frame>
          </Sequence>
        );
      })}
      <Audio src={staticFile(timing.audio)} />
      <LayoutProbe enabled={layoutCheck} />
    </AbsoluteFill>
  );
};
