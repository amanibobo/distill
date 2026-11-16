import { Label } from "@/components/prose";
import { Sketch, type Shape } from "@/components/sketch";
import meta from "../../../../public/explore/venezuela/meta.json";

const box = (x: number, y: number, w: number, h: number, label: string | string[], fill?: Extract<Shape, { kind: "box" }>["fill"]): Shape => ({
  kind: "box",
  x,
  y,
  w,
  h,
  label,
  fill,
});

const arrow = (from: [number, number], to: [number, number], label?: string, labelAt?: [number, number]): Shape => ({ kind: "arrow", from, to, label, labelAt });

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function ExploreSketch() {
  return (
    <Sketch
      label="Explore pipeline: a GUNW interferogram window and the GLO-30 DEM are streamed onto one 512 pixel grid, unwrapped phase becomes line-of-sight centimetres, and the browser drapes it over the terrain."
      caption="One pair of passes, one grid. The browser only colors what the pipeline measured."
      width={760}
      height={250}
      shapes={[
        box(16, 30, 160, 76, ["NISAR GUNW", "pair on ASF"], "blue"),
        box(16, 150, 160, 76, ["GLO-30 DEM", "public tiles"], "gray"),
        box(236, 30, 190, 76, ["phase − ionosphere", "→ centimetres"], "yellow"),
        box(236, 150, 190, 76, ["same 512 px grid", `${meta.extent_km} km across`]),
        box(486, 90, 120, 76, ["coherence", "mask"], "orange"),
        box(650, 90, 96, 76, ["3D", "terrain"], "green"),
        arrow([178, 68], [234, 68], "window only", [206, 48]),
        arrow([178, 188], [234, 188]),
        arrow([428, 68], [484, 116]),
        arrow([428, 188], [484, 142]),
        arrow([608, 128], [648, 128]),
      ]}
    />
  );
}

export function ExploreSection() {
  return (
    <section aria-labelledby="explore">
      <Label id="explore">watching the ground move</Label>
      <p>
        For ground motion Distill uses GUNW, NISAR&apos;s unwrapped interferogram. It compares two passes and records how far each spot
        moved toward or away from the satellite. For the {meta.name}, the pair from {day(meta.pair.reference)} and {day(meta.pair.secondary)}{" "}
        on track {meta.pair.track} brackets the 24 June shocks. The pipeline subtracts the product&apos;s ionosphere estimate, turns phase into
        centimetres, and fades pixels with coherence below {meta.coherence.threshold}. In this {meta.extent_km} km window the ground moved
        about {Math.round(meta.displacement.p99)} cm toward the satellite and {Math.round(Math.abs(meta.displacement.p1))} cm away,
        measured against the middle of the window. The time slider in Explore is a straight blend between the two passes, because the radar saw
        only the before and after.
      </p>
      <ExploreSketch />
    </section>
  );
}
