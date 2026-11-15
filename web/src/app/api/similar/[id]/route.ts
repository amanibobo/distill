import type { ChangeType } from "@/lib/change-types";
import { sql } from "@/lib/db";

export type SimilarEvent = {
  id: string;
  site: string;
  site_name: string;
  title: string | null;
  change_type: ChangeType;
  area_km2: number;
  onset: string;
  similarity: number;
};

const NEIGHBORS = 8;
const PER_SITE = 4;
const CANDIDATES = 64;

export async function GET(_req: Request, ctx: RouteContext<"/api/similar/[id]">) {
  if (!sql) {
    return Response.json({ error: "Find similar needs the events database. Set DATABASE_URL and run the pipeline's load and embed steps." }, { status: 503 });
  }
  const { id } = await ctx.params;
  const [source] = await sql<{ embedding: string | null; change_type: ChangeType }[]>`
    select embedding::text as embedding, change_type from events where id = ${id}`;
  if (!source) return Response.json({ error: `No event with id ${id}.` }, { status: 404 });
  if (!source.embedding) {
    return Response.json({ error: "This event has no embedding yet. Run `uv run python -m distill.embed` in pipeline/." }, { status: 409 });
  }

  // Strict iterative scan keeps the HNSW index exact under the type filter, so it never comes back short.
  // Sibling fragments of one event crowd the top of the list, so each site gets at most PER_SITE rows
  // while other sites have close matches; the rest of the slots fall back to plain nearest order.
  const rows = await sql.begin(async (tx) => {
    await tx`set local hnsw.iterative_scan = strict_order`;
    return tx<SimilarEvent[]>`
      select id, site, site_name, title, change_type, area_km2, onset,
        round(greatest(0, 1 - distance)::numeric, 3)::float8 as similarity
      from (
        select * from (
          select *, row_number() over (partition by site order by distance) as site_rank from (
            select e.id, e.site, s.name as site_name, e.title, e.change_type, e.area_km2,
              to_char(e.onset, 'YYYY-MM-DD') as onset, e.embedding <=> ${source.embedding}::vector as distance
            from events e join sites s on s.id = e.site
            where e.id <> ${id} and e.embedding is not null
              and (${source.change_type} = 'other' or e.change_type <> 'other')
            order by e.embedding <=> ${source.embedding}::vector
            limit ${CANDIDATES}
          ) near
        ) ranked
        order by site_rank > ${PER_SITE}, distance
        limit ${NEIGHBORS}
      ) picked
      order by distance`;
  });
  return Response.json(rows);
}
