"use client";

import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CHANGE_TYPES, type ChangeType } from "@/lib/change-types";
import { area, longDate, percent } from "@/lib/format";
import type { ChangeEvent, EventStatus, RadarManifest, SiteSummary } from "@/lib/types";
import { Lifecycle } from "./lifecycle";
import { MapView, type EventShapes, type Radar, type SitePoint } from "./map-view";
import { Timeline } from "./timeline";
import { readViewState, writeViewState, type Camera } from "./url-state";
import styles from "./atlas.module.css";

const PLAY_MS = 1100;

function dominant(counts: SiteSummary["counts"]): ChangeType {
  const entries = Object.entries(counts).filter(([t]) => t !== "other") as [ChangeType, number][];
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}

function statusLine(e: ChangeEvent): string {
  const lines: Record<EventStatus, string> = {
    recovered: e.recovery ? `Back to normal by ${longDate(e.recovery)}` : "Back to normal",
    growing: "Still growing at the latest pass",
    stable: "Still there at the latest pass",
    receding: "Shrinking at the latest pass",
  };
  return lines[e.status];
}

export function Atlas() {
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [radar, setRadar] = useState<RadarManifest | null>(null);
  const [pass, setPass] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<ChangeType>>(new Set());
  const [playing, setPlaying] = useState(false);
  const [radarOn, setRadarOn] = useState(true);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [initial] = useState(() => (typeof window === "undefined" ? null : readViewState(window.location.search)));
  const [selected, setSelected] = useState<string | null>(initial?.event ?? null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const site = sites?.find((s) => s.id === siteId) ?? null;
  const passes = useMemo(() => site?.passes ?? [], [site]);
  const event = events.find((e) => e.id === selected) ?? null;

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`sites ${r.status}`))))
      .then((rows: SiteSummary[]) => {
        setSites(rows);
        if (initial?.site && rows.some((s) => s.id === initial.site)) {
          setSiteId(initial.site);
          if (!initial.camera) setFocusKey(`${initial.site}:url`);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [initial]);

  useEffect(() => {
    if (!siteId) return;
    let live = true;
    Promise.all([
      fetch(`/api/sites/${siteId}`).then((r) => r.json() as Promise<ChangeEvent[]>),
      fetch(`/radar/${siteId}/index.json`).then((r) => (r.ok ? (r.json() as Promise<RadarManifest>) : null)),
    ]).then(([evs, man]) => {
      if (!live) return;
      setEvents(evs);
      setRadar(man);
    });
    return () => {
      live = false;
    };
  }, [siteId]);

  const current = useMemo(() => {
    if (!site) return null;
    const has = (d: string | null | undefined): d is string => !!d && site.passes.some((x) => x.date === d);
    if (has(pass)) return pass;
    const fromUrl = initial?.site === site.id ? initial.pass : null;
    if (has(fromUrl)) return fromUrl;
    return site.passes.find((x) => !x.baseline)?.date ?? site.passes[0].date;
  }, [site, pass, initial]);

  useEffect(() => {
    writeViewState({ site: siteId, event: selected, pass: current, camera });
  }, [siteId, selected, current, camera]);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!passes.length || !current) return;
      const i = passes.findIndex((p) => p.date === current);
      const next = passes[Math.min(Math.max(i + dir, 0), passes.length - 1)];
      setPass(next.date);
    },
    [passes, current],
  );

  useEffect(() => {
    if (!playing || !current) return;
    const t = setTimeout(() => {
      const i = passes.findIndex((p) => p.date === current);
      if (i >= passes.length - 1) setPlaying(false);
      else setPass(passes[i + 1].date);
    }, PLAY_MS);
    return () => clearTimeout(t);
  }, [playing, current, passes]);

  const chooseSite = useCallback((id: string) => {
    setSiteId(id);
    setSelected(null);
    setEvents([]);
    setRadar(null);
    setPass(null);
    setHidden(new Set());
    setFocusKey(`${id}:${Date.now()}`);
    setPlaying(true);
  }, []);

  const backToGlobe = useCallback(() => {
    setSiteId(null);
    setSelected(null);
    setEvents([]);
    setRadar(null);
    setPlaying(false);
    setFocusKey(`world:${Date.now()}`);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === " " && siteId) {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Escape") {
        if (selected) setSelected(null);
        else if (siteId) backToGlobe();
      } else if (sites && /^[1-9]$/.test(e.key)) {
        const s = sites[Number(e.key) - 1];
        if (s) chooseSite(s.id);
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, siteId, selected, sites, chooseSite, backToGlobe]);

  const sitePoints = useMemo<SitePoint>(
    () => ({
      type: "FeatureCollection",
      features: (sites ?? []).map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [(s.bbox[0] + s.bbox[2]) / 2, (s.bbox[1] + s.bbox[3]) / 2] },
        properties: { id: s.id, name: s.name, color: CHANGE_TYPES[dominant(s.counts)].color },
      })),
    }),
    [sites],
  );

  const shapes = useMemo<EventShapes>(
    () => ({
      type: "FeatureCollection",
      features: events.flatMap((e) => {
        if (hidden.has(e.change_type)) return [];
        const fp = e.footprint_by_pass.find((f) => f.date === current);
        if (!fp) return [];
        return [
          {
            type: "Feature" as const,
            id: e.id,
            geometry: fp.geometry,
            properties: { id: e.id, type: e.change_type, color: CHANGE_TYPES[e.change_type].color, title: e.title ?? CHANGE_TYPES[e.change_type].label },
          },
        ];
      }),
    }),
    [events, current, hidden],
  );

  const radarImage = useMemo<Radar>(() => {
    const frame = radar?.frames.find((f) => f.date === current);
    return radar && frame ? { url: `/radar/${radar.site}/${frame.image}`, coordinates: radar.coordinates } : null;
  }, [radar, current]);

  const typeCounts = useMemo(() => {
    const m = new Map<ChangeType, number>();
    for (const e of events) m.set(e.change_type, (m.get(e.change_type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => (a[0] === "other" ? 1 : b[0] === "other" ? -1 : b[1] - a[1]));
  }, [events]);

  const visibleNow = shapes.features.length;
  const focus = site && focusKey?.startsWith(site.id) ? { bbox: site.bbox, key: focusKey } : null;
  const worldBox = useMemo<[number, number, number, number] | null>(() => {
    if (!sites?.length) return null;
    const pad = 25;
    return [
      Math.max(Math.min(...sites.map((s) => s.bbox[0])) - pad, -180),
      Math.max(Math.min(...sites.map((s) => s.bbox[1])) - pad, -80),
      Math.min(Math.max(...sites.map((s) => s.bbox[2])) + pad, 180),
      Math.min(Math.max(...sites.map((s) => s.bbox[3])) + pad, 80),
    ];
  }, [sites]);
  const worldFocus = worldBox && (focusKey?.startsWith("world") || (!focusKey && !initial?.camera)) ? { bbox: worldBox, key: focusKey ?? "world:start" } : null;

  return (
    <div className={styles.atlas}>
      <MapView
        sites={sitePoints}
        shapes={shapes}
        radar={radarImage}
        radarVisible={radarOn}
        selectedId={selected}
        focus={focus ?? worldFocus}
        initialCamera={initial?.camera ?? null}
        onSite={chooseSite}
        onEvent={setSelected}
        onCamera={setCamera}
      />

      <header className={styles.brand}>
        <Link href="/" className={styles.wordmark}>
          <LogoMark className={styles.logo} />
          Distill
        </Link>
        <p className={styles.lede}>Where Earth&rsquo;s surface changed this year, seen by the NISAR radar through clouds and at night.</p>
      </header>

      <nav className={styles.sites} aria-label="Sites">
        {error && <p className={styles.note}>Could not load sites. {error}</p>}
        {!sites && !error && <p className={styles.note}>Loading sites</p>}
        {sites?.map((s, i) => {
          const total = Object.values(s.counts).reduce((a, b) => a + (b ?? 0), 0);
          const t = dominant(s.counts);
          return (
            <button key={s.id} className={styles.siteRow} data-active={s.id === siteId || undefined} onClick={() => chooseSite(s.id)}>
              <span className={styles.swatch} style={{ background: CHANGE_TYPES[t].color }} aria-hidden />
              <span className={styles.siteText}>
                <span className={styles.siteName}>{s.name}</span>
                <span className={styles.sitePlace}>
                  {total} changes · {s.place}
                </span>
              </span>
              <kbd className={styles.key}>{i + 1}</kbd>
            </button>
          );
        })}
        {siteId && (
          <button className={styles.back} onClick={backToGlobe}>
            Back to the world map
          </button>
        )}
      </nav>

      {site && current && passes.length > 0 && (
        <footer className={styles.dock}>
          <div className={styles.legend}>
            {typeCounts.map(([t, n]) => (
              <button
                key={t}
                className={styles.legendItem}
                data-off={hidden.has(t) || undefined}
                aria-pressed={!hidden.has(t)}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(t)) next.delete(t);
                    else next.add(t);
                    return next;
                  })
                }
              >
                <span className={styles.swatch} style={{ background: CHANGE_TYPES[t].color }} aria-hidden />
                {CHANGE_TYPES[t].label}
                <span className={styles.count}>{n}</span>
              </button>
            ))}
            <label className={styles.toggle}>
              <input type="checkbox" checked={radarOn} onChange={(e) => setRadarOn(e.target.checked)} />
              Radar image
            </label>
            <span className={styles.visible}>{visibleNow === 0 ? "No change on this pass" : `${visibleNow} changing on this pass`}</span>
          </div>
          <Timeline passes={passes} current={current} playing={playing} onPass={(d) => { setPlaying(false); setPass(d); }} onPlay={() => setPlaying((p) => !p)} />
        </footer>
      )}

      {event && site && (
        <aside className={styles.panel} aria-label="Change details">
          <button className={styles.close} onClick={() => setSelected(null)} aria-label="Close">
            <svg viewBox="0 0 16 16" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
          <p className={styles.panelType}>
            <span className={styles.swatch} style={{ background: CHANGE_TYPES[event.change_type].color }} aria-hidden />
            {CHANGE_TYPES[event.change_type].label}
            <span className={styles.conf}>{percent(event.confidence)} confidence</span>
          </p>
          <h2 className={styles.panelTitle}>{event.title ?? CHANGE_TYPES[event.change_type].label}</h2>
          {event.summary && <p className={styles.summary}>{event.summary}</p>}

          <dl className={styles.facts}>
            <div>
              <dt>Area at peak</dt>
              <dd>{area(event.area_km2)}</dd>
            </div>
            <div>
              <dt>First seen</dt>
              <dd>{longDate(event.onset)}</dd>
            </div>
            <div>
              <dt>Peak</dt>
              <dd>{longDate(event.peak)}</dd>
            </div>
            <div>
              <dt>Now</dt>
              <dd>{statusLine(event)}</dd>
            </div>
          </dl>

          <Lifecycle
            passes={passes}
            areaByDate={new Map(event.footprint_by_pass.map((f) => [f.date, f.area_km2]))}
            color={CHANGE_TYPES[event.change_type].color}
            current={current}
            onPick={(d) => {
              setPlaying(false);
              setPass(d);
            }}
          />

          <section className={styles.why}>
            <h3>Why Distill thinks so</h3>
            <p>{event.reason}</p>
          </section>
        </aside>
      )}
    </div>
  );
}
