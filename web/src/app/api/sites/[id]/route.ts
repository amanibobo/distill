import { siteEvents } from "@/lib/events-source";

export async function GET(_req: Request, ctx: RouteContext<"/api/sites/[id]">) {
  const { id } = await ctx.params;
  return Response.json(await siteEvents(id));
}
