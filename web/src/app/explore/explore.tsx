"use client";

import { MapPin, Pause, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/logo";
import atlas from "@/app/map/atlas.module.css";
import { Tabs } from "@/app/map/rail";
import { type Field, loadField } from "./field";
import { RAMP, Terrain } from "./terrain";
import styles from "./explore.module.css";

const SITE = "venezuela";
const SWEEP_MS = 4000;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const cm = (v: number) => `${Math.round(Math.abs(v))} cm`;

function Facts({ field }: { field: Field }) {
  const { pair, displacement, quakes, coherence } = field.meta;
  const quake = quakes[0];
  const daysIn = quake ? Math.round((Date.parse(quake.time) - Date.parse(pair.reference)) / 86_400_000) : null;
  return (
    <dl className={styles.facts}>
      <div>
        <dt>Passes</dt>
        <dd>
          {day(pair.reference)} and {day(pair.secondary)} 2026, {pair.days} days apart.
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
  );
}

function Legend({ limit }: { limit: number }) {
  const stops = RAMP.map((c, i) => `rgb(${c.join(" ")}) ${(i / (RAMP.length - 1)) * 100}%`).join(", ");
  return (
    <figure className={styles.legend} aria-label={`Color scale from ${limit} cm away to ${limit} cm toward the satellite`}>
      <div className={styles.legendBar} style={{ background: `linear-gradient(to right, ${stops})` }} />
      <figcaption className={styles.legendTicks}>
        <span>{limit} cm away</span>
        <span>0</span>
        <span>{limit} cm toward</span>
      </figcaption>
    </figure>
  );
}

export function Explore() {
  const [field, setField] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exaggeration, setExaggeration] = useState(3);
  const [showMotion, setShowMotion] = useState(true);
  const [blend, setBlend] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    loadField(SITE).then(setField, (e: Error) => setError(e.message));
  }, []);

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

  const meta = field?.meta;
  const quake = meta?.quakes[0];

  return (
    <div className={atlas.atlas}>
      <aside className={atlas.rail}>
        <header className={atlas.railHead}>
          <Link href="/" className={atlas.wordmark}>
            <LogoMark className={atlas.logo} />
            Distill
          </Link>
        </header>
        <Tabs current="explore" />
        <div className={atlas.section}>
          <h1 className={atlas.sectionTitle}>Ground motion after the Venezuela earthquakes</h1>
          <p className={atlas.sectionDesc}>How far the ground moved toward or away from NISAR between two radar passes, shown on the terrain.</p>
        </div>
        {error && <p className={atlas.note}>Could not load the data. {error}</p>}
        {field && <Facts field={field} />}
        {meta && (
          <p className={styles.source}>
            NISAR GUNW, track {meta.pair.track} {meta.pair.direction}, frame {meta.pair.frame}. Terrain from {meta.source.dem_product}.
            {quake &&
              meta.nearby_quakes.map((q) => {
                const seconds = Math.round((Date.parse(q.time) - Date.parse(quake.time)) / 1000);
                return ` An M${q.magnitude.toFixed(1)} shock struck ${seconds} seconds later, ${Math.round(q.km_from_main / 5) * 5} km away near ${q.place.replace(/^.* of /, "")}, outside this view. The radar pair holds the motion from both.`;
              })}
          </p>
        )}
      </aside>

      <main className={atlas.card}>
        <div className={atlas.toolbar}>
          <div className={atlas.field}>
            <MapPin className={atlas.icon} style={{ color: "var(--ink-3)" }} aria-hidden />
            {meta ? (
              <span>
                {meta.place} <span className={atlas.fieldSep}>/</span>{" "}
                <span className={atlas.fieldMuted}>
                  {day(meta.pair.reference)} to {day(meta.pair.secondary)} 2026
                </span>{" "}
                <span className={atlas.fieldSep}>/</span> <span className={atlas.fieldMuted}>{meta.extent_km} km across</span>
              </span>
            ) : (
              <span className={atlas.fieldMuted}>Loading</span>
            )}
          </div>
          <button className={atlas.iconBtn} onClick={() => setResetKey((k) => k + 1)} aria-label="Reset view" title="Reset view">
            <RotateCcw className={atlas.icon} aria-hidden />
          </button>
        </div>

        <div className={styles.stage}>
          {field && <Terrain field={field} exaggeration={exaggeration} blend={blend} showMotion={showMotion} resetKey={resetKey} />}
        </div>

        <footer className={styles.footer}>
          <div className={styles.group}>
            <button
              className={atlas.play}
              onClick={() => {
                if (!playing && blend >= 1) setBlend(0);
                setPlaying((p) => !p);
              }}
              disabled={!showMotion}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            </button>
            <label className={styles.slider}>
              <span className={styles.sliderHead}>
                <span>{meta ? `${day(meta.pair.reference)} pass` : "First pass"}</span>
                <span className={styles.value}>{Math.round(blend * 100)}% of the measured motion</span>
                <span>{meta ? `${day(meta.pair.secondary)} pass` : "Second pass"}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={blend}
                disabled={!showMotion}
                onChange={(e) => {
                  setPlaying(false);
                  setBlend(Number(e.target.value));
                }}
              />
              <span className={styles.hint}>A linear blend between two passes. The radar saw only the before and after.</span>
            </label>
          </div>

          <label className={`${styles.slider} ${styles.narrow}`}>
            <span className={styles.sliderHead}>
              <span>Height</span>
              <span className={styles.value}>{exaggeration}x</span>
            </span>
            <input type="range" min={1} max={6} step={0.5} value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} />
            <span className={styles.hint}>Vertical exaggeration</span>
          </label>

          <div className={styles.group}>
            <div className={styles.segmented} role="group" aria-label="Color the terrain by">
              <button aria-pressed={showMotion} onClick={() => setShowMotion(true)}>
                Motion
              </button>
              <button aria-pressed={!showMotion} onClick={() => setShowMotion(false)}>
                Terrain
              </button>
            </div>
            {meta && <Legend limit={meta.displacement.limit} />}
          </div>
        </footer>
      </main>
    </div>
  );
}
