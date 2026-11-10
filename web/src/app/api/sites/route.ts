import { requireDb } from "@/lib/db";
import type { SiteSummary } from "@/lib/types";

export async function GET() {
  const sql = requireDb();
  const rows = await sql<SiteSummary[]>`
    select s.id, s.name, s.place,
      array[ST_XMin(s.bbox), ST_YMin(s.bbox), ST_XMax(s.bbox), ST_YMax(s.bbox)]::float8[] as bbox,
      s.passes,
      coalesce((select jsonb_object_agg(change_type, n) from (
        select change_type, count(*)::int as n from events e where e.site = s.id group by change_type
      ) c), '{}'::jsonb) as counts
    from sites s
    order by s.name`;
  return Response.json(rows);
}
