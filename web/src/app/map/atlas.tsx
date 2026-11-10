"use client";

import { ArrowLeft, ArrowRight, Layers, Link2, Pause, Play, Satellite } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Position } from "geojson";
import { CHANGE_TYPES, type ChangeType } from "@/lib/change-types";
import { longDate } from "@/lib/format";
import type { ChangeEvent, RadarManifest, SiteSummary } from "@/lib/types";
import { Inspector } from "./inspector";
import { MapView, type EventShapes, type Focus, type Radar, type SitePoint } from "./map-view";
import { Rail } from "./rail";
import { Timeline, type PassActivity } from "./timeline";
import { readViewState, writeViewState, type Camera } from "./url-state";
import styles from "./atlas.module.css";

const PLAY_MS = 1100;
const TYPE_ORDER = Object.keys(CHANGE_TYPES) as ChangeType[];

function dominant(counts: SiteSummary["counts"]): ChangeType {
  const entries = Object.entries(counts).filter(([t]) => t !== "other") as [ChangeType, number][];
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}

function eventBounds(e: ChangeEvent): [number, number, number, number] {
  const peak = e.footprint_by_pass.reduce((a, b) => (b.area_km2 > a.area_km2 ? b : a));
  let w = Infinity;
  let s = Infinity;
  let east = -Infinity;
  let n = -Infinity;
  const visit = (pt: Position) => {
    w = Math.min(w, pt[0]);
    east = Math.max(east, pt[0]);
    s = Math.min(s, pt[1]);
    n = Math.max(n, pt[1]);
  };
  for (const poly of peak.geometry.coordinates) for (const ring of poly) ring.forEach(visit);
  return [w, s, east, n];
}

function worldBox(sites: SiteSummary[]): [number, number, number, number] {
  const pad = 20;
  return [
    Math.max(Math.min(...sites.map((s) => s.bbox[0])) - pad, -180),
    Math.max(Math.min(...sites.map((s) => s.bbox[1])) - pad, -75),
    Math.min(Math.max(...sites.map((s) => s.bbox[2])) + pad, 180),
    Math.min(Math.max(...sites.map((s) => s.bbox[3])) + pad, 75),
  ];
}

export function Atlas() {
  const [initial] = useState(() => (typeof window === "undefined" ? null : readViewState(window.location.search)));
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [radar, setRadar] = useState<RadarManifest | null>(null);
  const [pass, setPass] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initial?.event ?? null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<ChangeType>>(new Set(["other"]));
  const [playing, setPlaying] = useState(false);
  const [radarOn, setRadarOn] = useState(true);
  const [toast, setToast] = useState<{ id: number; content: ReactNode } | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);

  const site = sites?.find((s) => s.id === siteId) ?? null;
  const passes = useMemo(() => site?.passes ?? [], [site]);
  const event = events.find((e) => e.id === selected) ?? null;

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`sites ${r.status}`))))
      .then((rows: SiteSummary[]) => {
        setSites(rows);
        const fromUrl = rows.find((s) => s.id === initial?.site);
        if (fromUrl) {
          setSiteId(fromUrl.id);
          if (!initial?.camera) setFocus({ bbox: fromUrl.bbox, key: `site:${fromUrl.id}` });
        } else if (!initial?.camera && rows.length) {
          setFocus({ bbox: worldBox(rows), key: "world:start" });
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

  const goTo = useCallback((d: string) => {
    setPlaying(false);
    setPass(d);
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!passes.length || !current) return;
      const i = passes.findIndex((p) => p.date === current);
      goTo(passes[Math.min(Math.max(i + dir, 0), passes.length - 1)].date);
    },
    [passes, current, goTo],
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

  const chooseSite = useCallback(
    (id: string) => {
      const s = sites?.find((x) => x.id === id);
      if (!s) return;
      setSiteId(id);
      setSelected(null);
      setHovered(null);
      setEvents([]);
      setRadar(null);
      setPass(null);
      setHidden(new Set(["other"]));
      setFocus({ bbox: s.bbox, key: `site:${id}:${Date.now()}` });
    },
    [sites],
  );

  const backToWorld = useCallback(() => {
    setSiteId(null);
    setSelected(null);
    setHovered(null);
    setEvents([]);
    setRadar(null);
    setPlaying(false);
    if (sites?.length) setFocus({ bbox: worldBox(sites), key: `world:${Date.now()}` });
  }, [sites]);

  const chooseEvent = useCallback(
    (id: string | null, fly = false) => {
      setSelected(id);
      const e = id ? events.find((x) => x.id === id) : null;
      if (!e) return;
      if (fly) setFocus({ bbox: eventBounds(e), key: `event:${id}:${Date.now()}`, maxZoom: 12 });
      if (current && !e.footprint_by_pass.some((f) => f.date === current)) setPass(e.peak);
    },
    [events, current],
  );

  const flash = useCallback((content: ReactNode) => setToast({ id: Date.now(), content }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 900);
    return () => clearTimeout(t);
  }, [toast]);

  const togglePlay = useCallback(() => {
    flash(playing ? <Pause aria-hidden /> : <Play aria-hidden />);
    setPlaying(!playing);
  }, [flash, playing]);

  const share = useCallback(() => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => flash(<small>Link copied</small>),
      () => flash(<small>Copy failed</small>),
    );
  }, [flash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") {
        step(1);
        flash("→");
      } else if (e.key === "ArrowLeft") {
        step(-1);
        flash("←");
      } else if (e.key === " " && siteId) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "Escape") {
        if (selected) setSelected(null);
        else if (siteId) backToWorld();
      } else if (sites && /^[1-9]$/.test(e.key)) {
        const s = sites[Number(e.key) - 1];
        if (s) {
          chooseSite(s.id);
          flash(e.key);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, siteId, selected, sites, chooseSite, backToWorld, flash, togglePlay]);

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

  const activeIds = useMemo(() => new Set(shapes.features.map((f) => f.properties.id)), [shapes]);

  const activity = useMemo<PassActivity[]>(
    () =>
      passes.map((p) => {
        const sums = new Map<ChangeType, number>();
        for (const e of events) {
          if (hidden.has(e.change_type)) continue;
          const fp = e.footprint_by_pass.find((f) => f.date === p.date);
          if (fp) sums.set(e.change_type, (sums.get(e.change_type) ?? 0) + fp.area_km2);
        }
        const byType = TYPE_ORDER.filter((t) => sums.has(t)).map((t) => [t, sums.get(t) ?? 0] as [ChangeType, number]);
        return { date: p.date, byType, total: byType.reduce((a, [, v]) => a + v, 0) };
      }),
    [passes, events, hidden],
  );

  const radarImage = useMemo<Radar>(() => {
    const frame = radar?.frames.find((f) => f.date === current);
    return radar && frame ? { url: `/radar/${radar.site}/${frame.image}`, coordinates: radar.coordinates } : null;
  }, [radar, current]);

  const passIndex = current ? passes.findIndex((p) => p.date === current) : -1;

  return (
    <div className={styles.atlas}>
      <Rail
        sites={sites}
        error={error}
        siteId={siteId}
        events={events}
        activeIds={activeIds}
        hidden={hidden}
        selectedId={selected}
        hoveredId={hovered}
        onSite={chooseSite}
        onBack={backToWorld}
        onToggleType={(t) =>
          setHidden((h) => {
            const next = new Set(h);
            if (next.has(t)) next.delete(t);
            else next.add(t);
            return next;
          })
        }
        onEvent={(id) => chooseEvent(id, true)}
        onHover={setHovered}
      />

      <main className={styles.card}>
        <div className={styles.toolbar}>
          <button className={styles.iconBtn} onClick={() => step(-1)} disabled={!site || passIndex <= 0} aria-label="Previous pass" title="Previous pass">
            <ArrowLeft className={styles.icon} aria-hidden />
          </button>
          <button className={styles.iconBtn} onClick={() => step(1)} disabled={!site || passIndex >= passes.length - 1} aria-label="Next pass" title="Next pass">
            <ArrowRight className={styles.icon} aria-hidden />
          </button>
          <div className={styles.field}>
            <Satellite className={styles.icon} style={{ color: "var(--ink-3)" }} aria-hidden />
            {site && current ? (
              <span>
                {site.name} <span className={styles.fieldSep}>/</span> <span className={styles.fieldMuted}>{longDate(current)}</span>{" "}
                <span className={styles.fieldSep}>/</span> <span className={styles.fieldMuted}>pass {passIndex + 1} of {passes.length}</span>
                {event && (
                  <>
                    {" "}
                    <span className={styles.fieldSep}>/</span> <span className={styles.fieldMuted}>{event.title}</span>
                  </>
                )}
              </span>
            ) : (
              <span className={styles.fieldMuted}>All sites, June to November 2026</span>
            )}
          </div>
          <button className={styles.ghost} onClick={() => setRadarOn((v) => !v)} aria-pressed={radarOn} disabled={!radar} title="Show the radar image under the shapes">
            <Layers className={styles.icon} aria-hidden />
            Radar
          </button>
          <button className={styles.ghost} onClick={share} title="Copy a link to this view">
            <Link2 className={styles.icon} aria-hidden />
            Share
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.mapArea}>
            <MapView
              sites={sitePoints}
              shapes={shapes}
              radar={radarImage}
              radarOpacity={radarOn ? 0.38 : 0}
              selectedId={selected}
              hoveredId={hovered}
              focus={focus}
              initialCamera={initial?.camera ?? null}
              rightInset={0}
              onSite={chooseSite}
              onEvent={(id) => chooseEvent(id)}
              onHover={setHovered}
              onCamera={setCamera}
              onCursor={setCursor}
            />
            <div className={styles.readout} aria-hidden>
              {cursor ? `${Math.abs(cursor[1]).toFixed(4)}° ${cursor[1] >= 0 ? "N" : "S"}   ${Math.abs(cursor[0]).toFixed(4)}° ${cursor[0] >= 0 ? "E" : "W"}` : ""}
            </div>
            {toast && (
              <div key={toast.id} className={styles.toast} role="status">
                {toast.content}
              </div>
            )}
          </div>
          {event && site && current && <Inspector event={event} passes={passes} current={current} onPick={goTo} onClose={() => setSelected(null)} />}
        </div>

        {site && current && passes.length > 0 ? (
          <Timeline passes={passes} activity={activity} current={current} playing={playing} onPass={goTo} onPlay={togglePlay} />
        ) : (
          <div className={styles.timelineEmpty}>Pick a site to step through its satellite passes.</div>
        )}
      </main>
    </div>
  );
}
