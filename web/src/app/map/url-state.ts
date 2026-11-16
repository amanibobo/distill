import type { BBox } from "@/app/watch/model";
import { parseBBox } from "./links";

export type Camera = { lng: number; lat: number; zoom: number };

export type ViewState = {
  site: string | null;
  event: string | null;
  pass: string | null;
  camera: Camera | null;
};

// Watch links (/watch redirects here) open the map in draw mode, optionally with a box already drawn.
export type Arrival = ViewState & { empty: boolean; draw: boolean; bbox: BBox | null; name: string };

export function readViewState(search: string): Arrival {
  const p = new URLSearchParams(search);
  const cam = p.get("cam")?.split(",").map(Number);
  return {
    empty: p.size === 0,
    site: p.get("site"),
    event: p.get("event"),
    pass: p.get("pass"),
    camera: cam && cam.length === 3 && cam.every(Number.isFinite) ? { lng: cam[0], lat: cam[1], zoom: cam[2] } : null,
    draw: p.has("draw") || p.has("bbox"),
    bbox: parseBBox(p.get("bbox")),
    name: p.get("name") ?? "",
  };
}

export function writeViewState(v: ViewState) {
  const p = new URLSearchParams();
  if (v.site) p.set("site", v.site);
  if (v.event) p.set("event", v.event);
  if (v.pass) p.set("pass", v.pass);
  if (v.camera) p.set("cam", [v.camera.lng.toFixed(4), v.camera.lat.toFixed(4), v.camera.zoom.toFixed(2)].join(","));
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}
