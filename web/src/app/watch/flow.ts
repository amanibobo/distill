import type { BBox, CheckResult, TypeChange, Watch, WatchShape } from "@/app/watch/model";

export type FeedItem = { date: string; index: number; baseline: boolean; changes: TypeChange[] };

export type Replay =
  | { status: "idle" }
  | { status: "running" | "done"; next: number; feed: FeedItem[]; shapes: WatchShape[]; error: string | null };

// Watching inside the map, one step at a time. "site" means not watching; then draw an area, name it, watch and replay.
export type Flow =
  | { step: "site" }
  | { step: "draw"; site: string; drawing: boolean }
  | { step: "name"; site: string; bbox: BBox; saving: boolean; error: string | null }
  | { step: "watch"; site: string; watch: Watch; replay: Replay };

export type Action =
  | { type: "site"; site: string }
  | { type: "propose"; site: string; bbox: BBox }
  | { type: "close" }
  | { type: "back" }
  | { type: "draw" }
  | { type: "cancelDraw" }
  | { type: "drawn"; bbox: BBox }
  | { type: "save" }
  | { type: "saveFailed"; error: string }
  | { type: "open"; watch: Watch }
  | { type: "replay" }
  | { type: "stop" }
  | { type: "checked"; watchId: string; index: number; total: number; result: CheckResult }
  | { type: "checkFailed"; watchId: string; error: string };

export function reduce(flow: Flow, a: Action): Flow {
  switch (a.type) {
    case "site":
      return { step: "draw", site: a.site, drawing: true };
    case "propose":
      return { step: "name", site: a.site, bbox: a.bbox, saving: false, error: null };
    case "close":
      return { step: "site" };
    case "back":
      return flow.step === "watch" || flow.step === "name" ? { step: "draw", site: flow.site, drawing: true } : { step: "site" };
    case "draw":
      return flow.step === "site" ? flow : { step: "draw", site: flow.site, drawing: true };
    case "cancelDraw":
      return flow.step === "draw" ? { ...flow, drawing: false } : flow;
    case "drawn":
      if (flow.step === "name") return { ...flow, bbox: a.bbox };
      return flow.step === "draw" ? { step: "name", site: flow.site, bbox: a.bbox, saving: false, error: null } : flow;
    case "save":
      return flow.step === "name" ? { ...flow, saving: true, error: null } : flow;
    case "saveFailed":
      return flow.step === "name" ? { ...flow, saving: false, error: a.error } : flow;
    case "open":
      return flow.step === "site" ? flow : { step: "watch", site: flow.site, watch: a.watch, replay: { status: "idle" } };
    case "replay":
      return flow.step === "watch" ? { ...flow, replay: { status: "running", next: 0, feed: [], shapes: [], error: null } } : flow;
    case "stop":
      return flow.step === "watch" && flow.replay.status === "running" ? { ...flow, replay: { ...flow.replay, status: "done" } } : flow;
    case "checked": {
      if (flow.step !== "watch" || flow.watch.id !== a.watchId || flow.replay.status !== "running" || flow.replay.next !== a.index) return flow;
      const item: FeedItem = { date: a.result.pass_date, index: a.index, baseline: a.result.baseline, changes: a.result.changes };
      const next = a.index + 1;
      return {
        ...flow,
        replay: { ...flow.replay, status: next >= a.total ? "done" : "running", next, feed: [item, ...flow.replay.feed], shapes: a.result.shapes },
      };
    }
    case "checkFailed":
      if (flow.step !== "watch" || flow.watch.id !== a.watchId || flow.replay.status === "idle") return flow;
      return { ...flow, replay: { ...flow.replay, status: "done", error: a.error } };
  }
}
