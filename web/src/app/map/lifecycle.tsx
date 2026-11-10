"use client";

import { useState } from "react";
import { area, shortDate } from "@/lib/format";
import type { Pass } from "@/lib/types";
import styles from "./atlas.module.css";

const W = 300;
const H = 92;
const PAD = { l: 4, r: 4, t: 10, b: 20 };

type Props = { passes: Pass[]; areaByDate: Map<string, number>; color: string; current: string | null; onPick: (date: string) => void };

export function Lifecycle({ passes, areaByDate, color, current, onPick }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...passes.map((p) => areaByDate.get(p.date) ?? 0), 0.01);
  const x = (i: number) => PAD.l + (i / Math.max(passes.length - 1, 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const pts = passes.map((p, i) => [x(i), y(areaByDate.get(p.date) ?? 0)] as const);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ");
  const fill = `${line} L${x(passes.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`;
  const baselineEnd = passes.findLastIndex((p) => p.baseline);
  const cur = passes.findIndex((p) => p.date === current);
  const shown = hover ?? (cur >= 0 ? cur : null);

  return (
    <figure className={styles.lifecycle}>
      <figcaption>Changed area at each pass</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Changed area at each satellite pass"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (passes.length - 1));
          setHover(Math.min(Math.max(i, 0), passes.length - 1));
        }}
        onClick={() => hover !== null && onPick(passes[hover].date)}
      >
        {baselineEnd >= 0 && (
          <rect x={PAD.l} y={PAD.t} width={x(baselineEnd) - PAD.l} height={H - PAD.t - PAD.b} className={styles.lcBaseline} />
        )}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className={styles.lcAxis} />
        <path d={fill} fill={color} opacity={0.18} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {shown !== null && (
          <>
            <line x1={x(shown)} x2={x(shown)} y1={PAD.t} y2={H - PAD.b} className={styles.lcCursor} />
            <circle cx={pts[shown][0]} cy={pts[shown][1]} r={4} fill={color} stroke="var(--panel)" strokeWidth={2} />
          </>
        )}
        <text x={PAD.l} y={H - 5} className={styles.lcLabel}>
          {shortDate(passes[0].date)}
        </text>
        <text x={W - PAD.r} y={H - 5} textAnchor="end" className={styles.lcLabel}>
          {shortDate(passes[passes.length - 1].date)}
        </text>
      </svg>
      <p className={styles.lcReadout}>
        {shown !== null ? (
          <>
            {shortDate(passes[shown].date)}
            <span>{passes[shown].baseline ? "before, used as the baseline" : area(areaByDate.get(passes[shown].date) ?? 0)}</span>
          </>
        ) : (
          " "
        )}
      </p>
    </figure>
  );
}
