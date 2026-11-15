import { z } from "zod";
import { CHANGE_TYPES, type ChangeType } from "./change-types";
import { shortDate } from "./format";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const STATUSES = {
  growing: "Still growing",
  ongoing: "Ongoing",
  recovered: "Recovered",
} as const;

export type SearchStatus = keyof typeof STATUSES;

export const FilterSchema = z.object({
  types: z.array(z.enum(Object.keys(CHANGE_TYPES) as [ChangeType, ...ChangeType[]])).describe("Change types asked for. Empty means any type."),
  sites: z.array(z.string()).describe("Site ids the question points to. Empty means every site."),
  unknown_place: z.string().nullable().describe("A place the question names that no site covers, in the user's words. Null otherwise."),
  after: z.string().nullable().describe("Onset on or after this date, YYYY-MM-DD. Null for no lower bound."),
  before: z.string().nullable().describe("Onset before this date, YYYY-MM-DD. Null for no upper bound."),
  min_area_km2: z.number().nullable().describe("Smallest area in km². Null for any size."),
  status: z
    .enum(Object.keys(STATUSES) as [SearchStatus, ...SearchStatus[]])
    .nullable()
    .describe("growing: still spreading. ongoing: not over yet. recovered: over. Null for any."),
});

export type SearchFilter = z.infer<typeof FilterSchema>;

export function cleanFilter(f: SearchFilter, siteIds: string[]): SearchFilter {
  return {
    ...f,
    types: [...new Set(f.types)],
    sites: [...new Set(f.sites)].filter((s) => siteIds.includes(s)),
    unknown_place: f.unknown_place?.trim() || null,
    after: f.after && ISO_DATE.test(f.after) ? f.after : null,
    before: f.before && ISO_DATE.test(f.before) ? f.before : null,
    min_area_km2: f.min_area_km2 && f.min_area_km2 > 0 ? f.min_area_km2 : null,
  };
}

export type SearchHit = {
  id: string;
  site: string;
  siteName: string;
  title: string;
  change_type: ChangeType;
  area_km2: number;
  onset: string;
  recovery: string | null;
};

export type SearchResponse = { filter: SearchFilter; results: SearchHit[]; suggestion: string | null };

export type Chip = { key: string; label: string; type?: ChangeType; without: SearchFilter };

export function chips(f: SearchFilter, siteName: (id: string) => string): Chip[] {
  const out: Chip[] = [];
  for (const t of f.types) out.push({ key: `type:${t}`, label: CHANGE_TYPES[t].label, type: t, without: { ...f, types: f.types.filter((x) => x !== t) } });
  for (const s of f.sites) out.push({ key: `site:${s}`, label: siteName(s), without: { ...f, sites: f.sites.filter((x) => x !== s) } });
  if (f.unknown_place) out.push({ key: "place", label: f.unknown_place, without: { ...f, unknown_place: null } });
  if (f.status) out.push({ key: "status", label: STATUSES[f.status], without: { ...f, status: null } });
  if (f.after) out.push({ key: "after", label: `Since ${shortDate(f.after)}`, without: { ...f, after: null } });
  if (f.before) out.push({ key: "before", label: `Before ${shortDate(f.before)}`, without: { ...f, before: null } });
  if (f.min_area_km2) out.push({ key: "area", label: `Over ${f.min_area_km2} km²`, without: { ...f, min_area_km2: null } });
  return out;
}
