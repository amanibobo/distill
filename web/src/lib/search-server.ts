import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CHANGE_TYPES } from "./change-types";
import { sql } from "./db";
import { listSites, siteEvents } from "./events-source";
import { chips, cleanFilter, FilterSchema, type SearchFilter, type SearchHit, type SearchResponse } from "./search";
import type { ChangeEvent, SiteSummary } from "./types";

const LIMIT = 30;
const client = new Anthropic();
const parsed = new Map<string, Promise<SearchFilter>>();

function system(sites: SiteSummary[]) {
  const siteLines = sites.map((s) => `- ${s.id}: ${s.name}, ${s.place}`).join("\n");
  const typeLines = Object.entries(CHANGE_TYPES)
    .map(([id, t]) => `- ${id}: ${t.label}`)
    .join("\n");
  return `You turn a question about surface change seen by the NISAR radar satellite into a search filter.

Today is 15 November 2026. Radar passes ran from 16 June to 7 November 2026, so every event started in that window. A month with no year means 2026. "Since August" means on or after 2026-08-01.

Sites:
${siteLines}

Change types:
${typeLines}

Rules:
- Map a place to the sites whose name or place covers it, such as a state, country, county or region. If the question names a place no site covers, put it in unknown_place and leave sites empty.
- Words like farmland, crops or fields describe land, not a change type. Only add harvest or crop_growth when the question asks about harvesting or growing crops.
- Fires, burns and burn scars are fire_scar. Use "other" only when the question asks for unexplained or other change.
- "Still growing", "spreading" or "expanding" is status growing. "Still", "ongoing" or "active" alone is ongoing. "Ended", "receded" or "over" is recovered.
- Big or large means at least 10 km², huge means at least 100 km², unless the question gives a number.
- Leave every field the question doesn't mention empty or null.`;
}

function parseQuery(q: string, sites: SiteSummary[]): Promise<SearchFilter> {
  const key = q.trim().toLowerCase().replace(/\s+/g, " ");
  const hit = parsed.get(key);
  if (hit) return hit;
  const job = client.beta.messages
    .parse({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(FilterSchema) },
      system: system(sites),
      messages: [{ role: "user", content: q }],
    })
    .then((res) => {
      if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`search parse stopped: ${res.stop_reason}`);
      return res.parsed_output;
    });
  parsed.set(key, job);
  job.catch(() => parsed.delete(key));
  return job;
}

function matches(f: SearchFilter, e: ChangeEvent) {
  if (f.types.length ? !f.types.includes(e.change_type) : e.change_type === "other") return false;
  if (f.sites.length && !f.sites.includes(e.site)) return false;
  if (f.after && e.onset < f.after) return false;
  if (f.before && e.onset >= f.before) return false;
  if (f.min_area_km2 && e.area_km2 < f.min_area_km2) return false;
  if (f.status === "growing" && e.status !== "growing") return false;
  if (f.status === "ongoing" && e.recovery) return false;
  if (f.status === "recovered" && !e.recovery) return false;
  return true;
}

async function run(f: SearchFilter, sites: SiteSummary[]): Promise<SearchHit[]> {
  if (f.unknown_place) return [];
  if (sql) {
    return sql<SearchHit[]>`
      select e.id, e.site, s.name as "siteName", coalesce(e.title, '') as title, e.change_type, e.area_km2,
        to_char(e.onset, 'YYYY-MM-DD') as onset, to_char(e.recovery, 'YYYY-MM-DD') as recovery
      from events e join sites s on s.id = e.site
      where ${f.types.length ? sql`e.change_type in ${sql(f.types)}` : sql`e.change_type <> 'other'`}
        ${f.sites.length ? sql`and e.site in ${sql(f.sites)}` : sql``}
        ${f.after ? sql`and e.onset >= ${f.after}::date` : sql``}
        ${f.before ? sql`and e.onset < ${f.before}::date` : sql``}
        ${f.min_area_km2 ? sql`and e.area_km2 >= ${f.min_area_km2}` : sql``}
        ${f.status === "growing" ? sql`and e.status = 'growing'` : sql``}
        ${f.status === "ongoing" ? sql`and e.recovery is null` : sql``}
        ${f.status === "recovered" ? sql`and e.recovery is not null` : sql``}
      order by e.area_km2 desc
      limit ${LIMIT}`;
  }
  const lists = await Promise.all(sites.map(async (s) => ({ s, events: await siteEvents(s.id) })));
  return lists
    .flatMap(({ s, events }) =>
      events
        .filter((e) => matches(f, e))
        .map((e) => ({
          id: e.id,
          site: e.site,
          siteName: s.name,
          title: e.title ?? "",
          change_type: e.change_type,
          area_km2: e.area_km2,
          onset: e.onset,
          recovery: e.recovery,
        })),
    )
    .sort((a, b) => b.area_km2 - a.area_km2)
    .slice(0, LIMIT);
}

function joinNames(names: string[]) {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

async function suggest(f: SearchFilter, sites: SiteSummary[]): Promise<string> {
  if (f.unknown_place) return `Distill has no site in ${f.unknown_place} yet. It watches ${joinNames(sites.map((s) => s.name))}.`;
  const name = (id: string) => sites.find((s) => s.id === id)?.name ?? id;
  const relaxed = await Promise.all(chips(f, name).map(async (c) => ({ c, n: (await run(c.without, sites)).length })));
  const best = relaxed.filter((r) => r.n > 0).sort((a, b) => b.n - a.n)[0];
  if (best)
    return `Nothing matches all of that. Remove “${best.c.label}” to see ${best.n === LIMIT ? `${LIMIT} or more` : best.n} ${best.n === 1 ? "change" : "changes"}.`;
  return "Nothing matches yet. Try a broader question.";
}

export async function search(input: { q: string } | { filter: SearchFilter }): Promise<SearchResponse> {
  const sites = await listSites();
  const raw = "q" in input ? await parseQuery(input.q, sites) : input.filter;
  const filter = cleanFilter(
    raw,
    sites.map((s) => s.id),
  );
  const results = await run(filter, sites);
  return { filter, results, suggestion: results.length ? null : await suggest(filter, sites) };
}
