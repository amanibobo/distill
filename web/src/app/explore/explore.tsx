"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { motionSite, type MotionSiteId } from "@/app/map/links";
import { longDate, shortDate } from "@/lib/format";
import { type Field as Motion, type Meta, type Quake, loadField } from "./field";
import { RAMP } from "./terrain";
import styles from "./explore.module.css";

// three.js only loads once someone opens the 3D place.
const Terrain = dynamic(() => import("./terrain").then((m) => m.Terrain), { ssr: false });

const SWEEP_MS = 4000;

export const day = (iso: string) => shortDate(iso.slice(0, 10));
const cm = (v: number) => `${Math.round(Math.abs(v))} cm`;

// NISAR looks left of its track, so the look direction flips with the pass direction.
const LOOK = {
  ascending: { flight: "flew north and looked west", toward: "up or east", away: "down or west" },
  descending: { flight: "flew south and looked east", toward: "up or west", away: "down or east" },
};

const at = (iso: string) => Date.parse(iso);
const quakesByTime = (meta: Meta): Quake[] => [...meta.quakes, ...meta.nearby_quakes].sort((a, b) => at(a.time) - at(b.time));
const heldByPair = (meta: Meta, q: Quake) => at(meta.pair.reference) < at(q.time) && at(q.time) < at(meta.pair.secondary);
const inPair = (meta: Meta) => quakesByTime(meta).filter((q) => heldByPair(meta, q));

function span(ms: number) {
  const s = Math.abs(ms) / 1000;
  if (s < 120) return `${Math.round(s)} seconds`;
  if (s < 48 * 3600) return `${Math.round(s / 3600)} hours`;
  return `${Math.round(s / 86400)} days`;
}

// One sentence on each located shock besides the main one, and whether this pair holds its motion.
function otherQuakes(meta: Meta, main: Quake) {
  const nearby = new Map(meta.nearby_quakes.map((q) => [q.id, q.km_from_main]));
  const others = quakesByTime(meta).filter((q) => q.id !== main.id);
  return others.map((q) => {
    const ms = at(q.time) - at(main.time);
    const km = nearby.get(q.id);
    const away = km === undefined ? "" : `, ${Math.round(km / 5) * 5} km away`;
    const seen = km === undefined ? "marked in this view" : "outside this view";
    const held = !heldByPair(meta, q) ? "It came after the second pass, so this pair doesn't hold its motion." : others.length === 1 ? "The radar pair holds the motion from both." : "The radar pair holds its motion too.";
    return ` An M${q.magnitude.toFixed(1)} shock struck ${span(ms)} ${ms < 0 ? "earlier" : "later"}${away} near ${q.place.replace(/^.* of /, "")}, ${seen}. ${held}`;
  });
}

// One fetch per place for the life of the page.
const loads = new Map<MotionSiteId, Promise<Motion>>();
function load(site: MotionSiteId) {
  let p = loads.get(site);
  if (!p) loads.set(site, (p = loadField(site)));
  return p;
}

// The open 3D place's state. A place loads the first time it opens and keeps its data after.
export function useMotion(site: MotionSiteId | null) {
  const [fields, setFields] = useState<Partial<Record<MotionSiteId, Motion>>>({});
  const [errors, setErrors] = useState<Partial<Record<MotionSiteId, string>>>({});
  const [exaggeration, setExaggeration] = useState(3);
  const [showMotion, setShowMotion] = useState(true);
  const [blend, setBlend] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [shown, setShown] = useState(site);
  if (site !== shown) {
    setShown(site);
    setPlaying(false);
    setBlend(1);
  }

  useEffect(() => {
    if (!site) return;
    load(site).then(
      (f) => setFields((m) => ({ ...m, [site]: f })),
      (e: Error) => setErrors((m) => ({ ...m, [site]: e.message })),
    );
  }, [site]);

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

  const field = site ? (fields[site] ?? null) : null;
  const error = site ? (errors[site] ?? null) : null;
  const meta = field?.meta ?? null;
  const name = meta?.name ?? (site ? motionSite(site).name : "");
  const location = meta ? [meta.place, `${day(meta.pair.reference)} to ${longDate(meta.pair.secondary.slice(0, 10))}`, `${meta.extent_km} km across`] : [];
  const magnitudes = meta ? inPair(meta).map((q) => `M${q.magnitude.toFixed(1)}`) : [];
  const headline = magnitudes.length > 1 ? `${magnitudes.slice(0, -1).join(", ")} and ${magnitudes.at(-1)}` : (magnitudes[0] ?? "");

  return { site, field, meta, error, name, headline, exaggeration, setExaggeration, showMotion, setShowMotion, blend, scrub, playing, togglePlay, resetKey, reset: () => setResetKey((k) => k + 1), location };
}

export type MotionState = ReturnType<typeof useMotion>;

export function MotionStage({ m }: { m: MotionState }) {
  return (
    <div className={styles.stage}>
      {m.field && <Terrain key={m.site} field={m.field} exaggeration={m.exaggeration} blend={m.blend} showMotion={m.showMotion} resetKey={m.resetKey} />}
    </div>
  );
}

export function MotionFacts({ m }: { m: MotionState }) {
  if (m.error) return <p className={styles.note}>Couldn&rsquo;t load the ground motion. {m.error}</p>;
  if (!m.field || !m.meta) return <p className={styles.note}>Loading ground motion</p>;
  const { pair, displacement, quakes, coherence } = m.meta;
  const quake = quakes[0];
  const look = LOOK[pair.direction];
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
          <dd>
            Ground moved toward the satellite, mostly {look.toward}. The satellite {look.flight}.
          </dd>
        </div>
        <div>
          <dt>
            <span className={styles.swatch} style={{ background: `rgb(${RAMP[0].join(" ")})` }} aria-hidden />
            Red
          </dt>
          <dd>Ground moved away from it, mostly {look.away}.</dd>
        </div>
        <div>
          <dt>Faded</dt>
          <dd>The radar could not measure reliably there (coherence below {coherence.threshold}): water, dense forest, or steep slopes.</dd>
        </div>
      </dl>
      <p className={styles.source}>
        NISAR GUNW, track {pair.track} {pair.direction}, frame {pair.frame}. Terrain from {m.meta.source.dem_product}.
        {quake && otherQuakes(m.meta, quake).join("")}
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
