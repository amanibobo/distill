import { sql } from "@/lib/db";
import { findNewPasses, latestScan, recordScan, scanTargets } from "@/app/api/watch/scan/scan";

const COOLDOWN_MS = 60_000;

const noDatabase = () => Response.json({ error: "Watch needs DATABASE_URL, which is not set." }, { status: 503 });

export async function GET(_req: Request, ctx: RouteContext<"/api/watch/[id]/scan">) {
  if (!sql) return noDatabase();
  const { id } = await ctx.params;
  return Response.json(await latestScan(sql, id));
}

// "Check for new passes" on one watch, at most once a minute per watch.
export async function POST(_req: Request, ctx: RouteContext<"/api/watch/[id]/scan">) {
  if (!sql) return noDatabase();
  const { id } = await ctx.params;
  const [target] = await scanTargets(sql, id);
  if (!target) return Response.json({ error: "No watch with that id." }, { status: 404 });

  const last = await latestScan(sql, id);
  const wait = last.checked_at ? Date.parse(last.checked_at) + COOLDOWN_MS - Date.now() : 0;
  if (wait > 0) {
    const seconds = Math.ceil(wait / 1000);
    return Response.json(
      { ...last, error: `Checked moments ago. Try again in ${seconds} s.` },
      { status: 429, headers: { "Retry-After": String(seconds) } },
    );
  }

  try {
    const { status, alerts_written } = await recordScan(sql, target, await findNewPasses(target));
    return Response.json({ ...status, alerts_written });
  } catch (err) {
    return Response.json({ ...last, error: `Could not reach ASF. ${(err as Error).message}` }, { status: 502 });
  }
}
