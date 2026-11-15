import { FilterSchema } from "@/lib/search";
import { search } from "@/lib/search-server";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim().slice(0, 300);
  const rawFilter = params.get("filter");
  if (rawFilter) {
    let json: unknown;
    try {
      json = JSON.parse(rawFilter);
    } catch {
      return Response.json({ error: "filter is not JSON" }, { status: 400 });
    }
    const filter = FilterSchema.safeParse(json);
    if (!filter.success) return Response.json({ error: "filter is not valid" }, { status: 400 });
    return Response.json(await search({ filter: filter.data }));
  }
  if (!q) return Response.json({ error: "add ?q= with a question" }, { status: 400 });
  try {
    return Response.json(await search({ q }));
  } catch (e) {
    console.error("search failed", e instanceof Error ? e.message : e);
    return Response.json({ error: "Search could not read that question." }, { status: 502 });
  }
}
