import { Sketch, type Shape } from "@/components/sketch";

const box = (x: number, y: number, w: number, h: number, label: string | string[], fill?: Extract<Shape, { kind: "box" }>["fill"], dashed?: boolean): Shape => ({
  kind: "box",
  x,
  y,
  w,
  h,
  label,
  fill,
  dashed,
});

const arrow = (from: [number, number], to: [number, number], label?: string, labelAt?: [number, number]): Shape => ({ kind: "arrow", from, to, label, labelAt });

export function PipelineSketch() {
  return (
    <Sketch
      label="Offline pipeline: NISAR files on ASF are streamed per site into a 40 meter cube, segmented into events, labeled by rules and scored against independent maps."
      caption="Offline, once per site, on a laptop. Nothing is downloaded whole."
      width={760}
      height={300}
      shapes={[
        box(16, 40, 140, 76, ["NISAR GCOV", "files on ASF"], "blue"),
        box(196, 40, 150, 76, ["stream the site", "window only"]),
        box(386, 40, 150, 76, ["40 m cube", "pass × y × x"], "yellow"),
        box(576, 40, 168, 76, ["space-time", "events"], "orange"),
        arrow([158, 78], [194, 78]),
        arrow([348, 78], [384, 78]),
        arrow([538, 78], [574, 78]),
        box(576, 190, 168, 84, ["rules, reasons,", "Claude captions"], "green"),
        arrow([660, 118], [660, 188], "3D components", [700, 152]),
        box(386, 190, 150, 84, ["accuracy", "report"]),
        arrow([574, 232], [538, 232]),
        box(166, 190, 180, 84, ["independent maps", "fire, crops, water"], "gray", true),
        arrow([348, 232], [384, 232]),
        { kind: "text", x: 16, y: 232, text: ["never used", "to set a", "threshold"], size: 14, anchor: "start", color: "#868e96" },
      ]}
    />
  );
}

export function ServingSketch() {
  return (
    <Sketch
      label="Serving: events live in Supabase Postgres with PostGIS, Next.js API routes read them, MapLibre draws them on a globe over per-pass radar images."
      caption="Online. The app only reads what the pipeline already worked out, so it stays fast."
      width={760}
      height={200}
      shapes={[
        box(16, 50, 170, 84, ["events table", "in PostGIS"], "green"),
        box(240, 50, 150, 84, ["Next.js", "API routes"]),
        box(444, 50, 150, 84, ["MapLibre", "globe"], "blue"),
        box(620, 50, 124, 84, ["radar image", "per pass"], "yellow"),
        arrow([188, 92], [238, 92], "SQL", [213, 72]),
        arrow([392, 92], [442, 92], "JSON", [417, 72]),
        arrow([618, 92], [596, 92]),
        { kind: "text", x: 101, y: 166, text: "one row per event, with a footprint for every pass", size: 14, anchor: "start", color: "#868e96" },
      ]}
    />
  );
}

const SLICES = [
  { label: "baseline", r: 0 },
  { label: "onset", r: 0.35 },
  { label: "growing", r: 0.7 },
  { label: "peak", r: 1 },
  { label: "receding", r: 0.55 },
  { label: "recovered", r: 0 },
];

export function CubeSketch() {
  const shapes: Shape[] = [];
  SLICES.forEach((s, i) => {
    const x = 30 + i * 118;
    const y = 40;
    shapes.push({
      kind: "poly",
      points: [
        [x, y + 40],
        [x + 70, y],
        [x + 70, y + 150],
        [x, y + 190],
      ],
      fill: i === 0 ? "gray" : "none",
    });
    if (s.r > 0) {
      const w = 46 * s.r;
      const h = 90 * s.r;
      shapes.push({ kind: "ellipse", x: x + 35 - w / 2, y: y + 95 - h / 2, w, h, fill: "blue" });
    }
    shapes.push({ kind: "text", x: x + 35, y: 262, text: s.label, size: 15 });
  });
  shapes.push(arrow([30, 300], [730, 300], "time, one slice per pass, every 12 days", [380, 318]));
  return (
    <Sketch
      label="A space-time cube: six passes as slices; a flood appears at onset, grows to a peak, recedes and recovers, and is one connected event across the slices."
      caption="Each pass is a slice. Changed pixels that touch across neighboring slices form one event, so a flood keeps one identity from onset to recovery."
      width={760}
      height={340}
      shapes={shapes}
    />
  );
}

const QUESTIONS = [
  { q: ["Both polarizations darker by 5 dB or more,", "and back to normal soon?"], a: "Flood", fill: "blue" },
  { q: ["Cross-polarized return falls on cropland,", "starts in autumn and stays low?"], a: "Harvest", fill: "green" },
  { q: ["Falls over vegetation, stays low,", "and grows or covers a large area?"], a: "Fire scar", fill: "orange" },
  { q: ["A small forest patch", "that stays low?"], a: "Deforestation", fill: "violet" },
] as const;

export function RulesSketch() {
  const shapes: Shape[] = [];
  const top = 20;
  const step = 96;
  QUESTIONS.forEach((item, i) => {
    const y = top + i * step;
    shapes.push(box(20, y, 470, 70, [...item.q], undefined));
    shapes.push(arrow([492, y + 35], [574, y + 35], "yes", [533, y + 18]));
    shapes.push(box(576, y + 8, 160, 54, item.a, item.fill));
    shapes.push(arrow([255, y + 72], [255, y + step - 2], "no", [276, y + 84]));
  });
  shapes.push(box(150, top + QUESTIONS.length * step, 210, 54, "Other change", "gray"));
  return (
    <Sketch
      label="The rule list: each event is checked in order for the flood, harvest, fire scar and deforestation patterns, and falls through to other change."
      caption="The rules run in order. The first match wins, and its wording becomes the reason shown on the map."
      width={760}
      height={top + QUESTIONS.length * step + 74}
      shapes={shapes}
    />
  );
}

const INSIDE = [0, 0.51, -0.47, -0.64, -0.23, 0.72, -0.5, -0.91, -1.1, -1.23];
const OUTSIDE = [0, 0.28, -0.45, -0.45, 0.07, 0.75, 0, -0.29, -0.42, -0.59];
const DATES = ["19 Jun", "1 Jul", "13 Jul", "25 Jul", "18 Aug", "30 Aug", "11 Sep", "23 Sep", "5 Oct", "17 Oct"];

export function FireSignalSketch() {
  const x0 = 70;
  const x1 = 730;
  const y = (v: number) => 140 - v * 80;
  const x = (i: number) => x0 + (i / (INSIDE.length - 1)) * (x1 - x0);
  const fireX = (x(2) + x(3)) / 2 + 4;
  return (
    <Sketch
      label="Median change in cross-polarized radar return inside and outside the Kaiser Canyon fire perimeter at each pass. Inside falls to about -1.2 dB by October; outside falls to about -0.6 dB. Both rise on the rainy 30 August pass."
      caption="Median HV change from the June baseline, inside and outside the NIFC perimeter. The burn is a slow fall of about 1 dB, and the rain on 30 Aug lifts both lines. That is why Distill measures noise and removes scene-wide shifts before it looks for change."
      width={760}
      height={310}
      shapes={[
        { kind: "line", points: [[x0, y(0)], [x1, y(0)]], stroke: "#adb5bd", dashed: true },
        { kind: "text", x: x0 - 10, y: y(0), text: "0 dB", size: 13, anchor: "end", color: "#868e96" },
        { kind: "text", x: x0 - 10, y: y(-1), text: "-1 dB", size: 13, anchor: "end", color: "#868e96" },
        { kind: "line", points: [[x0 - 4, y(-1)], [x0 + 6, y(-1)]], stroke: "#adb5bd" },
        { kind: "line", points: [[fireX, 40], [fireX, 262]], stroke: "#e8590c", dashed: true },
        { kind: "text", x: fireX + 8, y: 48, text: "fire starts, 16 Jul", size: 14, anchor: "start", color: "#e8590c" },
        { kind: "text", x: x(5), y: y(0.72) - 18, text: "rain", size: 14, color: "#495057" },
        { kind: "line", points: OUTSIDE.map((v, i) => [x(i), y(v)] as [number, number]), stroke: "#868e96", width: 2 },
        { kind: "line", points: INSIDE.map((v, i) => [x(i), y(v)] as [number, number]), stroke: "#e8590c", width: 2.4 },
        { kind: "text", x: x(7) - 6, y: y(-0.91) + 26, text: "inside the burn", size: 14, anchor: "end", color: "#e8590c" },
        { kind: "text", x: x(8), y: y(-0.42) - 22, text: "outside", size: 14, anchor: "middle", color: "#868e96" },
        ...DATES.flatMap((d, i) => (i % 3 === 0 || i === DATES.length - 1 ? [{ kind: "text" as const, x: x(i), y: 292, text: d, size: 13, color: "#868e96" }] : [])),
      ]}
    />
  );
}
