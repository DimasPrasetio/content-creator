// Saat preview (inputProps.layoutCheck), ukur tata letak frame ini lalu kirim ke log browser; render.mjs menangkapnya.
// Pengukuran menunggu sampai semua delayRender LAIN selesai (font Google ditambahkan Remotion secara asinkron;
// mengukur lebih awal = font cadangan yang lebih lebar = hasil salah), lalu dua frame animasi.
// Penanda data-probe="root" seukuran komposisi menjadi titik nol pengukuran.
import React, { useEffect } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from "remotion";
import { probeLayout } from "./measure.js";

type W = Window & { remotion_delayRenderHandles?: number[] };

export const LayoutProbe: React.FC<{ enabled?: boolean }> = ({ enabled }) => {
  const frame = useCurrentFrame();
  useEffect(() => {
    if (!enabled) return;
    const h = delayRender("cek tata letak");
    const t0 = performance.now();
    let id = 0;
    const others = () => ((window as W).remotion_delayRenderHandles ?? []).filter((x) => x !== h).length;
    const tick = () => {
      const waiting = others() > 0 || document.fonts.status !== "loaded";
      if (waiting && performance.now() - t0 < 8000) {
        id = requestAnimationFrame(tick);
        return;
      }
      id = requestAnimationFrame(() => {
        id = requestAnimationFrame(() => {
          console.log(`LAYOUT_PROBE ${JSON.stringify({ frame, unsure: waiting, ...probeLayout() })}`);
          continueRender(h);
        });
      });
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      continueRender(h);
    };
  }, [enabled, frame]);
  return enabled ? <AbsoluteFill data-probe="root" style={{ visibility: "hidden", pointerEvents: "none" }} /> : null;
};
