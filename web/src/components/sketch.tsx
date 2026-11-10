import rough from "roughjs";
import type { Options } from "roughjs/bin/core";

type Pt = [number, number];
type Fill = keyof typeof FILLS;

export type Shape =
  | { kind: "box"; x: number; y: number; w: number; h: number; label?: string | string[]; fill?: Fill; dashed?: boolean; size?: number }
  | { kind: "ellipse"; x: number; y: number; w: number; h: number; label?: string | string[]; fill?: Fill }
  | { kind: "arrow"; from: Pt; to: Pt; via?: Pt; label?: string; labelAt?: Pt; dashed?: boolean }
  | { kind: "line"; points: Pt[]; stroke?: string; width?: number; dashed?: boolean }
  | { kind: "poly"; points: Pt[]; fill?: Fill; stroke?: string }
  | { kind: "text"; x: number; y: number; text: string | string[]; size?: number; anchor?: "start" | "middle" | "end"; color?: string };

const FILLS = {
  blue: "#a5d8ff",
  green: "#b2f2bb",
  yellow: "#ffec99",
  red: "#ffc9c9",
  violet: "#d0bfff",
  orange: "#ffd8a8",
  gray: "#e9ecef",
  none: "transparent",
} as const;

const INK = "#1e1e1e";
const gen = rough.generator();

function base(seed: number, extra: Options = {}): Options {
  return { seed, roughness: 1.1, bowing: 1, stroke: INK, strokeWidth: 1.4, fillStyle: "hachure", hachureGap: 6, fillWeight: 1, ...extra };
}

function Paths({ drawables }: { drawables: ReturnType<typeof gen.line>[] }) {
  return (
    <>
      {drawables.flatMap((d, i) =>
        gen.toPaths(d).map((p, j) => (
          <path key={`${i}-${j}`} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill={p.fill ?? "none"} strokeLinecap="round" strokeLinejoin="round" />
        )),
      )}
    </>
  );
}

function Label({ x, y, text, size = 17, anchor = "middle", color = INK }: { x: number; y: number; text: string | string[]; size?: number; anchor?: "start" | "middle" | "end"; color?: string }) {
  const lines = Array.isArray(text) ? text : [text];
  const lh = size * 1.25;
  const top = y - ((lines.length - 1) * lh) / 2;
  return (
    <text x={x} textAnchor={anchor} fontSize={size} fill={color} style={{ fontFamily: "var(--font-hand)" }} dominantBaseline="central">
      {lines.map((l, i) => (
        <tspan key={i} x={x} y={top + i * lh}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function arrowHead(from: Pt, to: Pt, seed: number) {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const len = 11;
  const spread = 0.45;
  return [
    gen.line(to[0], to[1], to[0] - len * Math.cos(a - spread), to[1] - len * Math.sin(a - spread), base(seed)),
    gen.line(to[0], to[1], to[0] - len * Math.cos(a + spread), to[1] - len * Math.sin(a + spread), base(seed + 1)),
  ];
}

function draw(shape: Shape, i: number) {
  const seed = 17 + i * 7;
  const dash = { strokeLineDash: [7, 6] };
  switch (shape.kind) {
    case "box": {
      const d = gen.rectangle(shape.x, shape.y, shape.w, shape.h, base(seed, { fill: FILLS[shape.fill ?? "none"], ...(shape.dashed ? dash : {}) }));
      return (
        <g key={i}>
          <Paths drawables={[d]} />
          {shape.label && <Label x={shape.x + shape.w / 2} y={shape.y + shape.h / 2} text={shape.label} size={shape.size} />}
        </g>
      );
    }
    case "ellipse": {
      const d = gen.ellipse(shape.x + shape.w / 2, shape.y + shape.h / 2, shape.w, shape.h, base(seed, { fill: FILLS[shape.fill ?? "none"] }));
      return (
        <g key={i}>
          <Paths drawables={[d]} />
          {shape.label && <Label x={shape.x + shape.w / 2} y={shape.y + shape.h / 2} text={shape.label} />}
        </g>
      );
    }
    case "arrow": {
      const opts = base(seed, shape.dashed ? dash : {});
      const body = shape.via ? gen.curve([shape.from, shape.via, shape.to], opts) : gen.line(...shape.from, ...shape.to, opts);
      const tail = shape.via ?? shape.from;
      const mid = shape.labelAt ?? [(shape.from[0] + shape.to[0]) / 2, (shape.from[1] + shape.to[1]) / 2 - 12];
      return (
        <g key={i}>
          <Paths drawables={[body, ...arrowHead(tail, shape.to, seed + 3)]} />
          {shape.label && <Label x={mid[0]} y={mid[1]} text={shape.label} size={14} color="#495057" />}
        </g>
      );
    }
    case "line":
      return (
        <g key={i}>
          <Paths
            drawables={[gen.linearPath(shape.points, base(seed, { stroke: shape.stroke ?? INK, strokeWidth: shape.width ?? 1.4, roughness: 0.8, ...(shape.dashed ? dash : {}) }))]}
          />
        </g>
      );
    case "poly":
      return (
        <g key={i}>
          <Paths drawables={[gen.polygon(shape.points, base(seed, { fill: FILLS[shape.fill ?? "none"], stroke: shape.stroke ?? INK }))]} />
        </g>
      );
    case "text":
      return <Label key={i} x={shape.x} y={shape.y} text={shape.text} size={shape.size} anchor={shape.anchor} color={shape.color} />;
  }
}

export function Sketch({ width, height, shapes, caption, label }: { width: number; height: number; shapes: Shape[]; caption?: string; label: string }) {
  return (
    <figure className="sketch">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        {shapes.map(draw)}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
