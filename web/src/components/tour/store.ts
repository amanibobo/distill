import { useSyncExternalStore } from "react";
import { STEPS, type StepId } from "./steps";

type Saved = { seen: boolean; dismissed: boolean; done: StepId[] };
export type TourState = Saved & { open: boolean; expanded: StepId | null };

const KEY = "distill.tour.v1";
const INITIAL: TourState = { seen: false, dismissed: false, done: [], open: false, expanded: null };
const IDS = new Set<string>(STEPS.map((s) => s.id));

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return {
      seen: raw?.seen === true,
      dismissed: raw?.dismissed === true,
      done: Array.isArray(raw?.done) ? raw.done.filter((id: unknown): id is StepId => typeof id === "string" && IDS.has(id)) : [],
    };
  } catch {
    return { seen: false, dismissed: false, done: [] };
  }
}

function save({ seen, dismissed, done }: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ seen, dismissed, done }));
  } catch {}
}

let state: TourState | null = null;
const listeners = new Set<() => void>();

const current = () => (state ??= { ...INITIAL, ...load() });

function set(patch: Partial<TourState>) {
  state = { ...current(), ...patch };
  save(state);
  listeners.forEach((l) => l());
}

const firstOpen = (done: StepId[]) => STEPS.find((s) => !done.includes(s.id))?.id ?? null;

export const tour = {
  open: () => {
    const s = current();
    set({ open: true, seen: true, dismissed: false, expanded: s.expanded ?? firstOpen(s.done) });
  },
  openIfFirstVisit: () => {
    const s = current();
    if (!s.seen && !s.dismissed) tour.open();
  },
  close: () => set({ open: false }),
  skip: () => set({ open: false, dismissed: true }),
  toggle: (id: StepId) => set({ expanded: current().expanded === id ? null : id }),
  complete: (id: StepId) => {
    const done = current().done.includes(id) ? current().done : [...current().done, id];
    set({ done, open: false, expanded: firstOpen(done) });
  },
  restart: () => set({ done: [], expanded: STEPS[0].id }),
};

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    state = { ...current(), ...load() };
    l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export const useTour = () => useSyncExternalStore(subscribe, current, () => INITIAL);

const motionQuery = "(prefers-reduced-motion: reduce)";

export const useReducedMotion = () =>
  useSyncExternalStore(
    (l) => {
      const m = window.matchMedia(motionQuery);
      m.addEventListener("change", l);
      return () => m.removeEventListener("change", l);
    },
    () => window.matchMedia(motionQuery).matches,
    () => false,
  );
