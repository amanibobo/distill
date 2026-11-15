import { z } from "zod";
import { sql } from "@/lib/db";
import type { Watch } from "@/app/watch/model";

const Lng = z.number().min(-180).max(180);
const Lat = z.number().min(-90).max(90);

const CreateWatch = z.object({
  name: z.string().trim().min(1).max(80),
  site: z.string().min(1),
  area: z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([Lng, Lat])).min(4)).length(1),
  }),
});

const noDatabase = () => Response.json({ error: "Watch needs DATABASE_URL, which is not set." }, { status: 503 });

export async function GET(req: Request) {
  if (!sql) return noDatabase();
  const site = new URL(req.url).searchParams.get("site");
  const rows = await sql<Watch[]>`
    select w.id, w.name, w.site, ST_AsGeoJSON(w.area, 6)::jsonb as area,
      ST_Area(w.area::geography) / 1e6 as area_km2, w.created_at,
      (select count(*) from alerts a where a.watch_id = w.id)::int as alerts
    from watches w
    ${site ? sql`where w.site = ${site}` : sql``}
    order by w.created_at desc`;
  return Response.json(rows);
}

export async function POST(req: Request) {
  if (!sql) return noDatabase();
  const parsed = CreateWatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send a name, a site, and a polygon area." }, { status: 400 });
  const { name, site, area } = parsed.data;

  const [siteRow] = await sql<{ name: string; inside: boolean; valid: boolean }[]>`
    select s.name, ST_Intersects(g, s.bbox) as inside, ST_IsValid(g) and ST_Area(g) > 0 as valid
    from sites s, lateral (select ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(area)}), 4326) as g) x
    where s.id = ${site}`;
  if (!siteRow) return Response.json({ error: `No site called ${site}.` }, { status: 404 });
  if (!siteRow.valid) return Response.json({ error: "That area has no size. Drag a box on the map." }, { status: 400 });
  if (!siteRow.inside) return Response.json({ error: `Draw the area over ${siteRow.name}, where the radar has passes.` }, { status: 400 });

  const [watch] = await sql<Watch[]>`
    insert into watches (name, site, area)
    values (${name}, ${site}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(area)}), 4326))
    returning id, name, site, ST_AsGeoJSON(area, 6)::jsonb as area, ST_Area(area::geography) / 1e6 as area_km2, created_at, 0 as alerts`;
  return Response.json(watch, { status: 201 });
}
