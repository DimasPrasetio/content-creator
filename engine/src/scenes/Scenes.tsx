import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Pop, findCue, useCue, useIn, useScene, useStagger } from "../components/anim";
import { Big, CheckRow, IconBadge, Small, Sticker } from "../components/bits";
import { Icon } from "../components/Icon";
import { BODY, DISPLAY } from "../fonts";
import { C, goldGradient } from "../theme";
import type {
  CardsScene,
  ChecklistScene,
  CompareScene,
  CtaScene,
  HeadlineScene,
  HierarchyScene,
  KineticScene,
  StatScene,
} from "../types";

const Col: React.FC<{ children: React.ReactNode; gap?: number; align?: "center" | "stretch" }> = ({
  children,
  gap = 34,
  align = "center",
}) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: align, gap, width: "100%" }}>{children}</div>
);

export const Headline: React.FC<{ s: HeadlineScene }> = ({ s }) => {
  const pre = useCue(s.preCue ?? s.pre, 0);
  const title = Math.max(pre, useCue(s.cue ?? s.title, pre + 6));
  const post = Math.max(title, useCue(s.post, title + 10));
  const sticker = Math.max(title, useCue(s.stickerCue ?? s.sticker, (s.post ? post : title) + 12));
  return (
    <Col>
      {s.badge ? (
        <Pop delay={pre} from="scale">
          <IconBadge name={s.icon ?? "spark"} />
        </Pop>
      ) : null}
      {s.pre ? (
        <Pop delay={pre}>
          <Small>{s.pre}</Small>
        </Pop>
      ) : null}
      <Pop delay={title} from="scale">
        <Big text={s.title} />
      </Pop>
      {s.post ? (
        <Pop delay={post}>
          <Small>{s.post}</Small>
        </Pop>
      ) : null}
      {s.sticker ? <Sticker text={s.sticker} delay={sticker} /> : null}
    </Col>
  );
};

export const Kinetic: React.FC<{ s: KineticScene; text: string }> = ({ s, text }) => {
  const { theme, duration, words: spoken } = useScene();
  const frame = useCurrentFrame();
  const words = (s.text ?? text).split(/\s+/).filter(Boolean);
  const hl = (s.highlight ?? []).map((h) => h.toLowerCase());
  const step = Math.max(2, Math.min(9, (duration * 0.8) / Math.max(words.length, 1)));
  // waktu tiap kata: dari narasi (bila teks = narasi) atau dicari per kata, lalu fallback rata
  let cursor = 0;
  const at = words.map((w, i) => {
    const direct = !s.text && spoken[i] ? spoken[i].f : findCue(spoken, w, cursor);
    const f = direct ?? Math.max(cursor, 3 + i * step);
    cursor = f;
    return f - 2;
  });
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "baseline",
        gap: "10px 22px",
        width: "100%",
      }}
    >
      {words.map((w, i) => {
        const clean = w.replace(/[.,!?…:;"']/g, "").toLowerCase();
        const on = hl.includes(clean);
        const p = interpolate(frame - at[i], [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return (
          <span
            key={i}
            style={{
              opacity: p,
              transform: `translateY(${(1 - p) * 28}px) scale(${on ? 0.8 + 0.2 * p : 1})`,
              fontFamily: on ? DISPLAY : BODY,
              fontWeight: 700,
              textTransform: on ? "uppercase" : "none",
              fontSize: on ? 128 : 66,
              lineHeight: 1.15,
              ...(on && theme === "dark"
                ? { backgroundImage: goldGradient, WebkitBackgroundClip: "text", color: "transparent" }
                : { color: on ? C.red : theme === "dark" ? C.white : C.text }),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

const CheckItem: React.FC<{ text: string; ok?: boolean; cue?: string; i: number; n: number }> = ({ text, ok, cue, i, n }) => {
  const d = useCue(cue ?? text, useStagger(i, n));
  return (
    <Pop delay={d} from="left" style={{ width: "100%" }}>
      <CheckRow text={text} ok={ok} />
    </Pop>
  );
};

export const Checklist: React.FC<{ s: ChecklistScene }> = ({ s }) => {
  const n = s.items.length;
  const { words } = useScene();
  const fallbackTail = useStagger(n, n + 1);
  const lastItem = n ? (findCue(words, s.items[n - 1].cue ?? s.items[n - 1].text) ?? fallbackTail) : 0;
  const caption = useCue(s.captionCue ?? s.caption, lastItem + 12);
  const sticker = useCue(s.stickerCue ?? s.sticker, (s.caption ? caption : lastItem) + 14);
  return (
    <Col gap={26} align="stretch">
      {s.intro ? (
        <Pop>
          <Small>{s.intro}</Small>
        </Pop>
      ) : null}
      {s.items.map((it, i) => (
        <CheckItem key={i} text={it.text} ok={it.ok} cue={it.cue} i={i} n={n} />
      ))}
      {s.caption ? (
        <Pop delay={caption}>
          <Small size={42}>{s.caption}</Small>
        </Pop>
      ) : null}
      {s.sticker ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <Sticker text={s.sticker} delay={sticker} gold />
        </div>
      ) : null}
    </Col>
  );
};

const Bar: React.FC<{ label: string; value: number; color: "gold" | "red"; cue?: string; i: number; n: number }> = ({
  label,
  value,
  color,
  cue,
  i,
  n,
}) => {
  const d = useCue(cue ?? label, useStagger(i, n, 8, 0.5));
  const p = useIn(d, 22, 60);
  const shown = Math.round(value * Math.min(1, p));
  const fill = color === "red" ? C.red : goldGradient;
  const num = color === "red" ? C.red : C.gold;
  return (
    <div style={{ width: "100%", opacity: Math.min(1, p * 2) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
        <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 36, letterSpacing: 3, color: C.white, textTransform: "uppercase" }}>
          {label}
        </div>
        <div style={{ fontFamily: DISPLAY, fontSize: 84, lineHeight: 0.9, color: num }}>{shown}%</div>
      </div>
      <div style={{ height: 38, borderRadius: 19, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
        <div style={{ width: `${shown}%`, height: "100%", borderRadius: 19, background: fill }} />
      </div>
    </div>
  );
};

export const Compare: React.FC<{ s: CompareScene }> = ({ s }) => {
  const n = s.bars.length;
  const tail = useStagger(n, n + 1, 8, 0.5);
  return (
    <Col gap={50} align="stretch">
      {s.intro ? (
        <Pop>
          <Small>{s.intro}</Small>
        </Pop>
      ) : null}
      {s.bars.map((b, i) => (
        <Bar key={i} label={b.label} value={b.value} color={b.color ?? (i === 0 ? "gold" : "red")} cue={b.cue} i={i} n={n} />
      ))}
      {s.sticker ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Sticker text={s.sticker} delay={tail} gold />
        </div>
      ) : null}
    </Col>
  );
};

const Card: React.FC<{ c: CardsScene["a"]; gold?: boolean; delay: number }> = ({ c, gold, delay }) => (
  <Pop delay={delay} from="scale" style={{ flex: 1 }}>
    <div
      style={{
        height: 400,
        borderRadius: 30,
        padding: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        background: gold ? goldGradient : "linear-gradient(180deg,#201b14,#100d09)",
        border: gold ? "none" : `2px solid ${C.goldDark}`,
        color: gold ? C.text : C.white,
        boxShadow: "0 24px 50px rgba(0,0,0,0.4)",
      }}
    >
      <Icon name={c.icon} size={84} color={gold ? C.text : C.gold} />
      <div style={{ fontFamily: DISPLAY, fontSize: 64, lineHeight: 1.02, textTransform: "uppercase" }}>{c.title}</div>
      {c.sub ? (
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 32, opacity: 0.75 }}>{c.sub}</div>
      ) : null}
    </div>
  </Pop>
);

export const Cards: React.FC<{ s: CardsScene }> = ({ s }) => {
  const items = s.items ?? [];
  const aAt = useCue(s.a.cue ?? s.a.title, 4);
  const bAt = Math.max(aAt + 6, useCue(s.b.cue ?? s.b.title, aAt + 12));
  const tail = useCue(s.stickerCue ?? s.sticker, Math.max(bAt + 14, useStagger(items.length, items.length + 1) + 4));
  return (
    <Col gap={30} align="stretch">
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Card c={s.a} gold delay={aAt} />
        <Pop delay={Math.round((aAt + bAt) / 2)} from="scale">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: C.black,
              border: `2px solid ${C.goldDark}`,
              color: C.gold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: -56,
              marginRight: -56,
              zIndex: 2,
            }}
          >
            <span style={{ fontFamily: DISPLAY, fontSize: 40 }}>›</span>
          </div>
        </Pop>
        <Card c={s.b} delay={bAt} />
      </div>
      {items.map((it, i) => (
        <CheckItem key={i} text={it.text} ok={it.ok} cue={it.cue} i={i} n={items.length} />
      ))}
      {s.sticker ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Sticker text={s.sticker} delay={tail} gold />
        </div>
      ) : null}
    </Col>
  );
};

const Tree: React.FC<{ levels: number[]; bad?: boolean; delay: number }> = ({ levels, bad, delay }) => {
  const width = 900;
  const rowH = 150;
  const r = (lv: number) => (lv === 0 ? 46 : lv === 1 ? 34 : 24);
  const pos = levels.map((count, lv) =>
    Array.from({ length: count }, (_, i) => ({ x: ((i + 0.5) / count) * width, y: 60 + lv * rowH })),
  );
  const color = bad ? C.red : C.goldDark;
  const p = useIn(delay, 20, 70);
  return (
    <svg width={width} height={60 + (levels.length - 1) * rowH + 70} style={{ overflow: "visible" }}>
      {pos.slice(1).flatMap((row, li) =>
        row.map((n, i) => {
          const parent = pos[li][Math.min(pos[li].length - 1, Math.floor((i / row.length) * pos[li].length))];
          return (
            <path
              key={`${li}-${i}`}
              d={`M${parent.x} ${parent.y + r(li)} V${(parent.y + n.y) / 2} H${n.x} V${n.y - r(li + 1)}`}
              stroke={color}
              strokeWidth={4}
              fill="none"
              strokeDasharray={600}
              strokeDashoffset={600 * (1 - p)}
              opacity={0.9}
            />
          );
        }),
      )}
      {pos.flatMap((row, lv) =>
        row.map((n, i) => (
          <g key={`${lv}-${i}`} opacity={Math.min(1, p * 1.5)}>
            <circle cx={n.x} cy={n.y} r={r(lv)} fill={lv === 0 || bad ? C.red : C.black} stroke={color} strokeWidth={4} />
            <g transform={`translate(${n.x - r(lv) * 0.6} ${n.y - r(lv) * 0.6}) scale(${(r(lv) * 1.2) / 24})`}>
              <Icon name={lv === 0 ? "crown" : "user"} size={24} color={C.white} stroke={2.4} />
            </g>
          </g>
        )),
      )}
    </svg>
  );
};

export const Hierarchy: React.FC<{ s: HierarchyScene }> = ({ s }) => {
  const pre = useCue(s.pre, 0);
  const title = Math.max(pre, useCue(s.cue ?? s.title, pre + 4));
  const tree = Math.max(title, useCue(s.treeCue, title + 8));
  const post = Math.max(title, useCue(s.post, title + 10));
  const sticker = useCue(s.sticker, tree + 30);
  return (
    <Col gap={30}>
      {s.pre ? (
        <Pop delay={pre}>
          <Small>{s.pre}</Small>
        </Pop>
      ) : null}
      <Pop delay={title} from="scale">
        <Big text={s.title} max={160} />
      </Pop>
      {s.post ? (
        <Pop delay={post}>
          <Small>{s.post}</Small>
        </Pop>
      ) : null}
      <Tree levels={s.levels} bad={s.bad} delay={tree} />
      {s.sticker ? <Sticker text={s.sticker} delay={sticker} size={64} /> : null}
    </Col>
  );
};

export const Stat: React.FC<{ s: StatScene }> = ({ s }) => {
  const at = useCue(s.cue, 4);
  const p = useIn(at, 24, 50);
  const shown = Math.round(s.value * Math.min(1, p));
  return (
    <Col gap={20}>
      {s.pre ? (
        <Pop>
          <Small>{s.pre}</Small>
        </Pop>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Big text={`${shown}${s.suffix ?? "%"}`} max={300} />
        {s.down ? (
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: "50%",
              background: C.red,
              color: C.white,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="down" size={64} stroke={3} />
          </div>
        ) : null}
      </div>
      {s.label ? (
        <Pop delay={at + 8}>
          <Small>{s.label}</Small>
        </Pop>
      ) : null}
      {s.sticker ? <Sticker text={s.sticker} delay={at + 18} /> : null}
    </Col>
  );
};

export const Cta: React.FC<{ s: CtaScene }> = ({ s }) => {
  const at = useCue(s.cue ?? s.title, 6);
  return (
  <Col gap={32}>
    {s.image ? (
      <Pop from="scale">
        <Img
          src={staticFile(s.image)}
          style={{ height: 620, borderRadius: 16, boxShadow: "0 30px 70px rgba(0,0,0,0.5)", border: `2px solid ${C.goldDark}` }}
        />
      </Pop>
    ) : null}
    <Pop delay={at} from="scale">
      <Big text={s.title} max={140} />
    </Pop>
    {s.line ? (
      <Pop delay={at + 8}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, color: C.white, fontFamily: BODY, fontWeight: 800, fontSize: 46 }}>
          <Icon name="spark" size={44} color={C.gold} />
          {s.line}
        </div>
      </Pop>
    ) : null}
    {s.handle ? (
      <Pop delay={at + 14} from="scale">
        <div
          style={{
            background: goldGradient,
            color: C.text,
            fontFamily: BODY,
            fontWeight: 800,
            fontSize: 44,
            padding: "20px 54px",
            borderRadius: 999,
            boxShadow: "0 16px 40px rgba(233,185,73,0.35)",
          }}
        >
          {s.handle}
        </div>
      </Pop>
    ) : null}
  </Col>
  );
};
