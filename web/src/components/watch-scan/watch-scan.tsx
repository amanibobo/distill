"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { NewPass, ScanStatus } from "@/app/watch/model";
import { shortDate } from "@/lib/format";
import type { SiteSummary } from "@/lib/types";
import styles from "./watch-scan.module.css";

type Scan = ScanStatus & { error?: string };

function ago(iso: string, now: number) {
  const min = Math.floor((now - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return `on ${shortDate(iso.slice(0, 10))}`;
}

function passSummary(passes: NewPass[], lastKnown: string | undefined) {
  if (!passes.length) return lastKnown ? `no new passes since ${shortDate(lastKnown)}` : "no new passes";
  const newest = passes[passes.length - 1];
  const days = new Set(passes.map((p) => p.date)).size;
  const track = `track ${String(newest.track).padStart(3, "0")}`;
  return days === 1
    ? `1 new pass on ${shortDate(newest.date)} (${track})`
    : `${days} new passes, latest ${shortDate(newest.date)} (${track})`;
}

async function readScan(res: Response): Promise<Scan> {
  const body = (await res.json()) as Scan;
  if (!res.ok && !body.watch_id) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body;
}

export function EmailNote() {
  return <p className={styles.note}>Email alerts are next.</p>;
}

export function WatchScan({ watchId, site }: { watchId: string; site: Pick<SiteSummary, "passes"> }) {
  const [scan, setScan] = useState<Scan | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/watch/${watchId}/scan`, { signal: ctrl.signal })
      .then(readScan)
      .then((s) => {
        setScan(s);
        setNow(Date.now());
      })
      .catch((err: Error) => err.name !== "AbortError" && setError(err.message));
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      ctrl.abort();
      clearInterval(tick);
    };
  }, [watchId]);

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const s = await readScan(await fetch(`/api/watch/${watchId}/scan`, { method: "POST" }));
      setScan(s);
      if (s.error) setError(s.error);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setNow(Date.now());
      setChecking(false);
    }
  }

  const lastKnown = site.passes.at(-1)?.date;
  const status = !scan
    ? error
      ? "Scan history is unavailable"
      : "Loading scan history"
    : scan.checked_at
      ? `Last checked ${ago(scan.checked_at, now)} · ${passSummary(scan.new_passes, lastKnown)}`
      : "Not checked for new passes yet";

  return (
    <div className={styles.scan}>
      <p className={styles.status} aria-live="polite">
        {status}
      </p>
      {!!scan?.new_passes.length && <p className={styles.note}>New passes are waiting for processing. Alerts appear once Distill reads them.</p>}
      <EmailNote />
      <div className={styles.row}>
        <button className={styles.ghost} onClick={check} disabled={checking}>
          <RefreshCw className={styles.icon} data-spin={checking || undefined} aria-hidden />
          {checking ? "Checking ASF" : "Check for new passes"}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
