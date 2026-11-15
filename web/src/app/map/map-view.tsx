"use client";

import {
  Map as MapLibre,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type ImageSource,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, MultiPolygon, Point } from "geojson";
import type { Camera } from "./url-state";
import styles from "./atlas.module.css";

setWorkerUrl("/maplibre-gl-worker.mjs");

const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
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
};

export function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
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
      style: BASEMAP,
      center: cam ? [cam.lng, cam.lat] : [-20, 30],
      zoom: cam ? cam.zoom : 1.8,
      renderWorldCopies: false,
      attributionControl: { compact: true },
      maxPitch: 0,
      dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");
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
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], "#2f7bf6", ["get", "color"]],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2, ["boolean", ["feature-state", "hover"], false], 1.5, 1],
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
      setReady(true);
    });

    const hit = (point: { x: number; y: number }) => {
      const found = map.queryRenderedFeatures([point.x, point.y], { layers: ["event-fill", "event-hatch", "site-dot", "site-ring"] }) as MapGeoJSONFeature[];
      const isEvent = (f: MapGeoJSONFeature) => f.layer.id === "event-fill" || f.layer.id === "event-hatch";
      return { ev: found.find(isEvent), site: found.find((f) => !isEvent(f)) };
    };

    map.on("mousemove", (e) => {
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
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes flow through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    (mapRef.current?.getSource("sites") as GeoJSONSource | undefined)?.setData(props.sites);
  }, [ready, props.sites]);

  useEffect(() => {
    if (!ready) return;
    (mapRef.current?.getSource("events") as GeoJSONSource | undefined)?.setData(props.shapes);
  }, [ready, props.shapes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.selectedId) return;
    const id = props.selectedId;
    map.setFeatureState({ source: "events", id }, { selected: true });
    return () => {
      if (map.getSource("events")) map.setFeatureState({ source: "events", id }, { selected: false });
    };
  }, [ready, props.selectedId, props.shapes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.hoveredId) return;
    const id = props.hoveredId;
    map.setFeatureState({ source: "events", id }, { hover: true });
    return () => {
      if (map.getSource("events")) map.setFeatureState({ source: "events", id }, { hover: false });
    };
  }, [ready, props.hoveredId, props.shapes]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const src = map.getSource("radar") as ImageSource | undefined;
    if (props.radar) src?.updateImage({ url: props.radar.url, coordinates: props.radar.coordinates });
    map.setPaintProperty("radar", "raster-opacity", props.radar ? props.radarOpacity : 0);
  }, [ready, props.radar, props.radarOpacity]);

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
    <div className={styles.mapWrap}>
      <div ref={container} className={styles.map} />
      {tip && (
        <div className={styles.tip} style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
