import type { ChangeType } from "@/lib/change-types";
import type { EventStatus } from "@/lib/types";

export const TOOL_NAMES = ["list_sites", "search_events", "count_events", "get_event", "similar_events"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type AskHit = {
  id: string;
  site: string;
  site_name: string;
  title: string;
  change_type: ChangeType;
  area_km2: number;
  onset: string;
  recovery: string | null;
  status: EventStatus;
};

// One NDJSON line of the /api/ask stream.
export type AskEvent =
  | { type: "step"; id: string; tool: ToolName; input: unknown; label: string }
  | { type: "step_result"; id: string; ok: boolean; summary: string; ms: number }
  | { type: "text"; delta: string }
  | { type: "results"; events: AskHit[] }
  | { type: "done" }
  | { type: "error"; message: string };

export const MAX_RESULTS = 12;

export const EVENT_ID = /\b[a-z][a-z0-9_]*-\d{4}-\d{2,3}\b/g;
