"use client";

import { ArrowLeft, BookOpen, ListChecks, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { LogoMark } from "@/components/logo";
import { CHANGE_TYPES, type ChangeType } from "@/lib/change-types";
import { area, shortDate } from "@/lib/format";
import type { ChangeEvent, SiteSummary } from "@/lib/types";
import styles from "./atlas.module.css";

type Props = {
  sites: SiteSummary[] | null;
  error: string | null;
  siteId: string | null;
  events: ChangeEvent[];
  activeIds: Set<string>;
  hidden: Set<ChangeType>;
  selectedId: string | null;
  hoveredId: string | null;
  onSite: (id: string) => void;
  onBack: () => void;
  onToggleType: (t: ChangeType) => void;
  onEvent: (id: string) => void;
  onHover: (id: string | null) => void;
};

const ORDER = Object.keys(CHANGE_TYPES) as ChangeType[];

function dominant(counts: SiteSummary["counts"]): ChangeType {
  const entries = Object.entries(counts).filter(([t]) => t !== "other") as [ChangeType, number][];
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] ?? "other";
}

export function Tabs({ current }: { current: "map" | "writeup" | "process" | null }) {
  const tabs = [
    { id: "map", href: "/map", label: "Map", Icon: MapIcon },
    { id: "writeup", href: "/writeup", label: "Writeup", Icon: BookOpen },
    { id: "process", href: "/process", label: "Process", Icon: ListChecks },
  ] as const;
  return (
    <nav className={styles.tabs} aria-label="Pages">
      {tabs.map(({ id, href, label, Icon }) => (
        <Link key={id} href={href} className={styles.tab} aria-current={id === current ? "page" : undefined}>
          <Icon aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function Rail(p: Props) {
  const site = p.sites?.find((s) => s.id === p.siteId) ?? null;
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!p.selectedId) return;
    list.current?.querySelector(`[data-id="${CSS.escape(p.selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [p.selectedId]);

  const counts = new Map<ChangeType, number>();
  for (const e of p.events) counts.set(e.change_type, (counts.get(e.change_type) ?? 0) + 1);
  const visible = p.events.filter((e) => !p.hidden.has(e.change_type));
  const activeCount = visible.filter((e) => p.activeIds.has(e.id)).length;

  return (
    <aside className={styles.rail}>
      <header className={styles.railHead}>
        <Link href="/" className={styles.wordmark}>
          <LogoMark className={styles.logo} />
          Distill
        </Link>
      </header>
      <Tabs current="map" />

      {!site ? (
        <>
          <div className={styles.section}>
            <h1 className={styles.sectionTitle}>Where the ground changed</h1>
            <p className={styles.sectionDesc}>Seen by the NISAR radar satellite since June 2026, through clouds and at night.</p>
          </div>
          {p.error && <p className={styles.note}>Could not load sites. {p.error}</p>}
          {!p.sites && !p.error && <p className={styles.note}>Loading sites</p>}
          <ol className={styles.list}>
            {p.sites?.map((s, i) => {
              const total = Object.values(s.counts).reduce((a, b) => a + (b ?? 0), 0);
              return (
                <li key={s.id}>
                  <button className={styles.row} onClick={() => p.onSite(s.id)}>
                    <span className={styles.dot} style={{ background: CHANGE_TYPES[dominant(s.counts)].color }} aria-hidden />
                    <span className={styles.rowText}>
                      <span className={styles.rowLabel}>{s.name}</span>
                      <span className={styles.rowSub}>
                        {total} changes · {s.passes.length} passes
                      </span>
                    </span>
                    <span className={styles.caps}>
                      <kbd className={styles.cap}>{i + 1}</kbd>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <>
          <div className={styles.section}>
            <button className={styles.back} onClick={p.onBack}>
              <ArrowLeft className={styles.icon} aria-hidden />
              All sites
            </button>
            <h1 className={styles.sectionTitle}>{site.name}</h1>
            <p className={styles.sectionDesc}>{site.place}</p>
          </div>

          <div className={styles.filters} role="group" aria-label="Show change types">
            {ORDER.filter((t) => counts.has(t)).map((t) => (
              <button key={t} className={styles.filter} aria-pressed={!p.hidden.has(t)} onClick={() => p.onToggleType(t)}>
                <span className={styles.dot} style={{ background: CHANGE_TYPES[t].color }} aria-hidden />
                {CHANGE_TYPES[t].label}
                <span className={styles.filterCount}>{counts.get(t)}</span>
              </button>
            ))}
          </div>

          <p className={styles.listHead}>
            <span>{visible.length} changes</span>
            <span>{activeCount} on this pass</span>
          </p>
          <ol ref={list} className={styles.list} style={{ marginTop: 6 }}>
            {visible.map((e) => (
              <li key={e.id}>
                <button
                  data-id={e.id}
                  className={styles.row}
                  data-selected={e.id === p.selectedId || undefined}
                  data-hover={e.id === p.hoveredId || undefined}
                  data-inactive={!p.activeIds.has(e.id) || undefined}
                  onClick={() => p.onEvent(e.id)}
                  onMouseEnter={() => p.onHover(e.id)}
                  onMouseLeave={() => p.onHover(null)}
                >
                  <span className={styles.dot} style={{ background: CHANGE_TYPES[e.change_type].color }} aria-hidden />
                  <span className={styles.rowText}>
                    <span className={styles.rowLabel}>{e.title ?? CHANGE_TYPES[e.change_type].label}</span>
                    <span className={styles.rowSub}>
                      From {shortDate(e.onset)} · {e.recovery ? `ended ${shortDate(e.recovery)}` : "ongoing"}
                    </span>
                  </span>
                  <span className={styles.rowTrail}>{area(e.area_km2)}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
