import { requireDb } from "@/lib/db";
import type { ChangeEvent } from "@/lib/types";

export async function GET(_req: Request, ctx: RouteContext<"/api/sites/[id]">) {
  const { id } = await ctx.params;
  const sql = requireDb();
  const events = await sql<ChangeEvent[]>`
    select id, site, change_type, confidence, reason, title, summary, area_km2,
      to_char(onset, 'YYYY-MM-DD') as onset, to_char(peak, 'YYYY-MM-DD') as peak,
      to_char(last_seen, 'YYYY-MM-DD') as last_seen, to_char(recovery, 'YYYY-MM-DD') as recovery,
      status, footprint_by_pass
    from events where site = ${id}
    order by area_km2 desc`;
  return Response.json(events);
}
