import React from "react";
import { Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Pop, useCue, useScene, useStagger } from "../components/anim";
import { Big, Small, Sticker } from "../components/bits";
import { BODY, DISPLAY } from "../fonts";
import { C, goldGradient } from "../theme";
import type { ImageScene, ToolsScene } from "../types";

const ToolRow: React.FC<{ item: ToolsScene["items"][number]; delay: number; dimFrom: number | null }> = ({
  item,
  delay,
  dimFrom,
}) => {
  const frame = useCurrentFrame();
  const hi = !!item.highlight;
  const dim = !hi && dimFrom !== null ? interpolate(frame, [dimFrom, dimFrom + 10], [1, 0.4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  return (
    <Pop delay={delay} from={hi ? "scale" : "left"} style={{ width: "100%", opacity: dim }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: hi ? "34px 40px" : "24px 36px",
          borderRadius: 24,
          background: hi ? goldGradient : "linear-gradient(180deg,#201b14,#14110c)",
          border: hi ? "none" : "1px solid rgba(255,255,255,0.08)",
          boxShadow: hi ? "0 0 60px rgba(233,185,73,0.55), 0 20px 40px rgba(0,0,0,0.4)" : "0 18px 40px rgba(0,0,0,0.35)",
          transform: hi ? "scale(1.04)" : undefined,
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontSize: hi ? 100 : 64, lineHeight: 1, color: hi ? C.text : C.white, textTransform: "uppercase" }}>
          {item.name}
        </div>
        {item.sub ? (
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 30, color: hi ? C.text : "rgba(255,255,255,0.6)", textAlign: "right", maxWidth: 300 }}>
            {item.sub}
          </div>
        ) : null}
      </div>
    </Pop>
  );
};

/** Daftar pilihan; item ber-`highlight` muncul terakhir sebagai kartu emas dan yang lain meredup. */
export const Tools: React.FC<{ s: ToolsScene }> = ({ s }) => {
  const n = s.items.length;
  const delays = s.items.map((it, i) => useCue(it.cue ?? it.name, useStagger(i, n, 6, 0.55)));
  const hiIndex = s.items.findIndex((it) => it.highlight);
  const dimFrom = hiIndex >= 0 ? delays[hiIndex] : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {s.intro ? (
        <Pop>
          <Small>{s.intro}</Small>
        </Pop>
      ) : null}
      {s.items.map((it, i) => (
        <ToolRow key={i} item={it} delay={delays[i]} dimFrom={dimFrom} />
      ))}
      {s.sticker ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
          <Sticker text={s.sticker} delay={(dimFrom ?? delays[n - 1]) + 10} />
        </div>
      ) : null}
    </div>
  );
};

/** Gambar dengan gerak kamera (zoom/pan) dari `from` ke `to`, koordinat dalam piksel gambar asli. */
export const ImageZoom: React.FC<{ s: ImageScene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const { duration } = useScene();
  const start = useCue(s.cue, 6);
  const captionAt = useCue(s.captionCue ?? s.caption, start + 10);
  const stickerAt = useCue(s.stickerCue ?? s.sticker, Math.round(duration * 0.6));
  const vw = 900;
  const vh = Math.round((vw * s.imgH) / s.imgW);
  const k = vw / s.imgW;
  const to = s.to ?? s.from;
  const p = interpolate(frame, [start, Math.max(start + 20, Math.min(start + 75, duration - 10))], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const zoom = s.from.zoom * Math.pow(to.zoom / s.from.zoom, p);
  const cx = s.from.cx + (to.cx - s.from.cx) * p;
  const cy = s.from.cy + (to.cy - s.from.cy) * p;
  const pulse = 0.55 + 0.45 * Math.abs(Math.sin(frame / 7));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34, width: "100%" }}>
      {s.pre ? (
        <Pop>
          <Small>{s.pre}</Small>
        </Pop>
      ) : null}
      <Pop from="scale">
        <div
          style={{
            width: vw,
            height: vh,
            borderRadius: 28,
            overflow: "hidden",
            position: "relative",
            background: "#f7f8fb",
            border: `3px solid ${C.goldDark}`,
            boxShadow: "0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(233,185,73,0.25)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: vw,
              height: vh,
              transformOrigin: "0 0",
              transform: `translate(${vw / 2 - cx * k * zoom}px, ${vh / 2 - cy * k * zoom}px) scale(${zoom})`,
            }}
          >
            <Img src={staticFile(s.src)} style={{ width: vw, height: vh, display: "block" }} />
            {s.box ? (
              <div
                style={{
                  position: "absolute",
                  left: s.box.x * k,
                  top: s.box.y * k,
                  width: s.box.w * k,
                  height: s.box.h * k,
                  borderRadius: 8 / zoom + 4,
                  border: `${6 / zoom}px solid ${C.red}`,
                  boxShadow: `0 0 ${30 / zoom}px rgba(229,56,59,${pulse})`,
                  opacity: pulse,
                }}
              />
            ) : null}
          </div>
        </div>
      </Pop>
      {s.caption ? (
        <Pop delay={captionAt} from="scale">
          <Big text={s.caption} max={130} />
        </Pop>
      ) : null}
      {s.sticker ? <Sticker text={s.sticker} delay={stickerAt} /> : null}
    </div>
  );
};
