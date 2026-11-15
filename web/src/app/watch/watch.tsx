"use client";

import { ArrowLeft, Pause, Play, Satellite, SquareDashed } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { LogoMark } from "@/components/logo";
import { area, longDate } from "@/lib/format";
import type { SiteSummary } from "@/lib/types";
import { Tabs } from "../map/rail";
import { Feed } from "./feed";
import { reduce, type Flow } from "./flow";
import { bboxPolygon, isNews, type CheckResult, type Watch } from "./model";
import { WatchMap, type Focus } from "./watch-map";
import atlas from "../map/atlas.module.css";
import styles from "./watch.module.css";

const STEP_MS = 1000;
const TOAST_MS = 1800;

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export function WatchApp() {
  const [flow, dispatch] = useReducer(reduce, { step: "site" } as Flow);
  const [sites, setSites] = useState<SiteSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [name, setName] = useState("");
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const flights = useRef(0);

  const siteId = flow.step === "site" ? null : flow.site;
  const site = sites?.find((s) => s.id === siteId) ?? null;
  const passes = useMemo(() => site?.passes ?? [], [site]);

  useEffect(() => {
    fetch("/api/sites")
      .then((r) => json<SiteSummary[]>(r))
      .then(setSites)
      .catch((e: Error) => setError(e.message));
  }, []);

  const loadWatches = useCallback((id: string) => {
    fetch(`/api/watch?site=${encodeURIComponent(id)}`)
      .then((r) => json<Watch[]>(r))
      .then(setWatches)
      .catch(() => setWatches([]));
  }, []);

  useEffect(() => {
    if (siteId) loadWatches(siteId);
  }, [siteId, loadWatches]);

  const pickSite = (s: SiteSummary) => {
    dispatch({ type: "site", site: s.id });
    setFocus({ bbox: s.bbox, key: `site:${s.id}:${++flights.current}` });
  };

  const openWatch = (w: Watch) => {
    dispatch({ type: "open", watch: w });
    const ring = w.area.coordinates[0];
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    setFocus({ bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], key: `watch:${w.id}:${++flights.current}` });
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (flow.step !== "name" || !name.trim()) return;
    dispatch({ type: "save" });
    fetch("/api/watch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim(), site: flow.site, area: bboxPolygon(flow.bbox) }),
    })
      .then((r) => json<Watch>(r))
      .then((w) => {
        setName("");
        loadWatches(w.site);
        dispatch({ type: "open", watch: w });
      })
      .catch((err: Error) => dispatch({ type: "saveFailed", error: err.message }));
  };

  const watchId = flow.step === "watch" ? flow.watch.id : null;
  const watchName = flow.step === "watch" ? flow.watch.name : null;
  const running = flow.step === "watch" && flow.replay.status === "running" ? flow.replay.next : null;

  useEffect(() => {
    if (running === null || !watchId || !watchName || !passes.length) return;
    let live = true;
    const index = running;
    const t = setTimeout(
      () => {
        fetch(`/api/watch/${watchId}/check`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pass_date: passes[index].date }),
        })
          .then((r) => json<CheckResult>(r))
          .then((result) => {
            if (!live) return;
            dispatch({ type: "checked", watchId, index, total: passes.length, result });
            if (result.changes.some(isNews)) setToast({ id: Date.now(), text: `New change in ${watchName}` });
          })
          .catch((err: Error) => live && dispatch({ type: "checkFailed", watchId, error: err.message }));
      },
      index === 0 ? 0 : STEP_MS,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [running, watchId, watchName, passes]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && flow.step === "draw" && flow.drawing) dispatch({ type: "cancelDraw" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flow]);

  const replay = flow.step === "watch" ? flow.replay : null;
  const shownIndex = replay && replay.status !== "idle" && replay.feed.length ? replay.feed[0].index : null;
  const areaShape = flow.step === "name" ? bboxPolygon(flow.bbox) : flow.step === "watch" ? flow.watch.area : null;
  const alertCount = replay && replay.status !== "idle" ? replay.feed.reduce((n, f) => n + f.changes.filter(isNews).length, 0) : 0;

  return (
    <div className={atlas.atlas}>
      <aside className={atlas.rail}>
        <header className={atlas.railHead}>
          <Link href="/" className={atlas.wordmark}>
            <LogoMark className={atlas.logo} />
            Distill
          </Link>
        </header>
        <Tabs current="watch" />

        {flow.step === "site" || !site ? (
          <>
            <div className={atlas.section}>
              <h1 className={atlas.sectionTitle}>Watch an area</h1>
              <p className={atlas.sectionDesc}>Pick a site, draw a box, and Distill alerts you when a radar pass shows change inside it.</p>
            </div>
            {error && <p className={atlas.note}>Could not load sites. {error}</p>}
            {!sites && !error && <p className={atlas.note}>Loading sites</p>}
            <ol className={atlas.list}>
              {sites?.map((s) => (
                <li key={s.id}>
                  <button className={atlas.row} onClick={() => pickSite(s)}>
                    <span className={atlas.rowText}>
                      <span className={atlas.rowLabel}>{s.name}</span>
                      <span className={atlas.rowSub}>
                        {s.place} · {s.passes.length} passes
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <div className={atlas.section}>
              <button className={atlas.back} onClick={() => dispatch({ type: "back" })}>
                <ArrowLeft className={atlas.icon} aria-hidden />
                {flow.step === "draw" ? "All sites" : site.name}
              </button>
              {flow.step === "draw" && (
                <>
                  <h1 className={atlas.sectionTitle}>{site.name}</h1>
                  <p className={atlas.sectionDesc}>
                    {flow.drawing ? "Drag a box on the map over the area you care about." : "Press Draw area above the map, then drag a box over the area you care about."}
                  </p>
                </>
              )}
              {flow.step === "name" && (
                <>
                  <h1 className={atlas.sectionTitle}>Name this area</h1>
                  <p className={atlas.sectionDesc}>
                    {area(boxKm2(flow.bbox))} over {site.name}
                  </p>
                  <form className={styles.form} onSubmit={save}>
                    <input
                      className={styles.input}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ridge north"
                      maxLength={80}
                      autoFocus
                      aria-label="Area name"
                    />
                    <button className={styles.primary} disabled={!name.trim() || flow.saving}>
                      {flow.saving ? "Saving" : "Watch"}
                    </button>
                  </form>
                  {flow.error && <p className={styles.error}>{flow.error}</p>}
                </>
              )}
              {flow.step === "watch" && (
                <>
                  <h1 className={atlas.sectionTitle}>{flow.watch.name}</h1>
                  <p className={atlas.sectionDesc}>
                    {area(flow.watch.area_km2)} over {site.name}
                  </p>
                  <button
                    className={styles.replay}
                    onClick={() => dispatch({ type: flow.replay.status === "running" ? "stop" : "replay" })}
                  >
                    {flow.replay.status === "running" ? <Pause className={atlas.icon} aria-hidden /> : <Play className={atlas.icon} aria-hidden />}
                    {flow.replay.status === "running" ? "Pause replay" : "Replay passes"}
                  </button>
                </>
              )}
            </div>

            {flow.step === "draw" && watches.length > 0 && (
              <>
                <p className={atlas.listHead}>
                  <span>Your watches</span>
                  <span>{watches.length}</span>
                </p>
                <ol className={atlas.list} style={{ marginTop: 6 }}>
                  {watches.map((w) => (
                    <li key={w.id}>
                      <button className={atlas.row} onClick={() => openWatch(w)}>
                        <SquareDashed className={atlas.icon} style={{ color: "var(--ink-3)" }} aria-hidden />
                        <span className={atlas.rowText}>
                          <span className={atlas.rowLabel}>{w.name}</span>
                          <span className={atlas.rowSub}>{w.alerts === 1 ? "1 alert" : `${w.alerts} alerts`}</span>
                        </span>
                        <span className={atlas.rowTrail}>{area(w.area_km2)}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {flow.step === "watch" &&
              (flow.replay.status === "idle" ? (
                <p className={atlas.note}>Replay steps through every past pass here and alerts on new change.</p>
              ) : (
                <>
                  <p className={atlas.listHead}>
                    <span>{alertCount === 1 ? "1 alert" : `${alertCount} alerts`}</span>
                    <span>
                      {flow.replay.feed.length} of {passes.length} passes
                    </span>
                  </p>
                  {flow.replay.error && <p className={styles.error}>{flow.replay.error}</p>}
                  <Feed items={flow.replay.feed} watch={flow.watch.name} total={passes.length} />
                </>
              ))}
          </>
        )}

        <p className={atlas.railFoot}>Live mode checks ASF for new NISAR passes on a schedule. Email delivery comes next.</p>
      </aside>

      <main className={atlas.card} style={{ gridTemplateRows: "auto minmax(0, 1fr)" }}>
        <div className={atlas.toolbar}>
          <button
            className={atlas.ghost}
            onClick={() => dispatch({ type: flow.step === "draw" && flow.drawing ? "cancelDraw" : "draw" })}
            disabled={!site}
            aria-pressed={flow.step === "draw" && flow.drawing}
            title={site ? "Drag a box on the map" : "Pick a site first"}
          >
            <SquareDashed className={atlas.icon} aria-hidden />
            Draw area
          </button>
          <div className={atlas.field}>
            <Satellite className={atlas.icon} style={{ color: "var(--ink-3)" }} aria-hidden />
            {site ? (
              <span>
                {site.name}
                {flow.step === "watch" && (
                  <>
                    {" "}
                    <span className={atlas.fieldSep}>/</span> <span className={atlas.fieldMuted}>{flow.watch.name}</span>
                  </>
                )}
                {shownIndex !== null && (
                  <>
                    {" "}
                    <span className={atlas.fieldSep}>/</span> <span className={atlas.fieldMuted}>{longDate(passes[shownIndex].date)}</span>{" "}
                    <span className={atlas.fieldSep}>/</span>{" "}
                    <span className={atlas.fieldMuted}>
                      pass {shownIndex + 1} of {passes.length}
                    </span>
                  </>
                )}
              </span>
            ) : (
              <span className={atlas.fieldMuted}>Pick a site to watch</span>
            )}
          </div>
        </div>

        <div className={atlas.body}>
          <div className={atlas.mapArea}>
            <WatchMap
              coverage={site?.bbox ?? null}
              area={areaShape}
              drawing={flow.step === "draw" && flow.drawing}
              shapes={replay && replay.status !== "idle" ? replay.shapes : []}
              focus={focus}
              onDrawn={(bbox) => dispatch({ type: "drawn", bbox })}
            />
            {toast && (
              <div key={toast.id} className={styles.toast} role="status">
                {toast.text}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Spherical approximation for the naming step; the stored area comes from PostGIS.
function boxKm2([w, s, e, n]: [number, number, number, number]) {
  const R = 6371;
  const rad = Math.PI / 180;
  return R * R * Math.abs((e - w) * rad) * Math.abs(Math.sin(n * rad) - Math.sin(s * rad));
}
