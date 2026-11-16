"use client";

import {
  BookOpen,
  ChevronDown,
  Expand,
  Layers,
  Link2,
  List,
  Map as MapIcon,
  Minus,
  Mountain,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanSearch,
  Search,
  Repeat,
  SkipBack,
  SkipForward,
  SquareDashed,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Position } from "geojson";
import { CommandPalette, CommandTrigger, openCommandPalette } from "@/components/command/command-palette";
import { LogoMark } from "@/components/logo";
import { Tour, TourButton } from "@/components/tour/tour";
import { tour } from "@/components/tour/store";
import { CHANGE_TYPES, swatch, type ChangeType } from "@/lib/change-types";
import { area, longDate, shortDate } from "@/lib/format";
import type { ChangeEvent, RadarManifest, SiteSummary } from "@/lib/types";
import { MotionBlend, MotionFacts, MotionStage, MotionTools, useMotion } from "@/app/explore/explore";
import { Feed } from "@/app/watch/feed";
import { reduce, type Flow } from "@/app/watch/flow";
import { bboxPolygon, isNews, type BBox, type CheckResult, type Watch } from "@/app/watch/model";
import { findSimilar, Inspector, STATUS, type Similar } from "./inspector";
import { EXPLORE_SITE, isTyping } from "./links";
import { MapView, type EventShapes, type Focus, type MapLibre, type Radar, type SitePoint } from "./map-view";
import { readViewState, writeViewState, type Camera } from "./url-state";
import styles from "./atlas.module.css";
import ui from "./ui.module.css";

const PLAY_MS = 1100;
const REPLAY_MS = 1000;
const START_SITE = "kaiser";
const TYPE_ORDER = Object.keys(CHANGE_TYPES) as ChangeType[];

function dominant(counts: SiteSummary["counts"]): ChangeType {
  const entries = Object.entries(counts).filter(([t]) => t !== "other") as [ChangeType, number][];
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}

function eventBounds(e: ChangeEvent): BBox {
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

const eventFocus = (e: ChangeEvent): Focus => ({ bbox: eventBounds(e), key: `event:${e.id}:${Date.now()}`, maxZoom: 12 });

function worldBox(sites: SiteSummary[]): BBox {
  const pad = 20;
  return [
    Math.max(Math.min(...sites.map((s) => s.bbox[0])) - pad, -180),
    Math.max(Math.min(...sites.map((s) => s.bbox[1])) - pad, -75),
    Math.min(Math.max(...sites.map((s) => s.bbox[2])) + pad, 180),
    Math.min(Math.max(...sites.map((s) => s.bbox[3])) + pad, 75),
  ];
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

// Spherical approximation for the naming step; the stored area comes from PostGIS.
function boxKm2([w, s, e, n]: BBox) {
  const R = 6371;
  const rad = Math.PI / 180;
  return R * R * Math.abs((e - w) * rad) * Math.abs(Math.sin(n * rad) - Math.sin(s * rad));
}

export function Atlas() {
  const [initial] = useState(() => readViewState(window.location.search));
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState<string | null>(initial.site === EXPLORE_SITE ? EXPLORE_SITE : null);
  const [events, setEvents] = useState<ChangeEvent[]>([]);
  const [radar, setRadar] = useState<RadarManifest | null>(null);
  const [pass, setPass] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(initial.event);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<ChangeType>>(new Set(["other"]));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [loop, setLoop] = useState(false);
  const [radarOn, setRadarOn] = useState(true);
  const [toast, setToast] = useState<{ id: number; content: ReactNode } | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [similar, setSimilar] = useState<Similar>({ state: "idle" });
  const [flow, dispatch] = useReducer(reduce, { step: "site" } as Flow);
  const [watchName, setWatchName] = useState(initial.name);
  const pendingEvent = useRef<string | null>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useSearchParams();

  const is3D = siteId === EXPLORE_SITE;
  const motion = useMotion(is3D);
  const site = sites?.find((s) => s.id === siteId) ?? null;
  const passes = useMemo(() => site?.passes ?? [], [site]);
  const event = events.find((e) => e.id === selected) ?? null;
  const mode: "map" | "watch" | "3d" = is3D ? "3d" : flow.step !== "site" ? "watch" : "map";

  const flash = useCallback((content: ReactNode) => setToast({ id: Date.now(), content }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1100);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => json<SiteSummary[]>(r))
      .then((rows) => {
        setSites(rows);
        // No params: land on Kaiser Canyon with the passes already playing.
        const startId = initial.empty ? START_SITE : initial.site;
        const start = rows.find((s) => s.id === startId);
        if (start) {
          setSiteId(start.id);
          if (!initial.camera) setFocus({ bbox: initial.bbox ?? start.bbox, key: `site:${start.id}` });
          if (initial.empty) setPlaying(true);
          if (initial.draw) {
            dispatch({ type: "site", site: start.id });
            if (initial.bbox) dispatch({ type: "propose", site: start.id, bbox: initial.bbox });
          }
        } else if (!initial.camera && rows.length && initial.site !== EXPLORE_SITE) {
          setFocus({ bbox: worldBox(rows), key: "world:start" });
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [initial]);

  useEffect(() => {
    if (!siteId || siteId === EXPLORE_SITE) return;
    let live = true;
    Promise.all([
      fetch(`/api/sites/${siteId}`).then((r) => r.json() as Promise<ChangeEvent[]>),
      fetch(`/radar/${siteId}/index.json`).then((r) => (r.ok ? (r.json() as Promise<RadarManifest>) : null)),
    ]).then(([evs, man]) => {
      if (!live) return;
      setEvents(evs);
      setRadar(man);
      const picked = evs.find((e) => e.id === pendingEvent.current);
      pendingEvent.current = null;
      if (picked) {
        setSelected(picked.id);
        setFocus(eventFocus(picked));
        setPass(picked.peak);
      }
    });
    return () => {
      live = false;
    };
  }, [siteId]);

  const current = useMemo(() => {
    if (!site) return null;
    const has = (d: string | null | undefined): d is string => !!d && site.passes.some((x) => x.date === d);
    if (has(pass)) return pass;
    const fromUrl = initial.site === site.id ? initial.pass : null;
    if (has(fromUrl)) return fromUrl;
    return site.passes.find((x) => !x.baseline)?.date ?? site.passes[0].date;
  }, [site, pass, initial]);

  useEffect(() => {
    writeViewState({ site: siteId, event: is3D ? null : selected, pass: is3D ? null : current, camera: is3D ? null : camera });
  }, [siteId, is3D, selected, current, camera]);

  const goTo = useCallback((d: string) => {
    setPlaying(false);
    setPass(d);
  }, []);

  const passIndex = current ? passes.findIndex((p) => p.date === current) : -1;

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!passes.length || passIndex < 0) return;
      goTo(passes[Math.min(Math.max(passIndex + dir, 0), passes.length - 1)].date);
    },
    [passes, passIndex, goTo],
  );

  useEffect(() => {
    if (!playing || !current) return;
    const t = setTimeout(() => {
      const i = passes.findIndex((p) => p.date === current);
      if (i < passes.length - 1) setPass(passes[i + 1].date);
      else if (loop) setPass(passes.find((p) => !p.baseline)?.date ?? passes[0].date);
      else setPlaying(false);
    }, PLAY_MS / speed);
    return () => clearTimeout(t);
  }, [playing, current, passes, speed, loop]);

  const chooseSite = useCallback(
    (id: string) => {
      setMenuOpen(false);
      dispatch({ type: "close" });
      setSelected(null);
      setHovered(null);
      setPlaying(false);
      setPass(null);
      if (id === EXPLORE_SITE) {
        setSiteId(EXPLORE_SITE);
        return;
      }
      const s = sites?.find((x) => x.id === id);
      if (!s) return;
      setSiteId(id);
      setEvents([]);
      setRadar(null);
      setHidden(new Set(["other"]));
      setFocus({ bbox: s.bbox, key: `site:${id}:${Date.now()}` });
    },
    [sites],
  );

  const backToWorld = useCallback(() => {
    setMenuOpen(false);
    dispatch({ type: "close" });
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
      setPlaying(false);
      if (fly) setFocus(eventFocus(e));
      if (current && !e.footprint_by_pass.some((f) => f.date === current)) setPass(e.peak);
    },
    [events, current],
  );

  // Opens a change anywhere in the data: in place on this site, or by switching site first.
  const openChange = useCallback(
    ({ site: target, id }: { site: string; id: string }) => {
      if (target === siteId) return chooseEvent(id, true);
      chooseSite(target);
      pendingEvent.current = id;
    },
    [siteId, chooseEvent, chooseSite],
  );

  // Follow URL changes made by others (the palette, the tour) while mounted. Our own replaceState
  // writes also land here, and match the state they came from, so they are no-ops.
  const seen = useRef(params.toString());
  const live = useRef({ siteId, selected, current, chooseSite, openChange });
  useEffect(() => {
    live.current = { siteId, selected, current, chooseSite, openChange };
  });
  useEffect(() => {
    const qs = params.toString();
    if (!sites || qs === seen.current) return;
    seen.current = qs;
    const now = live.current;
    const site = params.get("site");
    const id = params.get("event");
    const at = params.get("pass");
    if (site && id && (site !== now.siteId || id !== now.selected)) now.openChange({ site, id });
    else if (site && site !== now.siteId) now.chooseSite(site);
    if (at && at !== now.current) setPass(at);
  }, [params, sites]);

  useEffect(() => {
    const open = () => tour.open();
    window.addEventListener("distill:tour", open);
    return () => window.removeEventListener("distill:tour", open);
  }, []);

  const togglePlay = useCallback(() => {
    if (is3D) return motion.togglePlay();
    if (!site) return;
    flash(playing ? <Pause aria-hidden /> : <Play aria-hidden />);
    if (!playing && passIndex >= passes.length - 1) setPass(passes.find((p) => !p.baseline)?.date ?? passes[0].date);
    setPlaying(!playing);
  }, [is3D, motion, site, flash, playing, passIndex, passes]);

  const share = useCallback(() => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => flash(<small>Link copied</small>),
      () => flash(<small>Copy failed</small>),
    );
  }, [flash]);

  const startWatch = useCallback(
    (bbox?: BBox, name?: string) => {
      const id = site?.id ?? START_SITE;
      if (!site) chooseSite(id);
      setSelected(null);
      setPlaying(false);
      dispatch({ type: "site", site: id });
      if (bbox) {
        dispatch({ type: "propose", site: id, bbox });
        setWatchName(name?.slice(0, 80) ?? "");
      }
    },
    [site, chooseSite],
  );

  const find = useCallback((id: string) => {
    setSimilar({ state: "loading", from: id });
    findSimilar(id).then((r) => setSimilar((s) => (s.state === "loading" && s.from === id ? r : s)));
  }, []);

  // Watch, in place: create the watch, then check it pass by pass while the filmstrip steps.
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (flow.step !== "name" || !watchName.trim()) return;
    dispatch({ type: "save" });
    fetch("/api/watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: watchName.trim(), site: flow.site, area: bboxPolygon(flow.bbox) }),
    })
      .then((r) => json<Watch>(r))
      .then((w) => {
        dispatch({ type: "open", watch: w });
        dispatch({ type: "replay" });
      })
      .catch((err: Error) => dispatch({ type: "saveFailed", error: err.message }));
  };

  const watchId = flow.step === "watch" ? flow.watch.id : null;
  const watching = flow.step === "watch" ? flow.watch.name : null;
  const running = flow.step === "watch" && flow.replay.status === "running" ? flow.replay.next : null;

  useEffect(() => {
    if (running === null || !watchId || !watching || !passes.length) return;
    let live = true;
    const index = running;
    const t = setTimeout(
      () => {
        setPass(passes[index].date);
        fetch(`/api/watch/${watchId}/check`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pass_date: passes[index].date }),
        })
          .then((r) => json<CheckResult>(r))
          .then((result) => {
            if (!live) return;
            dispatch({ type: "checked", watchId, index, total: passes.length, result });
            if (result.changes.some(isNews)) flash(<small>New change in {watching}</small>);
          })
          .catch((err: Error) => live && dispatch({ type: "checkFailed", watchId, error: err.message }));
      },
      index === 0 ? 0 : REPLAY_MS / speed,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [running, watchId, watching, passes, flash, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.key === "ArrowRight" && !is3D) {
        step(1);
        flash("→");
      } else if (e.key === "ArrowLeft" && !is3D) {
        step(-1);
        flash("←");
      } else if (e.key === " " && siteId) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "Escape") {
        if (menuOpen) setMenuOpen(false);
        else if (flow.step !== "site") dispatch({ type: "close" });
        else if (selected) setSelected(null);
        else if (panelOpen) setPanelOpen(false);
        else if (siteId) backToWorld();
      } else if (sites && /^[1-9]$/.test(e.key)) {
        const n = Number(e.key);
        const id = n <= sites.length ? sites[n - 1].id : n === sites.length + 1 ? EXPLORE_SITE : null;
        if (id) {
          chooseSite(id);
          flash(e.key);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, siteId, is3D, selected, sites, menuOpen, panelOpen, flow.step, chooseSite, backToWorld, flash, togglePlay]);

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
  const counts = useMemo(() => {
    const m = new Map<ChangeType, number>();
    for (const e of events) m.set(e.change_type, (m.get(e.change_type) ?? 0) + 1);
    return m;
  }, [events]);
  const visible = events.filter((e) => !hidden.has(e.change_type));
  const perPass = useMemo(
    () => new Map(passes.map((p) => [p.date, events.filter((e) => !hidden.has(e.change_type) && e.footprint_by_pass.some((f) => f.date === p.date)).length])),
    [passes, events, hidden],
  );
  const biggest = visible.reduce<ChangeEvent | null>((a, e) => (!a || e.area_km2 > a.area_km2 ? e : a), null);

  const film = useRef<HTMLDivElement>(null);
  useEffect(() => {
    film.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [current]);

  const radarImage = useMemo<Radar>(() => {
    const frame = radar?.frames.find((f) => f.date === current);
    return radar && frame ? { url: `/radar/${radar.site}/${frame.image}`, coordinates: radar.coordinates } : null;
  }, [radar, current]);

  const similarShown = similar.state !== "idle" && event && (similar.from === event.id || (similar.state === "done" && similar.rows.some((r) => r.id === event.id)));
  const highlightIds = useMemo(() => (similar.state === "done" ? similar.rows.filter((r) => r.site === siteId).map((r) => r.id) : []), [similar, siteId]);

  const replay = flow.step === "watch" ? flow.replay : null;
  const areaShape = flow.step === "name" ? bboxPolygon(flow.bbox) : flow.step === "watch" ? flow.watch.area : null;
  const drawing = (flow.step === "draw" && flow.drawing) || flow.step === "name";
  const alertCount = replay && replay.status !== "idle" ? replay.feed.reduce((n, f) => n + f.changes.filter(isNews).length, 0) : 0;

  const switcherLabel = is3D ? "Venezuela earthquake" : (site?.name ?? "All sites");
  const crumb = is3D ? motion.location.join(" · ") : site && current ? `${longDate(current)} · pass ${passIndex + 1} of ${passes.length}` : "June to November 2026";

  const hint = drawing
    ? flow.step === "name"
      ? "Drag again to redraw the box."
      : "Drag a box over the area to watch. Esc cancels."
    : site && !event && flow.step === "site"
      ? "Click any shape to see why."
      : null;

  return (
    <div className={styles.app}>
      <CommandPalette />
      <Tour navigate={(href) => router.push(href)} />
      <Link href="/" className={styles.logoCell} aria-label="Distill home" title="Distill">
        <LogoMark className={ui.logo} />
      </Link>

      <header className={styles.top}>
        <div className={styles.switcher}>
          <button className={styles.pillBtn} style={{ color: "var(--ink)", fontSize: 14 }} onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu">
            {switcherLabel}
            <ChevronDown className={ui.icon} style={{ color: "var(--ink-3)" }} aria-hidden />
          </button>
          {menuOpen && (
            <ul className={styles.menu} role="menu">
              {error && <li className={ui.note}>Couldn&rsquo;t load sites. {error}</li>}
              {sites?.map((s, i) => {
                const total = Object.values(s.counts).reduce((a, b) => a + (b ?? 0), 0);
                return (
                  <li key={s.id}>
                    <button className={`${ui.row} ${ui.rowCompact}`} data-selected={s.id === siteId || undefined} role="menuitem" onClick={() => chooseSite(s.id)}>
                      <span className={ui.dot} style={{ background: swatch(dominant(s.counts)) }} aria-hidden />
                      <span className={ui.rowText}>
                        <span className={ui.rowLabel}>{s.name}</span>
                        <span className={ui.rowSub}>
                          {total} changes · {s.passes.length} passes
                        </span>
                      </span>
                      <kbd className={ui.cap}>{i + 1}</kbd>
                    </button>
                  </li>
                );
              })}
              {sites && (
                <li>
                  <button className={`${ui.row} ${ui.rowCompact}`} data-selected={is3D || undefined} role="menuitem" onClick={() => chooseSite(EXPLORE_SITE)}>
                    <Mountain className={ui.icon} style={{ color: "var(--ink-3)" }} aria-hidden />
                    <span className={ui.rowText}>
                      <span className={ui.rowLabel}>Venezuela earthquake</span>
                      <span className={ui.rowSub}>Ground motion · 2 passes</span>
                    </span>
                    <span className={ui.tag}>3D</span>
                    <kbd className={ui.cap}>{sites.length + 1}</kbd>
                  </button>
                </li>
              )}
              <li>
                <button className={`${ui.row} ${ui.rowCompact}`} role="menuitem" onClick={backToWorld}>
                  <MapIcon className={ui.icon} style={{ color: "var(--ink-3)" }} aria-hidden />
                  <span className={ui.rowLabel}>All sites</span>
                </button>
              </li>
            </ul>
          )}
        </div>
        <span className={styles.crumbSep}>/</span>
        <span className={styles.crumbMuted}>{crumb}</span>
        <span className={styles.topEnd}>
          <CommandTrigger className={styles.ask} />
          <TourButton />
          <button className={ui.ghost} onClick={share} title="Copy a link to this view">
            <Link2 className={ui.icon} aria-hidden />
            Share
          </button>
        </span>
      </header>

      <nav className={styles.rail} aria-label="Tools">
        <button className={styles.railBtn} aria-pressed={panelOpen} disabled={!site} onClick={() => setPanelOpen((o) => !o)} aria-label="Changes" title="Changes on this site">
          <List className={ui.icon} aria-hidden />
        </button>
        <button className={styles.railBtn} onClick={openCommandPalette} aria-label="Ask" title="Ask (⌘K)">
          <Search className={ui.icon} aria-hidden />
        </button>
        <button className={styles.railBtn} aria-pressed={mode === "watch"} onClick={() => (mode === "watch" ? dispatch({ type: "close" }) : startWatch())} aria-label="Watch" title="Watch an area">
          <SquareDashed className={ui.icon} aria-hidden />
        </button>
        <button className={styles.railBtn} aria-pressed={is3D} onClick={() => chooseSite(EXPLORE_SITE)} aria-label="3D" title="Ground motion in 3D">
          <Mountain className={ui.icon} aria-hidden />
        </button>
        <span className={styles.railRule} />
        <Link className={styles.railBtn} href="/writeup" aria-label="Writeup" title="Writeup">
          <BookOpen className={ui.icon} aria-hidden />
        </Link>
      </nav>

      <div className={styles.canvas} ref={canvasRef}>
        {is3D ? (
          <>
            <MotionStage m={motion} />
            <div className={styles.tl} style={{ maxWidth: "none" }}>
              <MotionTools m={motion} pill={styles.pill} />
            </div>
            <div className={styles.tr}>
              <span className={styles.pill}>
                <button className={styles.pillBtn} onClick={motion.reset} aria-label="Reset view" title="Reset view">
                  <RotateCcw className={ui.icon} aria-hidden />
                </button>
              </span>
            </div>
            <aside className={styles.factsCard} style={{ top: 58 }}>
              <MotionFacts m={motion} />
            </aside>
          </>
        ) : (
          <>
            <div className={ui.mapArea} style={{ position: "absolute", inset: 0 }}>
              <MapView
                sites={sitePoints}
                shapes={shapes}
                radar={radarImage}
                radarOpacity={radarOn ? 0.38 : 0}
                selectedId={selected}
                hoveredId={hovered}
                focus={focus}
                initialCamera={initial.camera}
                rightInset={event ? 372 : 0}
                onSite={chooseSite}
                onEvent={(id) => chooseEvent(id)}
                onHover={setHovered}
                onCamera={setCamera}
                onCursor={setCursor}
                area={areaShape}
                drawing={drawing}
                onDrawn={(bbox) => dispatch({ type: "drawn", bbox })}
                highlightIds={highlightIds}
                onMap={(m) => (mapRef.current = m)}
              />
              <div className={styles.readout} aria-hidden>
                {cursor ? `${Math.abs(cursor[1]).toFixed(4)}° ${cursor[1] >= 0 ? "N" : "S"}   ${Math.abs(cursor[0]).toFixed(4)}° ${cursor[0] >= 0 ? "E" : "W"}` : ""}
              </div>
              {hint && (
                <div className={ui.mapHint} style={{ top: "auto", bottom: 16 }}>
                  {hint}
                </div>
              )}
            </div>

            <div className={styles.tl}>
              {site && counts.size > 0 && (
                <span className={styles.pill} role="group" aria-label="Show change types">
                  {TYPE_ORDER.filter((t) => counts.has(t)).map((t) => (
                    <button
                      key={t}
                      className={styles.pillBtn}
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
                      <span className={ui.dot} style={{ background: swatch(t) }} aria-hidden />
                      {CHANGE_TYPES[t].label}
                    </button>
                  ))}
                </span>
              )}
              <span className={styles.pill}>
                <button className={styles.pillBtn} onClick={() => setRadarOn((v) => !v)} aria-pressed={radarOn} disabled={!radar} title="Show the radar image under the shapes">
                  <Layers className={ui.icon} aria-hidden />
                  Radar
                </button>
              </span>
            </div>

            <div className={styles.tr}>
              <span className={styles.pill}>
                <button className={styles.pillBtn} onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in" title="Zoom in">
                  <Plus className={ui.icon} aria-hidden />
                </button>
                <button className={styles.pillBtn} onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out" title="Zoom out">
                  <Minus className={ui.icon} aria-hidden />
                </button>
                <button
                  className={styles.pillBtn}
                  onClick={() => (site ? setFocus({ bbox: site.bbox, key: `fit:${Date.now()}` }) : sites && setFocus({ bbox: worldBox(sites), key: `fit:${Date.now()}` }))}
                  aria-label="Fit"
                  title="Fit to the site"
                >
                  <ScanSearch className={ui.icon} aria-hidden />
                </button>
                <button
                  className={styles.pillBtn}
                  onClick={() => (document.fullscreenElement ? document.exitFullscreen() : canvasRef.current?.requestFullscreen())}
                  aria-label="Fullscreen"
                  title="Fullscreen"
                >
                  <Expand className={ui.icon} aria-hidden />
                </button>
              </span>
            </div>

            {panelOpen && site && (
              <aside className={styles.panel} aria-label="Changes">
                <div className={styles.panelHead}>
                  <span>
                    {visible.length} changes · {visible.filter((e) => activeIds.has(e.id)).length} on this pass
                  </span>
                  <button className={ui.iconBtn} onClick={() => setPanelOpen(false)} aria-label="Close changes" title="Close">
                    <X className={ui.icon} aria-hidden />
                  </button>
                </div>
                <ol className={ui.list} style={{ marginTop: 0 }}>
                  {visible.map((e) => (
                    <li key={e.id}>
                      <button
                        className={ui.row}
                        data-selected={e.id === selected || undefined}
                        data-hover={e.id === hovered || undefined}
                        data-inactive={!activeIds.has(e.id) || undefined}
                        onClick={() => chooseEvent(e.id, true)}
                        onMouseEnter={() => setHovered(e.id)}
                        onMouseLeave={() => setHovered(null)}
                      >
                        <span className={ui.dot} style={{ background: swatch(e.change_type) }} aria-hidden />
                        <span className={ui.rowText}>
                          <span className={ui.rowLabel}>{e.title ?? CHANGE_TYPES[e.change_type].label}</span>
                          <span className={ui.rowSub}>
                            From {shortDate(e.onset)} · {e.recovery ? `ended ${shortDate(e.recovery)}` : "ongoing"}
                          </span>
                        </span>
                        <span className={ui.rowTrail}>{area(e.area_km2)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </aside>
            )}

            {event && site && current && (
              <Inspector
                event={event}
                passes={passes}
                current={current}
                similar={similarShown ? similar : { state: "idle" }}
                onPick={goTo}
                onPickSimilar={(r) => openChange({ site: r.site, id: r.id })}
                onClose={() => setSelected(null)}
              />
            )}
          </>
        )}
        {toast && (
          <div key={toast.id} className={ui.toast} role="status">
            {toast.content}
          </div>
        )}
      </div>

      <div className={styles.dock}>
        <section className={styles.dockCard} aria-label="Passes">
          {is3D ? (
            <>
              <div className={styles.dockHead}>
                Passes <span className={styles.dockMeta}>2 · interferometric pair</span>
              </div>
              <MotionBlend m={motion} />
            </>
          ) : site && current ? (
            <>
              <div className={styles.dockHead}>
                Passes{" "}
                <span className={styles.dockMeta}>
                  {passIndex + 1} of {passes.length} · 40 m pixels
                </span>
              </div>
              <div className={styles.film} ref={film}>
                {passes.map((p) => {
                  const img = radar?.frames.find((f) => f.date === p.date)?.image;
                  const n = perPass.get(p.date) ?? 0;
                  return (
                    <button key={p.date} className={styles.frame} aria-current={p.date === current} data-baseline={p.baseline || undefined} onClick={() => goTo(p.date)} title={longDate(p.date)}>
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small static radar thumbnails, already sized
                        <img src={`/radar/${site.id}/${img}`} alt="" loading="lazy" />
                      ) : (
                        <span className={styles.frameBlank} />
                      )}
                      {p.baseline ? (
                        <span className={styles.badge} data-tag>
                          baseline
                        </span>
                      ) : (
                        n > 0 && <span className={styles.badge}>{n}</span>
                      )}
                      <span className={styles.frameDate}>{shortDate(p.date)}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className={styles.selHint}>Pick a site above to step through its passes.</p>
          )}
        </section>

        <section className={styles.dockCard} aria-label={mode === "watch" ? "Watch" : "Selection"}>
          {mode === "watch" && flow.step !== "site" ? (
            <>
              <div className={styles.dockHead}>
                Watch{" "}
                <span className={styles.dockMeta}>
                  {flow.step === "watch" ? `${alertCount === 1 ? "1 alert" : `${alertCount} alerts`} · ${flow.replay.status === "idle" ? 0 : flow.replay.feed.length} of ${passes.length} passes` : site?.name}
                </span>
                <button className={ui.iconBtn} style={{ marginLeft: "auto", width: 24, height: 24 }} onClick={() => dispatch({ type: "close" })} aria-label="Stop watching" title="Close (Esc)">
                  <X className={ui.icon} aria-hidden />
                </button>
              </div>
              {flow.step === "draw" && <p className={styles.selHint}>Drag a box on the map over the area you care about.</p>}
              {flow.step === "name" && (
                <>
                  <p className={styles.selHint}>
                    {area(boxKm2(flow.bbox))} over {site?.name}
                  </p>
                  <form className={styles.watchForm} onSubmit={save}>
                    <input className={ui.input} value={watchName} onChange={(e) => setWatchName(e.target.value)} placeholder="Name this area" maxLength={80} aria-label="Area name" />
                  </form>
                  <div className={styles.selActions}>
                    <button className={ui.action} onClick={save} disabled={!watchName.trim() || flow.saving}>
                      <Play className={ui.icon} aria-hidden />
                      {flow.saving ? "Saving" : "Replay passes"}
                    </button>
                  </div>
                  {flow.error && <p className={ui.error}>{flow.error}</p>}
                </>
              )}
              {flow.step === "watch" && (
                <div className={styles.feedWrap}>
                  {flow.replay.status === "idle" ? (
                    <button className={ui.action} onClick={() => dispatch({ type: "replay" })}>
                      <Play className={ui.icon} aria-hidden />
                      Replay passes
                    </button>
                  ) : (
                    <>
                      {flow.replay.error && <p className={ui.error}>{flow.replay.error}</p>}
                      <Feed items={flow.replay.feed} watch={flow.watch.name} total={passes.length} />
                    </>
                  )}
                </div>
              )}
            </>
          ) : is3D ? (
            <>
              <div className={styles.dockHead}>
                Ground motion <span className={styles.dockMeta}>Venezuela, M7.2 and M7.5</span>
              </div>
              <p className={styles.selHint}>Drag to orbit the terrain. Blue moved toward the satellite, red away.</p>
            </>
          ) : event ? (
            <>
              <div className={styles.dockHead}>
                <span className={ui.dot} style={{ background: swatch(event.change_type) }} aria-hidden />
                {CHANGE_TYPES[event.change_type].label}
                <span className={styles.dockMeta}>
                  {area(event.area_km2)} · {STATUS[event.status]}
                </span>
              </div>
              <p className={styles.selTitle}>{event.title ?? CHANGE_TYPES[event.change_type].label}</p>
              <div className={styles.selActions}>
                <button className={ui.action} onClick={() => find(event.id)} disabled={similar.state === "loading"} aria-pressed={!!similarShown}>
                  <ScanSearch className={ui.icon} aria-hidden />
                  Find similar
                </button>
                <button className={ui.action} onClick={() => startWatch(eventBounds(event), event.title ?? CHANGE_TYPES[event.change_type].label)}>
                  <SquareDashed className={ui.icon} aria-hidden />
                  Watch this area
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.dockHead}>
                Selection <span className={styles.dockMeta}>nothing selected</span>
              </div>
              <p className={styles.selHint}>{site ? "Click any shape to see why it changed." : "Pick a site above, or click a dot on the map."}</p>
              {biggest && (
                <button className={styles.suggest} onClick={() => chooseEvent(biggest.id, true)}>
                  <span className={ui.dot} style={{ background: swatch(biggest.change_type) }} aria-hidden />
                  <span className={ui.rowLabel} style={{ flex: 1 }}>
                    {biggest.title ?? CHANGE_TYPES[biggest.change_type].label}
                  </span>
                  <span className={ui.rowTrail}>{area(biggest.area_km2)}</span>
                </button>
              )}
            </>
          )}
        </section>

        <section className={`${styles.dockCard} ${styles.player}`} aria-label="Playback">
          <div className={styles.dockHead}>
            Playback
            <span className={styles.seg} role="group" aria-label="Playback speed">
              {([1, 2] as const).map((v) => (
                <button key={v} className={styles.segBtn} aria-pressed={speed === v} onClick={() => setSpeed(v)} disabled={is3D}>
                  {v}x
                </button>
              ))}
            </span>
          </div>
          <div className={styles.pbInfo}>
            <span className={styles.readoutMain}>{is3D ? `${Math.round(motion.blend * 100)}%` : current ? shortDate(current) : "No site"}</span>
            <span className={styles.readoutSub}>{is3D ? "of the measured motion" : site ? `pass ${passIndex + 1} of ${passes.length}` : "pick a site"}</span>
            {!is3D && passes.length > 0 && (
              <span className={styles.ticks} aria-hidden>
                {passes.map((p, i) => (
                  <i key={p.date} data-on={i <= passIndex || undefined} data-base={p.baseline || undefined} />
                ))}
              </span>
            )}
          </div>
          <div className={styles.playRow}>
            <button className={styles.stepBtn} onClick={() => step(-1)} disabled={is3D || !site || passIndex <= 0} aria-label="Previous pass" title="Previous pass (←)">
              <SkipBack className={ui.icon} aria-hidden />
            </button>
            <button className={styles.primary} onClick={togglePlay} disabled={!siteId}>
              {(is3D ? motion.playing : playing) ? <Pause aria-hidden /> : <Play aria-hidden />}
              {(is3D ? motion.playing : playing) ? "Pause" : "Play"}
              <kbd className={styles.primaryKey}>space</kbd>
            </button>
            <button className={styles.stepBtn} onClick={() => step(1)} disabled={is3D || !site || passIndex >= passes.length - 1} aria-label="Next pass" title="Next pass (→)">
              <SkipForward className={ui.icon} aria-hidden />
            </button>
            <button className={styles.stepBtn} aria-pressed={loop} onClick={() => setLoop((l) => !l)} disabled={is3D} aria-label="Loop" title="Loop the passes">
              <Repeat className={ui.icon} aria-hidden />
            </button>
          </div>
        </section>

        <section className={`${styles.dockCard} ${styles.modes}`} aria-label="Mode">
          <button className={styles.mode} aria-pressed={mode === "map"} onClick={() => (is3D ? chooseSite(START_SITE) : dispatch({ type: "close" }))}>
            <MapIcon className={ui.icon} aria-hidden />
            Map
          </button>
          <button className={styles.mode} aria-pressed={mode === "watch"} onClick={() => mode !== "watch" && startWatch()}>
            <SquareDashed className={ui.icon} aria-hidden />
            Watch
          </button>
          <button className={styles.mode} aria-pressed={mode === "3d"} onClick={() => chooseSite(EXPLORE_SITE)}>
            <Mountain className={ui.icon} aria-hidden />
            3D
          </button>
        </section>
      </div>
    </div>
  );
}
