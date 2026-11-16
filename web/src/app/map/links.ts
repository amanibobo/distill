import type { BBox } from "@/app/watch/model";

// The 3D ground-motion places, oldest event first. Each is a place in the map's site list, though it has no
// radar changes, and each has an export from pipeline/distill/deformation.py in public/explore/<id>/.
export const MOTION_SITES = [
  { id: "venezuela", name: "Venezuela earthquakes", magnitude: 7.2, date: "2026-06-24" },
  { id: "catia", name: "Catia La Mar earthquake", magnitude: 7.5, date: "2026-06-24" },
  { id: "kumamoto", name: "Kumamoto earthquake", magnitude: 6.8, date: "2026-07-28" },
  { id: "flores", name: "Flores Sea earthquake", magnitude: 7.8, date: "2026-08-14" },
  { id: "panama", name: "Panama earthquake", magnitude: 7.7, date: "2026-10-09" },
] as const;

export type MotionSite = (typeof MOTION_SITES)[number];
export type MotionSiteId = MotionSite["id"];

export const isMotionSite = (id: string | null): id is MotionSiteId => MOTION_SITES.some((s) => s.id === id);
export const motionSite = (id: MotionSiteId): MotionSite => MOTION_SITES.find((s) => s.id === id)!;

// The 3D button opens the most recent event.
export const DEFAULT_MOTION_SITE: MotionSiteId = MOTION_SITES[MOTION_SITES.length - 1].id;

export function parseBBox(raw: string | null): BBox | null {
  const v = raw?.split(",").map(Number);
  if (!v || v.length !== 4 || !v.every(Number.isFinite)) return null;
  const [w, s, e, n] = v;
  return w < e && s < n ? [w, s, e, n] : null;
}

// Global shortcuts must stay out of the way of typing.
export function isTyping(e: KeyboardEvent) {
  const t = e.target;
  return e.metaKey || e.ctrlKey || e.altKey || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);
}
