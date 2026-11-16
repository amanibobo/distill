"use client";

import {
  Map as MapLibre,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type ImageSource,
  type LngLat,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { bboxPolygon, type BBox } from "@/app/watch/model";
import type { Camera } from "./url-state";
import styles from "./atlas.module.css";
import ui from "./ui.module.css";

setWorkerUrl("/maplibre-gl-worker.mjs");

const basemap = (dark: boolean) => `https://basemaps.cartocdn.com/gl/${dark ? "dark-matter" : "positron"}-gl-style/style.json`;
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const MIN_DRAG_PX = 8;
const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const HATCH_COLOR: [number, number, number] = [0x1b, 0xaf, 0x7a];

// A diagonal hatch for crop growth, which shares harvest's green and is told apart by texture.
function hatch([r, g, b]: [number, number, number]) {
  const size = 12;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (x + y) % size < 3;
      const i = (y * size + x) * 4;
      data.set([r, g, b, on ? 255 : 46], i);
    }
  }
  return { width: size, height: size, data };
}

export type SitePoint = FeatureCollection<Point, { id: string; color: string; name: string }>;
export type EventShapes = FeatureCollection<MultiPolygon, { id: string; type: string; color: string; title: string }>;
export type Radar = { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] } | null;
export type Focus = { bbox: [number, number, number, number]; key: string; maxZoom?: number };

type Props = {
  dark: boolean;
  sites: SitePoint;
  shapes: EventShapes;
  radar: Radar;
  radarOpacity: number;
  selectedId: string | null;
  hoveredId: string | null;
  focus: Focus | null;
  initialCamera: Camera | null;
  rightInset: number;
  onSite: (id: string) => void;
  onEvent: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onCamera: (c: Camera) => void;
  onCursor: (lngLat: [number, number] | null) => void;
  // Watch: the dashed box, and whether a drag draws a new one instead of panning.
  area: Polygon | null;
  drawing: boolean;
  onDrawn: (bbox: BBox) => void;
  highlightIds: string[];
  onMap: (map: MapLibre | null) => void;
};

const boxOf = (a: LngLat, b: LngLat): BBox => [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)];
const polygons = (items: Polygon[]): FeatureCollection => ({ type: "FeatureCollection", features: items.map((geometry) => ({ type: "Feature", geometry, properties: {} })) });

export type { MapLibre };

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const ready = styleVersion > 0;
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const handlers = useRef(props);
  useEffect(() => {
    handlers.current = props;
  });

  useEffect(() => {
    if (!container.current) return;
    const cam = props.initialCamera;
    const map = new MapLibre({
      container: container.current,
      style: basemap(props.dark),
      center: cam ? [cam.lng, cam.lat] : [-20, 30],
      zoom: cam ? cam.zoom : 1.8,
      renderWorldCopies: false,
      attributionControl: { compact: true },
      maxPitch: 0,
      dragRotate: false,
    });
    mapRef.current = map;
    props.onMap(map);
    map.addControl(new ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-left");

    map.on("style.load", () => {
      map.addSource("radar", { type: "image", url: BLANK_IMAGE, coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] });
      map.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": 0, "raster-fade-duration": 0 } });
      map.addSource("events", { type: "geojson", data: EMPTY, promoteId: "id" });
      map.addImage("hatch", hatch(HATCH_COLOR), { pixelRatio: 2 });
      map.addLayer({
        id: "event-hatch",
        type: "fill",
        source: "events",
        filter: ["==", ["get", "type"], "crop_growth"],
        paint: {
          "fill-pattern": "hatch",
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 1, ["boolean", ["feature-state", "hover"], false], 0.9, 0.7],
        },
      });
      map.addLayer({
        id: "event-fill",
        type: "fill",
        source: "events",
        filter: ["!=", ["get", "type"], "crop_growth"],
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.55, ["boolean", ["feature-state", "hover"], false], 0.45, 0.3],
        },
      });
      map.addLayer({
        id: "event-line",
        type: "line",
        source: "events",
        paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#2f7bf6", ["boolean", ["feature-state", "similar"], false], "#2b2b2b", ["get", "color"]],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            2,
            ["boolean", ["feature-state", "similar"], false],
            2,
            ["boolean", ["feature-state", "hover"], false],
            1.5,
            1,
          ],
          "line-opacity": 0.95,
        },
      });
      map.addSource("sites", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "site-ring",
        type: "circle",
        source: "sites",
        maxzoom: 7,
        paint: { "circle-radius": 11, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 1, "circle-stroke-color": ["get", "color"], "circle-stroke-opacity": 0.6 },
      });
      map.addLayer({
        id: "site-dot",
        type: "circle",
        source: "sites",
        maxzoom: 7,
        paint: { "circle-radius": 4.5, "circle-color": ["get", "color"], "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff" },
      });
      map.addSource("area", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#2b2b2b", "fill-opacity": 0.04 } });
      map.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#2b2b2b", "line-width": 1.5, "line-dasharray": [3, 2] } });
      setStyleVersion((v) => v + 1);
    });

    let start: { lngLat: LngLat; x: number; y: number } | null = null;
    const draft = (items: Polygon[]) => (map.getSource("area") as GeoJSONSource | undefined)?.setData(polygons(items));
    map.on("mousedown", (e) => {
      if (!handlers.current.drawing) return;
      e.preventDefault();
      start = { lngLat: e.lngLat, x: e.point.x, y: e.point.y };
    });
    map.on("mouseup", (e) => {
      if (!start) return;
      const dragged = Math.hypot(e.point.x - start.x, e.point.y - start.y) >= MIN_DRAG_PX;
      const bbox = boxOf(start.lngLat, e.lngLat);
      start = null;
      if (dragged) handlers.current.onDrawn(bbox);
      else draft(handlers.current.area ? [handlers.current.area] : []);
    });

    const hit = (point: { x: number; y: number }) => {
      const found = map.queryRenderedFeatures([point.x, point.y], { layers: ["event-fill", "event-hatch", "site-dot", "site-ring"] }) as MapGeoJSONFeature[];
      const isEvent = (f: MapGeoJSONFeature) => f.layer.id === "event-fill" || f.layer.id === "event-hatch";
      return { ev: found.find(isEvent), site: found.find((f) => !isEvent(f)) };
    };

    map.on("mousemove", (e) => {
      if (start) return void draft([bboxPolygon(boxOf(start.lngLat, e.lngLat))]);
      if (handlers.current.drawing) return;
      const { ev, site } = hit(e.point);
      handlers.current.onHover(ev ? String(ev.properties.id) : null);
      handlers.current.onCursor([e.lngLat.lng, e.lngLat.lat]);
      map.getCanvas().style.cursor = ev || site ? "pointer" : "";
      const text = ev ? String(ev.properties.title) : site ? String(site.properties.name) : null;
      setTip(text ? { x: e.point.x, y: e.point.y, text } : null);
    });
    map.on("mouseout", () => {
      handlers.current.onHover(null);
      handlers.current.onCursor(null);
      setTip(null);
    });
    map.on("click", (e) => {
      if (handlers.current.drawing) return;
      const { ev, site } = hit(e.point);
      if (ev) handlers.current.onEvent(String(ev.properties.id));
      else if (site) handlers.current.onSite(String(site.properties.id));
      else handlers.current.onEvent(null);
    });
    map.on("moveend", () => {
      const c = map.getCenter();
      handlers.current.onCamera({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
    });

    return () => {
      handlers.current.onMap(null);
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!styleVersion) return;
    (mapRef.current?.getSource("sites") as GeoJSONSource | undefined)?.setData(props.sites);
  }, [styleVersion, props.sites]);

  useEffect(() => {
    if (!styleVersion) return;
    (mapRef.current?.getSource("events") as GeoJSONSource | undefined)?.setData(props.shapes);
  }, [styleVersion, props.shapes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!styleVersion || !map || !props.selectedId) return;
    const id = props.selectedId;
    map.setFeatureState({ source: "events", id }, { selected: true });
    return () => {
      if (map.getSource("events")) map.setFeatureState({ source: "events", id }, { selected: false });
    };
  }, [styleVersion, props.selectedId, props.shapes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!styleVersion || !map || !props.hoveredId) return;
    const id = props.hoveredId;
    map.setFeatureState({ source: "events", id }, { hover: true });
    return () => {
      if (map.getSource("events")) map.setFeatureState({ source: "events", id }, { hover: false });
    };
  }, [styleVersion, props.hoveredId, props.shapes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!styleVersion || !map) return;
    const ids = props.highlightIds;
    for (const id of ids) map.setFeatureState({ source: "events", id }, { similar: true });
    return () => {
      if (map.getSource("events")) for (const id of ids) map.setFeatureState({ source: "events", id }, { similar: false });
    };
  }, [styleVersion, props.highlightIds, props.shapes]);

  useEffect(() => {
    if (!styleVersion) return;
    (mapRef.current?.getSource("area") as GeoJSONSource | undefined)?.setData(polygons(props.area ? [props.area] : []));
  }, [styleVersion, props.area]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.drawing) map.dragPan.disable();
    else map.dragPan.enable();
    map.getCanvas().style.cursor = props.drawing ? "crosshair" : "";
  }, [props.drawing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!styleVersion || !map) return;
    const src = map.getSource("radar") as ImageSource | undefined;
    if (props.radar) src?.updateImage({ url: props.radar.url, coordinates: props.radar.coordinates });
    map.setPaintProperty("radar", "raster-opacity", props.radar ? props.radarOpacity : 0);
  }, [styleVersion, props.radar, props.radarOpacity]);

  const dark = props.dark;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setStyle(basemap(dark));
    // Restyle only when the theme flips; the style.load handler re-adds every layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  const focusKey = props.focus?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.focus) return;
    const [w, s, e, n] = props.focus.bbox;
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: { top: 56, bottom: 56, left: 56, right: 56 + props.rightInset }, duration: 1600, essential: true, maxZoom: props.focus.maxZoom ?? 10 },
    );
    // Fly only when the focus target changes, not on every render of the same bbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey]);

  return (
    <div className={ui.mapWrap}>
      <div ref={container} className={ui.map} />
      {tip && (
        <div className={styles.tip} style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
