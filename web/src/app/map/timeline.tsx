"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { CHANGE_TYPES, type ChangeType } from "@/lib/change-types";
import { area, longDate, shortDate } from "@/lib/format";
import type { Pass } from "@/lib/types";
import styles from "./atlas.module.css";

export type PassActivity = { date: string; byType: [ChangeType, number][]; total: number };

type Props = {
  passes: Pass[];
  activity: PassActivity[];
  current: string;
  playing: boolean;
  onPass: (date: string) => void;
  onPlay: () => void;
};

const STRIP_H = 46;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export function Timeline({ passes, activity, current, playing, onPass, onPlay }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const t0 = day(passes[0].date);
  const span = Math.max(day(passes[passes.length - 1].date) - t0, 1);
  const pos = (iso: string) => 2 + ((day(iso) - t0) / span) * 96;
  const idx = passes.findIndex((p) => p.date === current);
  const lastBaseline = passes.findLastIndex((p) => p.baseline);
  const max = Math.max(...activity.map((a) => a.total), 0.01);
  const byDate = new Map(activity.map((a) => [a.date, a]));
  const shown = byDate.get(hover ?? current);

  return (
    <div className={styles.timeline}>
      <div className={styles.timeHead}>
        <button className={styles.play} onClick={onPlay} aria-label={playing ? "Pause" : "Play through the passes"}>
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
        <div className={styles.timeNowBlock}>
          <span className={styles.timeNow}>{longDate(hover ?? current)}</span>
          <span className={styles.timeHint}>
            {passes.find((p) => p.date === (hover ?? current))?.baseline
              ? "Baseline pass. Later passes are compared with these."
              : `Pass ${passes.findIndex((p) => p.date === (hover ?? current)) + 1} of ${passes.length}`}
          </span>
        </div>
        <div className={styles.timeStats}>
          {shown && shown.total > 0 ? (
            shown.byType.map(([t, km2]) => (
              <span key={t} className={styles.timeStat}>
                <span className={styles.dot} style={{ background: CHANGE_TYPES[t].color }} aria-hidden />
                {CHANGE_TYPES[t].label}
                <b>{area(km2)}</b>
              </span>
            ))
          ) : (
            <span className={styles.timeHint}>No change on this pass</span>
          )}
        </div>
        <span className={styles.caps} aria-hidden>
          <kbd className={styles.cap}>←</kbd>
          <kbd className={styles.cap}>→</kbd>
          <kbd className={styles.cap}>space</kbd>
        </span>
      </div>

      <div className={styles.strip} style={{ height: STRIP_H + 22 }} onMouseLeave={() => setHover(null)}>
        {lastBaseline >= 0 && (
          <div className={styles.baselineBand} style={{ left: 0, width: `${(pos(passes[lastBaseline].date) + pos(passes[Math.min(lastBaseline + 1, passes.length - 1)].date)) / 2}%` }}>
            <span>baseline</span>
          </div>
        )}
        <div className={styles.stripAxis} style={{ top: STRIP_H }} />
        {passes.map((p, i) => {
          const a = byDate.get(p.date);
          let y = STRIP_H;
          return (
            <button
              key={p.date}
              className={styles.col}
              data-active={i === idx || undefined}
              style={{ left: `${pos(p.date)}%`, height: STRIP_H + 22 }}
              onMouseEnter={() => setHover(p.date)}
              onFocus={() => setHover(p.date)}
              onBlur={() => setHover(null)}
              onClick={() => onPass(p.date)}
              aria-label={`${longDate(p.date)}${a && a.total > 0 ? `, ${area(a.total)} changing` : ""}`}
              aria-pressed={i === idx}
            >
              <svg width="14" height={STRIP_H} className={styles.bars} aria-hidden>
                {a?.byType.map(([t, km2]) => {
                  const h = Math.max((km2 / max) * (STRIP_H - 4), 1.5);
                  y -= h;
                  const rect = <rect key={t} x={2} y={y} width={10} height={Math.max(h - 1.5, 1)} rx={1.5} fill={CHANGE_TYPES[t].color} />;
                  y -= 0.5;
                  return rect;
                })}
              </svg>
              <span className={styles.colDate}>{i === 0 || i === passes.length - 1 || i === idx || i === lastBaseline + 1 ? shortDate(p.date) : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
