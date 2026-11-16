import { sql } from "@/lib/db";
import type { NewPass } from "@/app/watch/model";
import { findNewPasses, recordScan, scanTargets } from "./scan";

type WatchSummary = { watch_id: string; site: string; since: string | null } & (
  | { new_passes: NewPass[]; alerts_written: number }
  | { error: string }
);

export const maxDuration = 60;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that variable is set. Without it
// the route stays closed in production and open only to local development.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Daily job: asks ASF for NISAR passes newer than each watched site's last processed pass and
// records them. It does not download or run detection; that still happens in the pipeline.
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!sql) return Response.json({ error: "Watch needs DATABASE_URL, which is not set." }, { status: 503 });

  const targets = await scanTargets(sql);
  const watches: WatchSummary[] = [];
  for (const t of targets) {
    try {
      const { status, alerts_written } = await recordScan(sql, t, await findNewPasses(t));
      watches.push({ watch_id: t.id, site: t.site, since: t.last_pass, new_passes: status.new_passes, alerts_written });
    } catch (err) {
      watches.push({ watch_id: t.id, site: t.site, since: t.last_pass, error: (err as Error).message });
    }
  }
  return Response.json({
    checked_at: new Date().toISOString(),
    watches_checked: watches.filter((w) => !("error" in w)).length,
    watches_failed: watches.filter((w) => "error" in w).length,
    alerts_written: watches.reduce((n, w) => n + ("alerts_written" in w ? w.alerts_written : 0), 0),
    watches,
  });
}
