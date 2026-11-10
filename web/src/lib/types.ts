import type { MultiPolygon } from "geojson";
import type { ChangeType } from "./change-types";

export type Pass = { date: string; pass_id: string; baseline: boolean };

export type SiteSummary = {
  id: string;
  name: string;
  place: string;
  bbox: [number, number, number, number];
  passes: Pass[];
  counts: Partial<Record<ChangeType, number>>;
};

export type Footprint = { pass_id: string; date: string; area_km2: number; geometry: MultiPolygon };

export type EventStatus = "growing" | "stable" | "receding" | "recovered";

export type ChangeEvent = {
  id: string;
  site: string;
  change_type: ChangeType;
  confidence: number;
  reason: string;
  title: string | null;
  summary: string | null;
  area_km2: number;
  onset: string;
  peak: string;
  last_seen: string;
  recovery: string | null;
  status: EventStatus;
  footprint_by_pass: Footprint[];
};

export type RadarManifest = {
  site: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  frames: { date: string; pass_id: string; image: string }[];
};
