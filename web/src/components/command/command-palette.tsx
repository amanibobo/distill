"use client";

import {
  Check,
  ChartColumn,
  CircleAlert,
  CornerDownLeft,
  FileText,
  Fingerprint,
  ListFilter,
  LoaderCircle,
  MapPinned,
  Search,
  Square,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CHANGE_TYPES, swatch } from "@/lib/change-types";
import { area } from "@/lib/format";
import { EVENT_ID, type AskHit, type ToolName } from "@/lib/ask/protocol";
import { filterActions, quickActions, type Action, type SiteOption } from "./actions";
import styles from "./command.module.css";
import { useAsk, type Run, type Step } from "./use-ask";

const OPEN_EVENT = "distill:command";

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

const TOOL_ICONS: Record<ToolName, LucideIcon> = {
  list_sites: MapPinned,
  search_events: ListFilter,
  count_events: ChartColumn,
  get_event: FileText,
  similar_events: Fingerprint,
};

type Row =
  | { key: string; kind: "action"; action: Action }
  | { key: string; kind: "ask"; q: string }
  | { key: string; kind: "result"; hit: AskHit };

const eventHref = (site: string, id: string) => `/map?site=${encodeURIComponent(site)}&event=${encodeURIComponent(id)}`;

const subscribeNothing = () => () => {};
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

function isTyping(e: KeyboardEvent) {
  const t = e.target;
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);
}

export function CommandPalette() {
  const router = useRouter();
  const { run, ask, stop } = useAsk();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sitesRequested = useRef(false);

  const show = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
    if (!sitesRequested.current) {
      sitesRequested.current = true;
      fetch("/api/sites")
        .then((r) => (r.ok ? (r.json() as Promise<SiteOption[]>) : []))
        .then((s) => setSites(s.map(({ id, name, place }) => ({ id, name, place }))))
        .catch(() => {
          sitesRequested.current = false;
        });
    }
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) hide();
        else show();
      } else if (e.key === "/" && !open && !isTyping(e) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [open, show, hide]);

  useEffect(() => {
    if (!open) return;
    const el = input.current;
    el?.focus();
    el?.select();
  }, [open]);

  const trimmed = query.trim();
  const showingRun = run !== null && trimmed === run.q;
  const actions = useMemo(() => quickActions(sites), [sites]);

  const rows = useMemo((): Row[] => {
    if (showingRun) return (run.results ?? []).map((hit) => ({ key: `r:${hit.id}`, kind: "result", hit }));
    const matched = filterActions(actions, trimmed).map((action): Row => ({ key: action.id, kind: "action", action }));
    const exact = matched.some((r) => r.kind === "action" && r.action.label.toLowerCase() === trimmed.toLowerCase());
    return trimmed && !exact ? [{ key: "ask", kind: "ask", q: trimmed }, ...matched] : matched;
  }, [showingRun, run, actions, trimmed]);

  const selected = Math.min(active, rows.length - 1);

  useEffect(() => {
    list.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [selected, rows]);

  const runAsk = (q: string) => {
    setQuery(q);
    setActive(0);
    void ask(q);
  };

  const go = (href: string) => {
    hide();
    router.push(href);
  };

  const choose = (row: Row) => {
    if (row.kind === "ask") return runAsk(row.q);
    if (row.kind === "result") return go(eventHref(row.hit.site, row.hit.id));
    const { effect } = row.action;
    if (effect.kind === "go") go(effect.href);
    else if (effect.kind === "ask") runAsk(effect.q);
    else {
      hide();
      window.dispatchEvent(new CustomEvent("distill:tour"));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      hide();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((selected + step + rows.length) % rows.length);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const row = rows[selected];
      if (row) choose(row);
      else if (trimmed && run?.phase !== "running") runAsk(trimmed);
    }
  };

  const running = run?.phase === "running" && showingRun;

  return (
    <div className={styles.layer} data-open={open || undefined} inert={!open}>
      <div className={styles.dim} onPointerDown={hide} />
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Search or ask" onKeyDown={onKeyDown}>
        <div className={styles.inputRow}>
          <Search className={styles.inputIcon} strokeWidth={1.5} aria-hidden />
          <input
            ref={input}
            className={styles.input}
            value={query}
            placeholder="Search or ask about floods, fires and harvests…"
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={rows[selected] ? `command-${rows[selected].key}` : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          {running ? (
            <button type="button" className={styles.stop} onClick={stop}>
              <Square size={10} strokeWidth={1.5} fill="currentColor" aria-hidden />
              Stop
            </button>
          ) : (
            <kbd className={styles.kbd}>esc</kbd>
          )}
        </div>

        <div ref={list} id="command-list" className={styles.body} role="listbox" aria-label="Results">
          {showingRun ? (
            <RunView run={run} rows={rows} selected={selected} onHover={setActive} onChoose={choose} onCite={(site, id) => go(eventHref(site, id))} onRetry={() => runAsk(run.q)} />
          ) : (
            <ActionList rows={rows} selected={selected} onHover={setActive} onChoose={choose} />
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footKeys}>
            <kbd className={styles.kbd}>↑</kbd>
            <kbd className={styles.kbd}>↓</kbd>
            <span>to move</span>
            <kbd className={styles.kbd}>↵</kbd>
            <span>{showingRun || rows[selected]?.kind !== "ask" ? "to open" : "to ask Claude"}</span>
          </span>
          <span>Answers come from Distill’s events, read by Claude</span>
        </div>
      </div>
    </div>
  );
}

type ListProps = { rows: Row[]; selected: number; onHover: (i: number) => void; onChoose: (row: Row) => void };

function ActionList({ rows, selected, onHover, onChoose }: ListProps) {
  if (!rows.length) return <p className={styles.empty}>Nothing matches. Keep typing and press Enter to ask Claude.</p>;
  const groupOf = (row: Row) => (row.kind === "action" ? row.action.group : "");
  return rows.map((row, i) => {
    const group = groupOf(row);
    const heading = group && (i === 0 || groupOf(rows[i - 1]) !== group) ? group : null;
    return (
      <Fragment key={row.key}>
        {heading && <div className={styles.group}>{heading}</div>}
        <RowButton row={row} index={i} active={i === selected} onHover={onHover} onChoose={onChoose}>
          {row.kind === "ask" ? (
            <>
              <Search className={styles.rowIcon} strokeWidth={1.5} aria-hidden />
              <span className={styles.rowLabel}>
                Ask Claude <span className={styles.quote}>“{row.q}”</span>
              </span>
            </>
          ) : row.kind === "action" ? (
            <>
              <row.action.Icon className={styles.rowIcon} strokeWidth={1.5} aria-hidden />
              <span className={styles.rowLabel}>{row.action.label}</span>
              {row.action.hint && <span className={styles.rowHint}>{row.action.hint}</span>}
            </>
          ) : null}
          <span className={styles.rowKeys}>
            {i === selected ? (
              <kbd className={styles.kbd}>
                <CornerDownLeft size={11} strokeWidth={1.5} aria-label="Enter" />
              </kbd>
            ) : (
              row.kind === "action" && row.action.keys?.map((k) => <kbd key={k} className={styles.kbd}>{k}</kbd>)
            )}
          </span>
        </RowButton>
      </Fragment>
    );
  });
}

function RowButton({ row, index, active, onHover, onChoose, children }: { row: Row; index: number; active: boolean; onHover: (i: number) => void; onChoose: (row: Row) => void; children: React.ReactNode }) {
  return (
    <div
      id={`command-${row.key}`}
      role="option"
      aria-selected={active}
      data-active={active || undefined}
      className={styles.row}
      onPointerMove={() => !active && onHover(index)}
      onClick={() => onChoose(row)}
    >
      {children}
    </div>
  );
}

type RunProps = ListProps & { run: Run; onCite: (site: string, id: string) => void; onRetry: () => void };

function RunView({ run, rows, selected, onHover, onChoose, onCite, onRetry }: RunProps) {
  const thinking = run.phase === "running" && !run.text;
  const sites = new Map((run.results ?? []).map((h) => [h.id, h.site]));
  return (
    <div className={styles.run}>
      {(run.steps.length > 0 || thinking) && (
        <ol className={styles.steps} aria-label="What Claude looked up">
          {run.steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
          {thinking && (
            <li className={styles.step} data-state="pending">
              <span className={styles.stepNode} aria-hidden>
                <span className={styles.pulse} />
              </span>
              <span className={styles.shimmer}>{run.steps.length ? "Claude is reading the results" : "Claude is searching"}</span>
            </li>
          )}
        </ol>
      )}

      {run.text && (
        <p className={styles.answer} data-streaming={run.phase === "running" || undefined}>
          {citedParts(run.text).map((part, i) =>
            i % 2 ? (
              <button key={i} type="button" className={styles.cite} onClick={() => onCite(sites.get(part) ?? part.split("-")[0], part)}>
                {part}
              </button>
            ) : (
              part
            ),
          )}
        </p>
      )}

      {run.phase === "stopped" && <p className={styles.note}>Stopped. Press Enter to ask again.</p>}
      {run.phase === "failed" && (
        <p className={styles.note}>
          {run.error}{" "}
          <button type="button" className={styles.link} onClick={onRetry}>
            Try again
          </button>
        </p>
      )}

      {rows.length > 0 && (
        <div className={styles.results}>
          <div className={styles.group}>Results</div>
          {rows.map((row, i) =>
            row.kind === "result" ? (
              <RowButton key={row.key} row={row} index={i} active={i === selected} onHover={onHover} onChoose={onChoose}>
                <span className={styles.dot} style={{ background: swatch(row.hit.change_type) }} aria-hidden />
                <span className={styles.resultText}>
                  <span className={styles.rowLabel}>{row.hit.title || CHANGE_TYPES[row.hit.change_type].label}</span>
                  <span className={styles.rowHint}>
                    {CHANGE_TYPES[row.hit.change_type].label} in {row.hit.site_name}
                  </span>
                </span>
                <span className={styles.area}>{area(row.hit.area_km2)}</span>
              </RowButton>
            ) : null,
          )}
        </div>
      )}
      {run.phase === "done" && rows.length === 0 && !run.text && <p className={styles.note}>No events matched.</p>}
    </div>
  );
}

// Splits the answer into text and event ids (odd indexes). The chip already marks an id, so the
// parentheses the model wraps citations in are dropped.
function citedParts(text: string): string[] {
  const parts = text.split(new RegExp(`(${EVENT_ID.source})`));
  return parts.map((part, i) => {
    if (i % 2) return part;
    let t = part;
    if (i > 0) t = t.replace(/^\)/, "");
    if (i < parts.length - 1) t = t.replace(/ ?\($/, " ");
    return t;
  });
}

function StepRow({ step }: { step: Step }) {
  const Icon = TOOL_ICONS[step.tool];
  return (
    <li className={styles.step} data-state={step.state}>
      <span className={styles.stepNode} aria-hidden>
        <Icon size={12} strokeWidth={1.5} />
      </span>
      <span className={styles.stepLabel}>{step.label}</span>
      <span className={styles.stepMeta}>
        {step.summary && <span className={styles.stepSummary}>{step.summary}</span>}
        {step.ms !== null && <span className={styles.stepMs}>{step.ms < 1000 ? `${step.ms} ms` : `${(step.ms / 1000).toFixed(1)} s`}</span>}
        {step.state === "running" ? (
          <LoaderCircle className={styles.spin} size={13} strokeWidth={1.5} aria-label="Running" />
        ) : step.state === "done" ? (
          <Check className={styles.check} size={13} strokeWidth={1.5} aria-label="Done" />
        ) : (
          <CircleAlert className={styles.failed} size={13} strokeWidth={1.5} aria-label="Failed" />
        )}
      </span>
    </li>
  );
}

export function CommandTrigger({ className }: { className?: string }) {
  const mac = useSyncExternalStore(subscribeNothing, isMac, () => true);
  return (
    <button type="button" className={`${styles.trigger} ${className ?? ""}`} onClick={openCommandPalette} aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}>
      <Search className={styles.triggerIcon} strokeWidth={1.5} aria-hidden />
      <span className={styles.triggerText}>Search or ask…</span>
      <span className={styles.triggerKeys} aria-hidden>
        <kbd className={styles.kbd}>{mac ? "⌘" : "Ctrl"}</kbd>
        <kbd className={styles.kbd}>K</kbd>
      </span>
    </button>
  );
}
