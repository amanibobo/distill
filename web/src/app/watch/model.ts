import type { MultiPolygon, Polygon } from "geojson";
import { CHANGE_TYPES, type ChangeType } from "@/lib/change-types";
import { area, shortDate } from "@/lib/format";

export type BBox = [number, number, number, number];

export type Watch = {
  id: string;
  name: string;
  site: string;
  area: Polygon;
  area_km2: number;
  created_at: string;
  alerts: number;
};

// One event's footprint inside the watch on one pass, as PostGIS measured it.
export type Hit = { event_id: string; change_type: ChangeType; date: string; km2: number };

// What a pass did to one change type inside the watch. prev_km2 is the largest area any earlier
// pass showed, so a noisy dip followed by a recovery is not news.
export type TypeChange = {
  change_type: ChangeType;
  kind: "appeared" | "grew" | "steady" | "shrank";
  km2: number;
  prev_km2: number;
  event_ids: string[];
};

export type WatchShape = { event_id: string; change_type: ChangeType; inside: MultiPolygon; full: MultiPolygon };

export type Alert = { id: number; event_id: string; change_type: ChangeType; pass_date: string; area_km2: number };

export type CheckResult = {
  watch_id: string;
  pass_date: string;
  baseline: boolean;
  changes: TypeChange[];
  alerts: Alert[];
  shapes: WatchShape[];
};

// Slivers under one hectare are edge noise from the 40 m pixels, not change anyone would act on.
export const MIN_KM2 = 0.01;
const GROWTH = 1.02;

export const isNews = (c: TypeChange) => c.kind === "appeared" || c.kind === "grew";

export function classify(hits: Hit[], pass: string): TypeChange[] {
  const totals = new Map<ChangeType, Map<string, number>>();
  const ids = new Map<ChangeType, string[]>();
  for (const h of hits) {
    const byDate = totals.get(h.change_type) ?? new Map<string, number>();
    byDate.set(h.date, (byDate.get(h.date) ?? 0) + h.km2);
    totals.set(h.change_type, byDate);
    if (h.date === pass) ids.set(h.change_type, [...(ids.get(h.change_type) ?? []), h.event_id]);
  }
  return [...totals].flatMap(([change_type, byDate]) => {
    const km2 = byDate.get(pass) ?? 0;
    if (km2 < MIN_KM2) return [];
    const prev = Math.max(0, ...[...byDate].filter(([d]) => d < pass).map(([, v]) => v));
    const kind: TypeChange["kind"] =
      prev < MIN_KM2 ? "appeared" : km2 > prev * GROWTH && km2 - prev >= MIN_KM2 * 5 ? "grew" : km2 < prev / GROWTH ? "shrank" : "steady";
    return [{ change_type, kind, km2, prev_km2: prev, event_ids: ids.get(change_type) ?? [] }];
  });
}

export function sentence(c: TypeChange, watch: string, date: string): string {
  const label = CHANGE_TYPES[c.change_type].label;
  const day = shortDate(date);
  switch (c.kind) {
    case "appeared":
      return `${label} appeared, ${area(c.km2)} inside ${watch} on ${day}`;
    case "grew":
      return `${label} grew to ${area(c.km2)} inside ${watch} on ${day}`;
    case "shrank":
      return `${label} shrank to ${area(c.km2)}`;
    case "steady":
      return `${label} steady at ${area(c.km2)}`;
  }
}

export function bboxPolygon([w, s, e, n]: BBox): Polygon {
  return { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] };
}

