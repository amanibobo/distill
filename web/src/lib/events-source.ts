import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "./db";
import type { ChangeType } from "./change-types";
import type { ChangeEvent, SiteSummary } from "./types";

// Without DATABASE_URL the app previews the pipeline's own output files, so the map works before Postgres is set up.
const OUT = path.join(process.cwd(), "..", "pipeline", "out");

type OutFile = {
  site: { id: string; name: string; place: string; bbox: [number, number, number, number] };
  passes: SiteSummary["passes"];
  events: ChangeEvent[];
};

async function outFiles(): Promise<OutFile[]> {
  const names = (await readdir(OUT)).filter((n) => n.endsWith(".json"));
  return Promise.all(names.map(async (n) => JSON.parse(await readFile(path.join(OUT, n), "utf8")) as OutFile));
}

export async function listSites(): Promise<SiteSummary[]> {
  if (sql) {
    return sql<SiteSummary[]>`
      select s.id, s.name, s.place,
        array[ST_XMin(s.bbox), ST_YMin(s.bbox), ST_XMax(s.bbox), ST_YMax(s.bbox)]::float8[] as bbox,
        s.passes,
        coalesce((select jsonb_object_agg(change_type, n) from (
          select change_type, count(*)::int as n from events e where e.site = s.id group by change_type
        ) c), '{}'::jsonb) as counts
      from sites s
      order by s.name`;
  }
  const files = await outFiles();
  return files
    .map((f) => {
      const counts: Partial<Record<ChangeType, number>> = {};
      for (const e of f.events) counts[e.change_type] = (counts[e.change_type] ?? 0) + 1;
      return { ...f.site, passes: f.passes, counts };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function siteEvents(id: string): Promise<ChangeEvent[]> {
  if (sql) {
    return sql<ChangeEvent[]>`
      select id, site, change_type, confidence, reason, title, summary, area_km2,
        to_char(onset, 'YYYY-MM-DD') as onset, to_char(peak, 'YYYY-MM-DD') as peak,
        to_char(last_seen, 'YYYY-MM-DD') as last_seen, to_char(recovery, 'YYYY-MM-DD') as recovery,
        status, footprint_by_pass, signature
      from events where site = ${id}
      order by area_km2 desc`;
  }
  const file = (await outFiles()).find((f) => f.site.id === id);
  if (!file) return [];
  return file.events
    .map((e) => ({
      id: e.id,
      site: e.site,
      change_type: e.change_type,
      confidence: e.confidence,
      reason: e.reason,
      title: e.title,
      summary: e.summary,
      area_km2: e.area_km2,
      onset: e.onset,
      peak: e.peak,
      last_seen: e.last_seen,
      recovery: e.recovery,
      status: e.status,
      footprint_by_pass: e.footprint_by_pass,
      signature: e.signature,
    }))
    .sort((a, b) => b.area_km2 - a.area_km2);
}
