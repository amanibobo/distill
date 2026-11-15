"use client";

import { Map as MapLibre, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type LngLat } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import { CHANGE_TYPES } from "@/lib/change-types";
import { bboxPolygon, type BBox, type WatchShape } from "./model";
import atlas from "../map/atlas.module.css";
import styles from "./watch.module.css";

setWorkerUrl("/maplibre-gl-worker.mjs");

const BASEMAP = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
const MIN_DRAG_PX = 8;

export type Focus = { bbox: BBox; key: string };

type Props = {
  coverage: BBox | null;
  area: Polygon | null;
  drawing: boolean;
  shapes: WatchShape[];
  focus: Focus | null;
  onDrawn: (bbox: BBox) => void;
};

const boxOf = (a: LngLat, b: LngLat): BBox => [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)];

const polygons = (items: Polygon[]): FeatureCollection => ({
  type: "FeatureCollection",
  features: items.map((geometry) => ({ type: "Feature", geometry, properties: {} })),
});

export function WatchMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const [ready, setReady] = useState(false);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });

  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibre({
      container: container.current,
      style: BASEMAP,
      center: [-60, 35],
      zoom: 1.8,
      renderWorldCopies: false,
      attributionControl: { compact: true },
      maxPitch: 0,
      dragRotate: false,
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-left");

    map.on("style.load", () => {
      map.addSource("coverage", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "coverage", type: "line", source: "coverage", paint: { "line-color": "#a3a3a3", "line-width": 1, "line-dasharray": [2, 3] } });
      map.addSource("full", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "full", type: "fill", source: "full", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.12 } });
      map.addSource("inside", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "inside-fill", type: "fill", source: "inside", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.5 } });
      map.addLayer({ id: "inside-line", type: "line", source: "inside", paint: { "line-color": ["get", "color"], "line-width": 1 } });
      map.addSource("area", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#2b2b2b", "fill-opacity": 0.04 } });
      map.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#2b2b2b", "line-width": 1.5 } });
      setReady(true);
    });

    let start: { lngLat: LngLat; x: number; y: number } | null = null;
    const draft = (bbox: BBox) => (map.getSource("area") as GeoJSONSource | undefined)?.setData(polygons([bboxPolygon(bbox)]));

    map.on("mousedown", (e) => {
      if (!live.current.drawing) return;
      e.preventDefault();
      start = { lngLat: e.lngLat, x: e.point.x, y: e.point.y };
    });
    map.on("mousemove", (e) => {
      if (start) draft(boxOf(start.lngLat, e.lngLat));
    });
    map.on("mouseup", (e) => {
      if (!start) return;
      const dragged = Math.hypot(e.point.x - start.x, e.point.y - start.y) >= MIN_DRAG_PX;
      const bbox = boxOf(start.lngLat, e.lngLat);
      start = null;
      if (dragged) live.current.onDrawn(bbox);
      else (map.getSource("area") as GeoJSONSource | undefined)?.setData(polygons(live.current.area ? [live.current.area] : []));
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (props.drawing) map.dragPan.disable();
    else map.dragPan.enable();
    map.getCanvas().style.cursor = props.drawing ? "crosshair" : "";
  }, [props.drawing]);

  useEffect(() => {
    if (!ready) return;
    (mapRef.current?.getSource("coverage") as GeoJSONSource | undefined)?.setData(polygons(props.coverage ? [bboxPolygon(props.coverage)] : []));
  }, [ready, props.coverage]);

  useEffect(() => {
    if (!ready) return;
    (mapRef.current?.getSource("area") as GeoJSONSource | undefined)?.setData(polygons(props.area ? [props.area] : []));
  }, [ready, props.area]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const collect = (pick: (s: WatchShape) => WatchShape["full"]): FeatureCollection => ({
      type: "FeatureCollection",
      features: props.shapes.map((s) => ({ type: "Feature", geometry: pick(s), properties: { color: CHANGE_TYPES[s.change_type].color } })),
    });
    (map.getSource("full") as GeoJSONSource | undefined)?.setData(collect((s) => s.full));
    (map.getSource("inside") as GeoJSONSource | undefined)?.setData(collect((s) => s.inside));
  }, [ready, props.shapes]);

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
      { padding: 56, duration: 1400, essential: true, maxZoom: 12 },
    );
    // Fly only when the focus target changes, not on every render of the same bbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey]);

  return (
    <div className={atlas.mapWrap}>
      <div ref={container} className={atlas.map} />
      {props.drawing && <div className={styles.drawHint}>Drag a box over the area to watch. Esc cancels.</div>}
    </div>
  );
}
