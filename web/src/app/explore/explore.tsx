"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { longDate, shortDate } from "@/lib/format";
import { type Field as Motion, loadField } from "./field";
import { RAMP } from "./terrain";
import styles from "./explore.module.css";

// three.js only loads once someone opens the 3D place.
const Terrain = dynamic(() => import("./terrain").then((m) => m.Terrain), { ssr: false });

const SITE = "venezuela";
const SWEEP_MS = 4000;

export const day = (iso: string) => shortDate(iso.slice(0, 10));
const cm = (v: number) => `${Math.round(Math.abs(v))} cm`;

// The 3D place's state. It loads only once `active` has been true, then keeps its data.
export function useMotion(active: boolean) {
  const [field, setField] = useState<Motion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exaggeration, setExaggeration] = useState(3);
  const [showMotion, setShowMotion] = useState(true);
  const [blend, setBlend] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [requested, setRequested] = useState(active);
  if (active && !requested) setRequested(true);

  useEffect(() => {
    if (requested) loadField(SITE).then(setField, (e: Error) => setError(e.message));
  }, [requested]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / SWEEP_MS);
      setBlend(t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const togglePlay = useCallback(() => {
    if (!showMotion) return;
    if (!playing && blend >= 1) setBlend(0);
    setPlaying((p) => !p);
  }, [playing, blend, showMotion]);

  const scrub = useCallback((v: number) => {
    setPlaying(false);
    setBlend(v);
  }, []);

  const meta = field?.meta ?? null;
  const location = meta ? [meta.place, `${day(meta.pair.reference)} to ${longDate(meta.pair.secondary.slice(0, 10))}`, `${meta.extent_km} km across`] : ["Venezuela earthquake"];

  return { field, meta, error, exaggeration, setExaggeration, showMotion, setShowMotion, blend, scrub, playing, togglePlay, resetKey, reset: () => setResetKey((k) => k + 1), location };
}

export type MotionState = ReturnType<typeof useMotion>;

export function MotionStage({ m }: { m: MotionState }) {
  return (
    <div className={styles.stage}>
      {m.field && <Terrain field={m.field} exaggeration={m.exaggeration} blend={m.blend} showMotion={m.showMotion} resetKey={m.resetKey} />}
    </div>
  );
}

export function MotionFacts({ m }: { m: MotionState }) {
  if (m.error) return <p className={styles.note}>Couldn&rsquo;t load the ground motion. {m.error}</p>;
  if (!m.field || !m.meta) return <p className={styles.note}>Loading ground motion</p>;
  const { pair, displacement, quakes, coherence, nearby_quakes } = m.meta;
  const quake = quakes[0];
  const daysIn = quake ? Math.round((Date.parse(quake.time) - Date.parse(pair.reference)) / 86_400_000) : null;
  return (
    <>
      <dl className={styles.facts}>
        <div>
          <dt>Passes</dt>
          <dd>
            {day(pair.reference)} and {longDate(pair.secondary.slice(0, 10))}, {pair.days} days apart.
            {quake && ` The quake struck on ${day(quake.time)}, ${daysIn} days in.`}
          </dd>
        </div>
        <div>
          <dt>Largest motion</dt>
          <dd>
            About {cm(displacement.p99)} toward the satellite and {cm(displacement.p1)} away, measured against the middle of this area.
          </dd>
        </div>
        <div>
          <dt>
            <span className={styles.swatch} style={{ background: `rgb(${RAMP[6].join(" ")})` }} aria-hidden />
            Blue
          </dt>
          <dd>Ground moved toward the satellite, mostly up or east. The satellite flew north and looked west.</dd>
        </div>
        <div>
          <dt>
            <span className={styles.swatch} style={{ background: `rgb(${RAMP[0].join(" ")})` }} aria-hidden />
            Red
          </dt>
          <dd>Ground moved away from it, mostly down or west.</dd>
        </div>
        <div>
          <dt>Faded</dt>
          <dd>The radar could not measure reliably there (coherence below {coherence.threshold}): water, dense forest, or steep slopes.</dd>
        </div>
      </dl>
      <p className={styles.source}>
        NISAR GUNW, track {pair.track} {pair.direction}, frame {pair.frame}. Terrain from {m.meta.source.dem_product}.
        {quake &&
          nearby_quakes.map((q) => {
            const seconds = Math.round((Date.parse(q.time) - Date.parse(quake.time)) / 1000);
            return ` An M${q.magnitude.toFixed(1)} shock struck ${seconds} seconds later, ${Math.round(q.km_from_main / 5) * 5} km away near ${q.place.replace(/^.* of /, "")}, outside this view. The radar pair holds the motion from both.`;
          })}
      </p>
    </>
  );
}

// Sits where the pass filmstrip goes: the two passes and the blend between them.
export function MotionBlend({ m }: { m: MotionState }) {
  const meta = m.meta;
  return (
    <label className={styles.slider}>
      <span className={styles.sliderHead}>
        <span>{meta ? `${day(meta.pair.reference)} pass` : "First pass"}</span>
        <span className={styles.value}>{Math.round(m.blend * 100)}% of the measured motion</span>
        <span>{meta ? `${day(meta.pair.secondary)} pass` : "Second pass"}</span>
      </span>
      <input type="range" min={0} max={1} step={0.01} value={m.blend} disabled={!m.showMotion} onChange={(e) => m.scrub(Number(e.target.value))} />
      <span className={styles.hint}>A linear blend between two passes. The radar saw only the before and after.</span>
    </label>
  );
}

// The floating toolbar for 3D: color mode, height, and the scale.
export function MotionTools({ m, pill }: { m: MotionState; pill: string }) {
  const stops = RAMP.map((c, i) => `rgb(${c.join(" ")}) ${(i / (RAMP.length - 1)) * 100}%`).join(", ");
  const limit = m.meta?.displacement.limit;
  return (
    <>
      <div className={`${pill} ${styles.segmented}`} role="group" aria-label="Color the terrain by">
        <button aria-pressed={m.showMotion} onClick={() => m.setShowMotion(true)}>
          Motion
        </button>
        <button aria-pressed={!m.showMotion} onClick={() => m.setShowMotion(false)}>
          Terrain
        </button>
      </div>
      <label className={`${pill} ${styles.height}`}>
        <span>Height {m.exaggeration}x</span>
        <input type="range" min={1} max={6} step={0.5} value={m.exaggeration} onChange={(e) => m.setExaggeration(Number(e.target.value))} />
      </label>
      {limit && (
        <figure className={`${pill} ${styles.legend}`} aria-label={`Color scale from ${limit} cm away to ${limit} cm toward the satellite`}>
          <span>{limit} cm away</span>
          <span className={styles.legendBar} style={{ background: `linear-gradient(to right, ${stops})` }} />
          <span>toward</span>
        </figure>
      )}
    </>
  );
}
