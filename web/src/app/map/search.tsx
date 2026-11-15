"use client";

import { Search as SearchIcon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CHANGE_TYPES, swatch } from "@/lib/change-types";
import { area, shortDate } from "@/lib/format";
import { chips, type SearchFilter, type SearchHit, type SearchResponse } from "@/lib/search";
import type { SiteSummary } from "@/lib/types";
import styles from "./atlas.module.css";

const EXAMPLES = ["Where did farmland flood since August?", "Fires still growing", "Big harvests in Iowa"];

type State = { kind: "idle" } | { kind: "loading"; filter: SearchFilter | null } | { kind: "done"; res: SearchResponse } | { kind: "error"; message: string };

type Props = {
  sites: SiteSummary[] | null;
  selectedId: string | null;
  onPick: (hit: SearchHit) => void;
  children: ReactNode;
};

export function Search({ sites, selectedId, onPick, children }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const run = useCallback(async (params: { q: string } | { filter: SearchFilter }) => {
    const id = ++seq.current;
    setState({ kind: "loading", filter: "filter" in params ? params.filter : null });
    const qs = "q" in params ? `q=${encodeURIComponent(params.q)}` : `filter=${encodeURIComponent(JSON.stringify(params.filter))}`;
    try {
      const r = await fetch(`/api/search?${qs}`);
      const body = await r.json();
      if (id !== seq.current) return;
      setState(r.ok ? { kind: "done", res: body as SearchResponse } : { kind: "error", message: body.error ?? "Search is unavailable right now." });
    } catch {
      if (id === seq.current) setState({ kind: "error", message: "Search is unavailable right now." });
    }
  }, []);

  const clear = useCallback(() => {
    seq.current++;
    setText("");
    setState({ kind: "idle" });
  }, []);

  const ask = (q: string) => {
    setText(q);
    if (q.trim()) run({ q: q.trim() });
    else clear();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const siteName = (id: string) => sites?.find((s) => s.id === id)?.name ?? id;
  const filter = state.kind === "done" ? state.res.filter : state.kind === "loading" ? state.filter : null;

  return (
    <>
      <form
        className={styles.search}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <SearchIcon className={styles.icon} aria-hidden />
        <input
          ref={input}
          className={styles.searchInput}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            if (text || state.kind !== "idle") clear();
            else input.current?.blur();
          }}
          placeholder="Ask, e.g. where did farmland flood since August?"
          aria-label="Search changes in plain English"
          enterKeyHint="search"
          spellCheck={false}
        />
        {text || state.kind !== "idle" ? (
          <button type="button" className={styles.searchClear} onClick={clear} aria-label="Clear search" title="Clear (Esc)">
            <X aria-hidden />
          </button>
        ) : (
          <kbd className={styles.cap}>/</kbd>
        )}
      </form>

      {state.kind === "idle" ? (
        children
      ) : (
        <>
          {filter && (
            <div className={styles.chips} role="group" aria-label="What the search understood">
              {chips(filter, siteName).map((c) => (
                <button key={c.key} className={styles.chip} onClick={() => run({ filter: c.without })} aria-label={`Remove ${c.label}`} title="Remove">
                  {c.type && <span className={styles.dot} style={{ background: swatch(c.type) }} aria-hidden />}
                  {c.label}
                  <X aria-hidden />
                </button>
              ))}
            </div>
          )}

          {state.kind === "loading" && <p className={styles.searchNote}>{filter ? "Searching" : "Reading your question"}</p>}
          {state.kind === "error" && <p className={styles.searchNote}>{state.message}</p>}

          {state.kind === "done" && state.res.results.length > 0 && (
            <>
              <p className={styles.listHead}>
                <span>
                  {state.res.results.length} {state.res.results.length === 1 ? "result" : "results"}
                </span>
                <span>Largest first</span>
              </p>
              <ol className={styles.list} style={{ marginTop: 6 }}>
                {state.res.results.map((h) => (
                  <li key={h.id}>
                    <button className={styles.row} data-selected={h.id === selectedId || undefined} onClick={() => onPick(h)}>
                      <span className={styles.dot} style={{ background: swatch(h.change_type) }} aria-hidden />
                      <span className={styles.rowText}>
                        <span className={styles.rowLabel}>{h.title || CHANGE_TYPES[h.change_type].label}</span>
                        <span className={styles.rowSub}>
                          {h.siteName} · from {shortDate(h.onset)}
                        </span>
                      </span>
                      <span className={styles.rowTrail}>{area(h.area_km2)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}

          {state.kind === "done" && state.res.results.length === 0 && (
            <>
              <p className={styles.searchNote}>{state.res.suggestion}</p>
              <p className={styles.listHead}>
                <span>Try</span>
              </p>
              <ol className={styles.list} style={{ marginTop: 6 }}>
                {EXAMPLES.map((q) => (
                  <li key={q}>
                    <button className={`${styles.row} ${styles.rowCompact}`} onClick={() => ask(q)}>
                      <SearchIcon className={styles.icon} style={{ color: "var(--ink-3)" }} aria-hidden />
                      <span className={styles.rowLabel}>{q}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </>
  );
}
