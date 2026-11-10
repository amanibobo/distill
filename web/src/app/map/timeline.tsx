"use client";

import { useRef } from "react";
import { longDate, shortDate } from "@/lib/format";
import type { Pass } from "@/lib/types";
import styles from "./atlas.module.css";

type Props = {
  passes: Pass[];
  current: string;
  playing: boolean;
  onPass: (date: string) => void;
  onPlay: () => void;
};

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export function Timeline({ passes, current, playing, onPass, onPlay }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const t0 = day(passes[0].date);
  const span = Math.max(day(passes[passes.length - 1].date) - t0, 1);
  const pos = (iso: string) => ((day(iso) - t0) / span) * 100;
  const idx = passes.findIndex((p) => p.date === current);
  const baselineEnd = passes.findLastIndex((p) => p.baseline);

  const pick = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const t = t0 + ((clientX - r.left) / r.width) * span;
    let best = passes[0];
    for (const p of passes) if (Math.abs(day(p.date) - t) < Math.abs(day(best.date) - t)) best = p;
    if (best.date !== current) onPass(best.date);
  };

  return (
    <div className={styles.timeline}>
      <button className={styles.play} onClick={onPlay} aria-label={playing ? "Pause" : "Play passes"}>
        {playing ? (
          <svg viewBox="0 0 16 16" aria-hidden>
            <rect x="4" y="3" width="3" height="10" rx="1" />
            <rect x="9" y="3" width="3" height="10" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.4-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" />
          </svg>
        )}
      </button>
      <div className={styles.timeBody}>
        <div className={styles.timeHead}>
          <span className={styles.timeNow}>{longDate(current)}</span>
          <span className={styles.timeHint}>
            {passes[idx]?.baseline ? "Before the event. Distill compares every later pass with these." : `Pass ${idx + 1} of ${passes.length}`}
          </span>
        </div>
        <div
          ref={track}
          className={styles.track}
          role="slider"
          tabIndex={0}
          aria-label="Satellite pass"
          aria-valuemin={1}
          aria-valuemax={passes.length}
          aria-valuenow={idx + 1}
          aria-valuetext={longDate(current)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) pick(e.clientX);
          }}
        >
          {baselineEnd >= 0 && <div className={styles.trackBaseline} style={{ width: `${pos(passes[baselineEnd].date)}%` }} />}
          <div className={styles.trackFill} style={{ width: `${pos(current)}%` }} />
          {passes.map((p) => (
            <span
              key={p.date}
              className={styles.tick}
              data-active={p.date === current || undefined}
              data-baseline={p.baseline || undefined}
              style={{ left: `${pos(p.date)}%` }}
            />
          ))}
        </div>
        <div className={styles.trackLabels}>
          {passes.map((p, i) =>
            i === 0 || i === passes.length - 1 || i === baselineEnd + 1 ? (
              <span key={p.date} style={{ left: `${pos(p.date)}%` }} data-edge={i === 0 ? "start" : i === passes.length - 1 ? "end" : undefined}>
                {shortDate(p.date)}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
