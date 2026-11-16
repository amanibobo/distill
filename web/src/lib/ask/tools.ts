import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CHANGE_TYPES, type ChangeType } from "@/lib/change-types";
import { sql } from "@/lib/db";
import { area, shortDate } from "@/lib/format";
import type { Footprint } from "@/lib/types";
import type { AskHit, ToolName } from "./protocol";

type Sql = NonNullable<typeof sql>;

const TYPE_IDS = Object.keys(CHANGE_TYPES) as [ChangeType, ...ChangeType[]];
const STATUS_IDS = ["growing", "stable", "receding", "recovered", "ongoing"] as const;
const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const filterShape = {
  types: z
    .array(z.enum(TYPE_IDS))
    .optional()
    .describe("Change types to include. Omit for every type except other, which is only included when listed."),
  sites: z.array(z.string()).optional().describe("Site ids from list_sites. Omit for every site."),
  after: z.string().refine(isIsoDate).optional().describe("Onset on or after this date, YYYY-MM-DD."),
  before: z.string().refine(isIsoDate).optional().describe("Onset before this date, YYYY-MM-DD."),
  min_area_km2: z.number().optional().describe("Smallest event area in km²."),
  status: z
    .enum(STATUS_IDS)
    .optional()
    .describe("growing: still spreading at the last pass. stable or receding: still present. recovered: back to normal. ongoing: not recovered yet (growing, stable or receding)."),
};

type Filter = { [K in keyof typeof filterShape]?: z.infer<(typeof filterShape)[K]> };

const inputs = {
  list_sites: z.strictObject({}),
  search_events: z.strictObject({
    ...filterShape,
    sort: z.enum(["area", "onset"]).optional().describe("area: largest first (default). onset: earliest first."),
    limit: z.number().optional().describe("Rows to return, 1 to 30. Default 12."),
  }),
  count_events: z.strictObject({
    group_by: z.enum(["type", "site", "month"]).describe("month groups by onset month."),
    ...filterShape,
  }),
  get_event: z.strictObject({ id: z.string().describe("Event id, such as kaiser-0710-02.") }),
  similar_events: z.strictObject({
    id: z.string().describe("Event id to match against."),
    limit: z.number().optional().describe("Neighbors to return, 1 to 12. Default 8."),
  }),
} satisfies Record<ToolName, z.ZodType>;

type Inputs = { [K in ToolName]: z.infer<(typeof inputs)[K]> };

const descriptions: Record<ToolName, string> = {
  list_sites: "List every site Distill watches with its place, radar pass dates and event counts by change type. Use it to map a place name to site ids or to see what the data covers.",
  search_events: "Find change events matching filters. Returns rows with id, site, title, type, area, onset, recovery and status, plus the total number of matches.",
  count_events: "Count events and sum their area, grouped by type, site or onset month, under the same filters as search_events.",
  get_event: "Read one event in full: summary, the reason it got its type, lifecycle dates, and footprint area at each radar pass.",
  similar_events: "Find events whose radar signature is most like the given event's, across all sites, using embedding similarity. Returns neighbors with a similarity score from 0 to 1.",
};

export const TOOL_DEFS: Anthropic.Beta.BetaTool[] = (Object.keys(inputs) as ToolName[]).map((name) => {
  const schema: Record<string, unknown> = z.toJSONSchema(inputs[name], { io: "input" });
  delete schema.$schema;
  return {
    name,
    description: descriptions[name],
    strict: true,
    input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
  };
});

export type ToolOutput = { result: unknown; summary: string; hits: AskHit[] };

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const clamp = (n: number | undefined, lo: number, hi: number, fallback: number) => Math.min(hi, Math.max(lo, Math.round(n ?? fallback)));
const typeLabel = (t: ChangeType) => CHANGE_TYPES[t].label.toLowerCase();

function where(db: Sql, f: Filter) {
  const types = f.types?.length ? f.types : null;
  return db`
    ${types ? db`e.change_type in ${db(types)}` : db`e.change_type <> 'other'`}
    ${f.sites?.length ? db`and e.site in ${db(f.sites)}` : db``}
    ${f.after ? db`and e.onset >= ${f.after}::date` : db``}
    ${f.before ? db`and e.onset < ${f.before}::date` : db``}
    ${f.min_area_km2 ? db`and e.area_km2 >= ${f.min_area_km2}` : db``}
    ${f.status === "ongoing" ? db`and e.recovery is null` : f.status ? db`and e.status = ${f.status}` : db``}`;
}

const HIT_COLUMNS = (db: Sql) => db`
  e.id, e.site, s.name as site_name, coalesce(e.title, '') as title, e.change_type, round(e.area_km2::numeric, 2)::float8 as area_km2,
  to_char(e.onset, 'YYYY-MM-DD') as onset, to_char(e.recovery, 'YYYY-MM-DD') as recovery, e.status`;

const toHit = (r: AskHit): AskHit => ({
  id: r.id,
  site: r.site,
  site_name: r.site_name,
  title: r.title,
  change_type: r.change_type,
  area_km2: r.area_km2,
  onset: r.onset,
  recovery: r.recovery,
  status: r.status,
});

type Runner<K extends ToolName> = (db: Sql, input: Inputs[K]) => Promise<ToolOutput>;

const runners: { [K in ToolName]: Runner<K> } = {
  async list_sites(db) {
    const rows = await db<{ id: string; name: string; place: string; passes: { date: string; baseline: boolean }[]; counts: Record<string, number> }[]>`
      select s.id, s.name, s.place, s.passes,
        coalesce((select jsonb_object_agg(change_type, n) from (
          select change_type, count(*)::int as n from events e where e.site = s.id group by change_type
        ) c), '{}'::jsonb) as counts
      from sites s order by s.name`;
    const result = rows.map((s) => {
      const dates = s.passes.map((p) => p.date).sort();
      return { id: s.id, name: s.name, place: s.place, passes: dates.length, first_pass: dates[0], last_pass: dates.at(-1), counts: s.counts };
    });
    return { result, summary: plural(rows.length, "site"), hits: [] };
  },

  async search_events(db, input) {
    const limit = clamp(input.limit, 1, 30, 12);
    const order = input.sort === "onset" ? db`e.onset, e.area_km2 desc` : db`e.area_km2 desc`;
    const rows = await db<(AskHit & { total: number })[]>`
      select ${HIT_COLUMNS(db)}, count(*) over ()::int as total
      from events e join sites s on s.id = e.site
      where ${where(db, input)}
      order by ${order}
      limit ${limit}`;
    const total = rows[0]?.total ?? 0;
    const hits = rows.map(toHit);
    const summary = total > hits.length ? `${hits.length} of ${plural(total, "event")}` : plural(total, "event");
    return { result: { total, events: hits }, summary, hits };
  },

  async count_events(db, input) {
    const key =
      input.group_by === "type" ? db`e.change_type` : input.group_by === "site" ? db`e.site` : db`to_char(e.onset, 'YYYY-MM')`;
    const rows = await db<{ key: string; events: number; area_km2: number }[]>`
      select ${key} as key, count(*)::int as events, round(sum(e.area_km2)::numeric, 1)::float8 as area_km2
      from events e
      where ${where(db, input)}
      group by 1 order by 1`;
    const total = rows.reduce((n, r) => n + r.events, 0);
    return { result: { total, groups: rows }, summary: `${plural(total, "event")} in ${plural(rows.length, "group")}`, hits: [] };
  },

  async get_event(db, { id }) {
    const [row] = await db<
      (AskHit & { summary: string | null; reason: string; confidence: number; peak: string; last_seen: string; footprint_by_pass: Footprint[] })[]
    >`
      select ${HIT_COLUMNS(db)}, e.summary, e.reason, round(e.confidence::numeric, 2)::float8 as confidence,
        to_char(e.peak, 'YYYY-MM-DD') as peak, to_char(e.last_seen, 'YYYY-MM-DD') as last_seen,
        (select jsonb_agg(jsonb_build_object('date', f->>'date', 'area_km2', (f->>'area_km2')::float8) order by f->>'date')
          from jsonb_array_elements(e.footprint_by_pass) f) as footprint_by_pass
      from events e join sites s on s.id = e.site
      where e.id = ${id}`;
    if (!row) throw new ToolError(`No event with id ${id}.`);
    const { summary, reason, confidence, peak, last_seen, footprint_by_pass, ...hit } = row;
    return {
      result: {
        ...hit,
        summary,
        reason,
        confidence,
        lifecycle: { onset: hit.onset, peak, last_seen, recovery: hit.recovery, status: hit.status },
        footprint_by_pass,
      },
      summary: `${CHANGE_TYPES[hit.change_type].label}, ${area(hit.area_km2)}`,
      hits: [toHit(hit)],
    };
  },

  async similar_events(db, input) {
    const limit = clamp(input.limit, 1, 12, 8);
    const [source] = await db<{ embedding: string | null; change_type: ChangeType }[]>`
      select embedding::text as embedding, change_type from events where id = ${input.id}`;
    if (!source) throw new ToolError(`No event with id ${input.id}.`);
    if (!source.embedding) throw new ToolError(`Event ${input.id} has no embedding yet.`);
    // Same query as /api/similar: strict iterative scan keeps the HNSW index exact under the type
    // filter, and at most 4 rows per site keep sibling fragments from crowding out other sites.
    const rows = await db.begin(async (tx) => {
      await tx`set local hnsw.iterative_scan = strict_order`;
      return tx<(AskHit & { similarity: number })[]>`
        select id, site, site_name, title, change_type, area_km2, onset, recovery, status,
          round(greatest(0, 1 - distance)::numeric, 3)::float8 as similarity
        from (
          select * from (
            select *, row_number() over (partition by site order by distance) as site_rank from (
              select ${HIT_COLUMNS(db)}, e.embedding <=> ${source.embedding}::vector as distance
              from events e join sites s on s.id = e.site
              where e.id <> ${input.id} and e.embedding is not null
                and (${source.change_type} = 'other' or e.change_type <> 'other')
              order by e.embedding <=> ${source.embedding}::vector
              limit 64
            ) near
          ) ranked
          order by site_rank > 4, distance
          limit ${limit}
        ) picked
        order by distance`;
    });
    const sites = new Set(rows.map((r) => r.site)).size;
    return {
      result: rows,
      summary: `${plural(rows.length, "match", "matches")} across ${plural(sites, "site")}`,
      hits: rows.map(toHit),
    };
  },
};

export class ToolError extends Error {}

export function isToolName(name: string): name is ToolName {
  return name in inputs;
}

// Tool input comes from the model, so it is parsed here before any query runs.
export function parseInput(name: ToolName, input: unknown): { ok: true; input: unknown } | { ok: false; message: string } {
  const parsed = inputs[name].safeParse(input);
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, message: `Invalid input: ${z.prettifyError(parsed.error)}` };
}

export function runTool(name: ToolName, input: unknown): Promise<ToolOutput> {
  if (!sql) throw new ToolError("The events database is not configured.");
  return (runners[name] as Runner<ToolName>)(sql, input as never);
}

function filterWords(f: Filter, siteName: (id: string) => string) {
  const types = f.types?.length ? f.types.map((t) => (t === "fire_scar" ? "fires" : t === "flood" ? "floods" : typeLabel(t))).join(", ") : "events";
  const parts = [f.status === "growing" ? `growing ${types}` : f.status === "recovered" ? `recovered ${types}` : types];
  if (f.status === "ongoing") parts.push("still active");
  if (f.sites?.length) parts.push(`in ${f.sites.map(siteName).join(", ")}`);
  if (f.min_area_km2) parts.push(`over ${area(f.min_area_km2)}`);
  if (f.after) parts.push(`since ${shortDate(f.after)}`);
  if (f.before) parts.push(`before ${shortDate(f.before)}`);
  return parts.join(" ");
}

export function stepLabel(name: ToolName, input: unknown, siteName: (id: string) => string): string {
  switch (name) {
    case "list_sites":
      return "Listing sites";
    case "search_events":
      return `Searching ${filterWords(input as Inputs["search_events"], siteName)}`;
    case "count_events": {
      const i = input as Inputs["count_events"];
      return `Counting ${filterWords(i, siteName)} by ${i.group_by}`;
    }
    case "get_event":
      return `Reading ${(input as Inputs["get_event"]).id}`;
    case "similar_events":
      return `Finding events like ${(input as Inputs["similar_events"]).id}`;
  }
}

export type SiteLine = { id: string; name: string; place: string };

export async function siteLines(): Promise<SiteLine[]> {
  if (!sql) return [];
  return sql<SiteLine[]>`select id, name, place from sites order by name`;
}

