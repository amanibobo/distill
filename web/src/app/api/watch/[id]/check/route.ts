import { z } from "zod";
import { sql } from "@/lib/db";
import type { ChangeType } from "@/lib/change-types";
import type { Pass } from "@/lib/types";
import { classify, isNews, MIN_KM2, type Alert, type CheckResult, type Hit, type WatchShape } from "@/app/watch/model";

const CheckBody = z.object({ pass_date: z.iso.date() });

type HitRow = Hit & { inside: WatchShape["inside"] | null; full: WatchShape["full"] | null };

// Checks one pass against a watch: measures each event's footprint inside the area, then
// converges the alerts table to exactly the news for that pass, so replaying is safe to repeat.
export async function POST(req: Request, ctx: RouteContext<"/api/watch/[id]/check">) {
  if (!sql) return Response.json({ error: "Watch needs DATABASE_URL, which is not set." }, { status: 503 });
  const { id } = await ctx.params;
  const parsed = CheckBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send pass_date as YYYY-MM-DD." }, { status: 400 });
  const pass = parsed.data.pass_date;

  const [watch] = await sql<{ id: string; passes: Pass[] }[]>`
    select w.id, s.passes from watches w join sites s on s.id = w.site where w.id = ${id}`;
  if (!watch) return Response.json({ error: "No watch with that id." }, { status: 404 });
  const index = watch.passes.findIndex((p) => p.date === pass);
  if (index < 0) return Response.json({ error: `${pass} is not a pass for this site.` }, { status: 400 });

  const rows = await sql<HitRow[]>`
    with w as (select site, area from watches where id = ${id}),
    f as (
      select e.id as event_id, e.change_type, x->>'date' as date, x->'geometry' as footprint,
        ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON((x->'geometry')::text), 4326)) as g
      from w join events e on e.site = w.site
      cross join lateral jsonb_array_elements(e.footprint_by_pass) x
      where e.change_type <> 'other' and x->>'date' <= ${pass}
    ),
    i as (
      select f.event_id, f.change_type, f.date, f.footprint, ST_Multi(ST_CollectionExtract(ST_Intersection(f.g, w.area), 3)) as ig
      from f, w where ST_Intersects(f.g, w.area)
    )
    select event_id, change_type, date, ST_Area(ig::geography) / 1e6 as km2,
      case when date = ${pass} then ST_AsGeoJSON(ig, 6)::jsonb end as inside,
      case when date = ${pass} then footprint end as "full"
    from i
    where not ST_IsEmpty(ig)`;

  const hits = rows.filter((r) => r.km2 >= MIN_KM2);
  const changes = classify(hits, pass);
  const newsTypes = new Set<ChangeType>(changes.filter(isNews).map((c) => c.change_type));
  const fresh = hits.filter((h) => h.date === pass && newsTypes.has(h.change_type));

  const alerts = await sql.begin(async (tx) => {
    await tx`
      delete from alerts where watch_id = ${id} and pass_date = ${pass}
        and not (event_id = any(${fresh.map((h) => h.event_id)}::text[]))`;
    if (!fresh.length) return [];
    const values = fresh.map((h) => ({ watch_id: id, pass_date: pass, event_id: h.event_id, change_type: h.change_type, area_km2: h.km2 }));
    return tx<Alert[]>`
      insert into alerts ${tx(values, "watch_id", "pass_date", "event_id", "change_type", "area_km2")}
      on conflict (watch_id, pass_date, event_id)
        do update set change_type = excluded.change_type, area_km2 = excluded.area_km2
      returning id::int, event_id, change_type, to_char(pass_date, 'YYYY-MM-DD') as pass_date, area_km2`;
  });

  const shapes: WatchShape[] = hits.flatMap((h) =>
    h.date === pass && h.inside && h.full ? [{ event_id: h.event_id, change_type: h.change_type, inside: h.inside, full: h.full }] : [],
  );

  return Response.json({
    watch_id: id,
    pass_date: pass,
    baseline: watch.passes[index].baseline,
    changes,
    alerts,
    shapes,
  } satisfies CheckResult);
}
