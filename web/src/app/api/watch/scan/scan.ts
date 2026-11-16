import "server-only";
import { z } from "zod";
import type { Sql } from "postgres";
import type { NewPass, ScanStatus } from "@/app/watch/model";

const ASF_SEARCH = "https://api.daac.asf.alaska.edu/services/search/param";

// What ASF needs to look for passes over one watch: the site's track and orbit direction, the
// watch's bounding box, and the last pass Distill has already processed for that site.
export type ScanTarget = {
  id: string;
  site: string;
  track: number;
  direction: string | null;
  last_pass: string | null;
  west: number;
  south: number;
  east: number;
  north: number;
};

export type ScanOutcome = { status: ScanStatus; alerts_written: number };

const AsfResults = z.object({
  features: z.array(z.object({ properties: z.object({ fileID: z.string(), startTime: z.string() }) })),
});

// The direction letter is read from the newest processed granule name, field 7 of
// NISAR_L2_PR_GCOV_<cycle>_<track>_<A|D>_<frame>_..., so it always matches what the pipeline read.
export function scanTargets(sql: Sql, id?: string) {
  return sql<ScanTarget[]>`
    select w.id, w.site, s.track,
      (select split_part(p->>'pass_id', '_', 7) from jsonb_array_elements(s.passes) p order by p->>'date' desc limit 1) as direction,
      (select max(p->>'date') from jsonb_array_elements(s.passes) p) as last_pass,
      ST_XMin(w.area) as west, ST_YMin(w.area) as south, ST_XMax(w.area) as east, ST_YMax(w.area) as north
    from watches w join sites s on s.id = w.site
    ${id ? sql`where w.id = ${id}` : sql``}
    order by w.created_at`;
}

const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

// Port of distill.fetch.find_passes: provisional GCOV only, on the site's track and direction,
// keeping the newest reprocessing of each frame per day.
export async function findNewPasses(t: ScanTarget): Promise<NewPass[]> {
  if (!t.last_pass || (t.direction !== "A" && t.direction !== "D")) {
    throw new Error(`Site ${t.site} has no processed passes to compare against.`);
  }
  const { west: w, south: s, east: e, north: n } = t;
  const params = new URLSearchParams({
    dataset: "NISAR",
    processingLevel: "GCOV",
    relativeOrbit: String(t.track),
    flightDirection: t.direction === "A" ? "ASCENDING" : "DESCENDING",
    intersectsWith: `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`,
    start: `${nextDay(t.last_pass)}T00:00:00Z`,
    output: "geojson",
  });
  const res = await fetch(`${ASF_SEARCH}?${params}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new Error(`ASF search answered ${res.status}.`);
  const { features } = AsfResults.parse(await res.json());

  const latest = new Map<string, NewPass>();
  for (const { properties: p } of features) {
    const parts = p.fileID.split("_");
    if (parts[2] !== "PR" || parts[3] !== "GCOV" || Number(parts[5]) !== t.track || parts[6] !== t.direction) continue;
    const date = p.startTime.slice(0, 10);
    if (date <= t.last_pass) continue;
    const key = `${date}:${parts[7]}`;
    const prev = latest.get(key);
    if (!prev || p.fileID > prev.granule_id) latest.set(key, { date, granule_id: p.fileID, track: t.track });
  }
  return [...latest.values()].sort((a, b) => a.date.localeCompare(b.date) || a.granule_id.localeCompare(b.granule_id));
}

type ScanRow = { checked_at: Date; newest_pass_date: string | null; new_passes: NewPass[] };

const toStatus = (watch_id: string, row: ScanRow | undefined): ScanStatus => ({
  watch_id,
  checked_at: row ? row.checked_at.toISOString() : null,
  newest_pass_date: row?.newest_pass_date ?? null,
  new_passes: row?.new_passes ?? [],
});

// Records the scan and one pass alert per granule. The unique (watch_id, granule_id) key makes
// a repeat scan write no duplicate alerts.
export async function recordScan(sql: Sql, t: ScanTarget, passes: NewPass[]): Promise<ScanOutcome> {
  const newest = passes.reduce<string | null>((max, p) => (!max || p.date > max ? p.date : max), t.last_pass);
  return sql.begin(async (tx) => {
    const [row] = await tx<ScanRow[]>`
      insert into watch_scans (watch_id, newest_pass_date, new_passes)
      values (${t.id}, ${newest}, ${tx.json(passes)})
      returning checked_at, to_char(newest_pass_date, 'YYYY-MM-DD') as newest_pass_date, new_passes`;
    const written = passes.length
      ? await tx`
          insert into pass_alerts ${tx(
            passes.map((p) => ({ watch_id: t.id, pass_date: p.date, granule_id: p.granule_id, track: p.track })),
            "watch_id", "pass_date", "granule_id", "track",
          )}
          on conflict (watch_id, granule_id) do nothing
          returning id`
      : [];
    return { status: toStatus(t.id, row), alerts_written: written.length };
  });
}

export async function latestScan(sql: Sql, watchId: string): Promise<ScanStatus> {
  const [row] = await sql<ScanRow[]>`
    select checked_at, to_char(newest_pass_date, 'YYYY-MM-DD') as newest_pass_date, new_passes
    from watch_scans where watch_id = ${watchId} order by checked_at desc limit 1`;
  return toStatus(watchId, row);
}
