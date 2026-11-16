"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { CHANGE_TYPES, swatch } from "@/lib/change-types";
import { area, longDate, percent, shortDate } from "@/lib/format";
import type { ChangeEvent, EventStatus, Pass } from "@/lib/types";
import type { SimilarEvent } from "@/app/api/similar/[id]/route";
import styles from "./atlas.module.css";
import ui from "./ui.module.css";

export const STATUS: Record<EventStatus, string> = {
  recovered: "Recovered",
  growing: "Still growing",
  stable: "Still present",
  receding: "Shrinking",
};

const W = 316;
const H = 96;
const PAD = { l: 30, r: 6, t: 8, b: 18 };

type ChartProps = { passes: Pass[]; current: string; onPick: (d: string) => void };

function useCursor(passes: Pass[]) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (i: number) => PAD.l + (i / Math.max(passes.length - 1, 1)) * (W - PAD.l - PAD.r);
  const handlers = {
    onMouseLeave: () => setHover(null),
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const rel = ((e.clientX - r.left) / r.width) * W;
      const i = Math.round(((rel - PAD.l) / (W - PAD.l - PAD.r)) * (passes.length - 1));
      setHover(Math.min(Math.max(i, 0), passes.length - 1));
    },
  };
  return { hover, x, handlers };
}

function AreaChart({ passes, current, onPick, event }: ChartProps & { event: ChangeEvent }) {
  const { hover, x, handlers } = useCursor(passes);
  const byDate = new Map(event.footprint_by_pass.map((f) => [f.date, f.area_km2]));
  const vals = passes.map((p) => byDate.get(p.date) ?? 0);
  const max = Math.max(...vals, 0.01);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const cur = passes.findIndex((p) => p.date === current);
  const at = hover ?? cur;
  const color = CHANGE_TYPES[event.change_type].color;
  const lastBaseline = passes.findLastIndex((p) => p.baseline);
  return (
    <figure className={styles.chart}>
      <figcaption>
        <span>Changed area</span>
        <span className={styles.chartValue}>
          {shortDate(passes[at].date)} <b>{passes[at].baseline ? "baseline" : area(vals[at])}</b>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Changed area at each pass" {...handlers} onClick={() => hover !== null && onPick(passes[hover].date)}>
        {lastBaseline >= 0 && <rect x={PAD.l} y={PAD.t} width={x(lastBaseline) - PAD.l} height={H - PAD.t - PAD.b} className={styles.chartBaseline} />}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} className={styles.chartAxis} />
        <text x={PAD.l - 6} y={PAD.t + 4} textAnchor="end" className={styles.chartTick}>
          {max >= 10 ? Math.round(max) : max.toFixed(1)}
        </text>
        <text x={PAD.l - 6} y={H - PAD.b} textAnchor="end" className={styles.chartTick}>
          0
        </text>
        <path d={`${line} L${x(vals.length - 1)},${H - PAD.b} L${x(0)},${H - PAD.b} Z`} fill={color} opacity={0.16} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <line x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} className={styles.chartCursor} />
        <circle cx={x(at)} cy={y(vals[at])} r={3.5} fill={color} stroke="var(--raised)" strokeWidth={2} />
        <text x={PAD.l} y={H - 4} className={styles.chartTick}>
          {shortDate(passes[0].date)}
        </text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end" className={styles.chartTick}>
          {shortDate(passes[passes.length - 1].date)}
        </text>
      </svg>
    </figure>
  );
}

const HH = "#a3a3a3";
const HV = "#2b2b2b";

function SignatureChart({ passes, current, onPick, event }: ChartProps & { event: ChangeEvent }) {
  const { hover, x, handlers } = useCursor(passes);
  const sig = event.signature;
  const idx = new Map(sig.dates.map((d, i) => [d, i]));
  const hh = passes.map((p) => sig.d_hh[idx.get(p.date) ?? -1] ?? 0);
  const hv = passes.map((p) => sig.d_hv[idx.get(p.date) ?? -1] ?? 0);
  const lo = Math.min(...hh, ...hv, -1);
  const hi = Math.max(...hh, ...hv, 1);
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const at = hover ?? passes.findIndex((p) => p.date === current);
  const fmt = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
  return (
    <figure className={styles.chart}>
      <figcaption>
        <span>Radar change vs baseline, dB</span>
        <span className={styles.chartValue}>
          <span className={styles.legendKey} style={{ background: HH }} /> HH <b>{fmt(hh[at])}</b>
          <span className={styles.legendKey} style={{ background: HV }} /> HV <b>{fmt(hv[at])}</b>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="HH and HV radar change against the baseline at each pass" {...handlers} onClick={() => hover !== null && onPick(passes[hover].date)}>
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} className={styles.chartAxis} />
        <text x={PAD.l - 6} y={y(0) + 3} textAnchor="end" className={styles.chartTick}>
          0
        </text>
        <text x={PAD.l - 6} y={y(lo) - 1} textAnchor="end" className={styles.chartTick}>
          {lo.toFixed(0)}
        </text>
        <path d={path(hh)} fill="none" stroke={HH} strokeWidth={1.6} strokeLinejoin="round" />
        <path d={path(hv)} fill="none" stroke={HV} strokeWidth={2} strokeLinejoin="round" />
        <line x1={x(at)} x2={x(at)} y1={PAD.t} y2={H - PAD.b} className={styles.chartCursor} />
        <circle cx={x(at)} cy={y(hv[at])} r={3} fill={HV} stroke="var(--raised)" strokeWidth={2} />
        <circle cx={x(at)} cy={y(hh[at])} r={3} fill={HH} stroke="var(--raised)" strokeWidth={2} />
      </svg>
    </figure>
  );
}

export type Similar =
  | { state: "idle" }
  | { state: "loading"; from: string }
  | { state: "done"; from: string; rows: SimilarEvent[] }
  | { state: "failed"; from: string; message: string };

export async function findSimilar(id: string): Promise<Similar> {
  try {
    const res = await fetch(`/api/similar/${encodeURIComponent(id)}`);
    const body = await res.json();
    return res.ok ? { state: "done", from: id, rows: body } : { state: "failed", from: id, message: body.error ?? "The search failed." };
  } catch {
    return { state: "failed", from: id, message: "Couldn't reach the server." };
  }
}

function SimilarList({ similar, selectedId, onPick }: { similar: Similar; selectedId: string; onPick: (r: SimilarEvent) => void }) {
  if (similar.state === "idle") return null;
  return (
    <section className={styles.why}>
      <h3>Changes like this</h3>
      {similar.state === "loading" ? (
        <p>Searching every site</p>
      ) : similar.state === "failed" ? (
        <p>{similar.message}</p>
      ) : similar.rows.length === 0 ? (
        <p>Nothing else in the data changed this way.</p>
      ) : (
        <ul className={ui.list} style={{ margin: "8px -10px 0" }}>
          {similar.rows.map((r) => (
            <li key={r.id}>
              <button className={ui.row} data-selected={r.id === selectedId || undefined} title={r.title ?? undefined} onClick={() => onPick(r)}>
                <span className={ui.dot} style={{ background: swatch(r.change_type) }} aria-hidden />
                <span className={ui.rowText}>
                  <span className={ui.rowLabel}>{r.title ?? CHANGE_TYPES[r.change_type].label}</span>
                  <span className={ui.rowSub}>
                    {r.site_name} · {CHANGE_TYPES[r.change_type].label}
                  </span>
                </span>
                <span className={ui.rowTrail} title="How closely the radar signature matches">
                  {percent(r.similarity)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Props = {
  event: ChangeEvent;
  passes: Pass[];
  current: string;
  similar: Similar;
  onPick: (d: string) => void;
  onPickSimilar: (r: SimilarEvent) => void;
  onClose: () => void;
};

export function Inspector({ event, passes, current, similar, onPick, onPickSimilar, onClose }: Props) {
  const t = CHANGE_TYPES[event.change_type];
  return (
    <aside className={styles.inspector} aria-label="Change details">
      <header className={styles.inspHead}>
        <span className={styles.typeLabel}>
          <span className={ui.dot} style={{ background: swatch(event.change_type) }} aria-hidden />
          {t.label}
        </span>
        <button className={ui.iconBtn} onClick={onClose} aria-label="Close details" title="Close (Esc)">
          <X className={ui.icon} aria-hidden />
        </button>
      </header>
      <div className={styles.inspBody}>
        <h2 className={styles.inspTitle}>{event.title ?? t.label}</h2>
        <div className={styles.confidence}>
          <span>Confidence</span>
          <span className={styles.meter} aria-hidden>
            <span style={{ width: percent(event.confidence) }} />
          </span>
          <b>{percent(event.confidence)}</b>
        </div>
        <SimilarList similar={similar} selectedId={event.id} onPick={onPickSimilar} />
        {event.summary && <p className={styles.summary}>{event.summary}</p>}
        {event.summary && event.change_type !== "other" && (
          <p className={styles.provenance}>Summary written by Claude from the numbers below. The label comes from Distill&rsquo;s rules.</p>
        )}

        <dl className={styles.metrics}>
          <div>
            <dt>Peak area</dt>
            <dd>{area(event.area_km2)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{STATUS[event.status]}</dd>
          </div>
          <div>
            <dt>First seen</dt>
            <dd>{longDate(event.onset)}</dd>
          </div>
          <div>
            <dt>{event.recovery ? "Recovered by" : "Peak"}</dt>
            <dd>{longDate(event.recovery ?? event.peak)}</dd>
          </div>
        </dl>

        <AreaChart passes={passes} current={current} onPick={onPick} event={event} />
        <SignatureChart passes={passes} current={current} onPick={onPick} event={event} />

        <section className={styles.why}>
          <h3>Why Distill labeled it this way</h3>
          <p>{event.reason}</p>
        </section>
        <p className={styles.eventId}>{event.id}</p>
      </div>
    </aside>
  );
}
