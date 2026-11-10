"use client";

import { Map as MapLibre, setWorkerUrl, type GeoJSONSource, type ImageSource, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, MultiPolygon, Point } from "geojson";
import type { Camera } from "./url-state";
import styles from "./atlas.module.css";

setWorkerUrl("/maplibre-gl-worker.mjs");

const BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export type SitePoint = FeatureCollection<Point, { id: string; color: string; name: string }>;
export type EventShapes = FeatureCollection<MultiPolygon, { id: string; type: string; color: string; title: string }>;
export type Radar = { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] } | null;

type Props = {
  sites: SitePoint;
  shapes: EventShapes;
  radar: Radar;
  radarVisible: boolean;
  selectedId: string | null;
  focus: { bbox: [number, number, number, number]; key: string } | null;
  initialCamera: Camera | null;
  onSite: (id: string) => void;
  onEvent: (id: string | null) => void;
  onCamera: (c: Camera) => void;
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

    map.on("style.load", () => {
      map.addSource("radar", { type: "image", url: BLANK_IMAGE, coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] });
      map.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": 0, "raster-fade-duration": 0 } });
      map.addSource("events", { type: "geojson", data: EMPTY, promoteId: "id" });
      map.addLayer({
        id: "event-fill",
        type: "fill",
        source: "events",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.6, ["boolean", ["feature-state", "hover"], false], 0.48, 0.3],
        },
      });
      map.addLayer({
        id: "event-line",
        type: "line",
        source: "events",
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 2.2, 1],
          "line-opacity": 0.9,
        },
      });
      map.addSource("sites", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "site-glow",
        type: "circle",
        source: "sites",
        maxzoom: 7,
        paint: { "circle-radius": 22, "circle-color": ["get", "color"], "circle-blur": 1, "circle-opacity": 0.45 },
      });
      map.addLayer({
        id: "site-dot",
        type: "circle",
        source: "sites",
        maxzoom: 7,
        paint: { "circle-radius": 4.5, "circle-color": ["get", "color"], "circle-stroke-width": 1.5, "circle-stroke-color": "#0b0c0e" },
      });
      setReady(true);
    });

    let hovered: string | null = null;
    const setHover = (id: string | null) => {
      if (hovered) map.setFeatureState({ source: "events", id: hovered }, { hover: false });
      hovered = id;
      if (id) map.setFeatureState({ source: "events", id }, { hover: true });
    };

    map.on("mousemove", (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ["event-fill", "site-dot", "site-glow"] }) as MapGeoJSONFeature[];
      const ev = hit.find((f) => f.layer.id === "event-fill");
      const site = hit.find((f) => f.layer.id !== "event-fill");
      setHover(ev ? String(ev.properties.id) : null);
      map.getCanvas().style.cursor = ev || site ? "pointer" : "";
      const text = ev ? String(ev.properties.title) : site ? String(site.properties.name) : null;
      setTip(text ? { x: e.point.x, y: e.point.y, text } : null);
    });
    map.on("mouseout", () => {
      setHover(null);
      setTip(null);
    });
    map.on("click", (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ["event-fill", "site-dot", "site-glow"] }) as MapGeoJSONFeature[];
      const ev = hit.find((f) => f.layer.id === "event-fill");
      const site = hit.find((f) => f.layer.id !== "event-fill");
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
    if (!ready || !map) return;
    const src = map.getSource("radar") as ImageSource | undefined;
    if (props.radar) src?.updateImage({ url: props.radar.url, coordinates: props.radar.coordinates });
    map.setPaintProperty("radar", "raster-opacity", props.radar && props.radarVisible ? 0.42 : 0);
  }, [ready, props.radar, props.radarVisible]);

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
      { padding: { top: 80, bottom: 150, left: 360, right: 80 }, duration: 1800, essential: true, maxZoom: 10 },
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
