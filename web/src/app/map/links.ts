import type { BBox } from "@/app/watch/model";

// Explore's Venezuela scene is a place in the map's site list, under this id, though it has no radar changes.
export const EXPLORE_SITE = "venezuela";

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
