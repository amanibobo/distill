"""Embed each change event's radar signature so "find more like this" is a nearest-neighbor search.

Every dimension is a named, readable quantity. The time series are sampled on a clock that starts at the
event's own onset, so events at sites with different pass dates line up by lifecycle, not by calendar.
"""

import json
import os
import sys
from datetime import date
from pathlib import Path

import numpy as np
import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
INDEX_MIGRATION = ROOT.parent / "db" / "migrations" / "0004_embedding_index.sql"

REVISIT_DAYS = 12
OFFSETS = np.arange(-2, 6) * REVISIT_DAYS  # two passes of lead-in, onset, then five passes after it
SERIES = ("d_hh", "d_hv", "fraction")
SCALARS = (
    "log_area",
    "passes_active",
    "recovered",
    "growth_passes",
    "peak_hh_minus_hv",
    "passes_to_peak",
    "end_over_peak",
    "growing",
)
NAMES = tuple(f"{s}@{int(o):+d}d" for s in SERIES for o in OFFSETS) + SCALARS
DIM = len(NAMES)
Z_CLIP = 3.0


def days(iso: str) -> int:
    return date.fromisoformat(iso).toordinal()


def on_event_clock(t: np.ndarray, values: np.ndarray) -> np.ndarray:
    """The value of the latest pass at or before each offset. Before the series starts, change is 0 (baseline)."""
    i = np.searchsorted(t, OFFSETS, side="right") - 1
    return np.where(i >= 0, values[np.clip(i, 0, None)], 0.0)


def features(ev: dict) -> np.ndarray:
    sig = ev["signature"]
    t = np.array([days(d) for d in sig["dates"]]) - days(ev["onset"])
    series = {k: np.asarray(sig[k], float) for k in SERIES}
    area_by_date = {f["date"]: f["area_km2"] for f in ev["footprint_by_pass"]}
    area = np.array([area_by_date.get(d, 0.0) for d in sig["dates"]])
    onset, peak = sig["dates"].index(ev["onset"]), sig["dates"].index(ev["peak"])
    growth = area[onset : peak + 1]
    frac = series["fraction"]
    scalars = [
        np.log1p(ev["area_km2"]),
        len(ev["pass_ids"]),
        float(ev["recovery"] is not None),
        float(np.sum(np.diff(growth) > 0.1 * growth[:-1])),
        series["d_hh"][peak] - series["d_hv"][peak],
        (days(ev["peak"]) - days(ev["onset"])) / REVISIT_DAYS,
        frac[-1] / frac.max() if frac.max() > 0 else 0.0,
        float(ev["status"] == "growing"),
    ]
    return np.concatenate([on_event_clock(t, series[k]) for k in SERIES] + [np.array(scalars)])


def embed(events: list[dict]) -> np.ndarray:
    """(N, 32) unit vectors: each dimension standardized across all events and clipped, then L2-normalized."""
    x = np.stack([features(e) for e in events])
    std = x.std(axis=0)
    z = np.clip((x - x.mean(axis=0)) / np.where(std > 1e-9, std, 1.0), -Z_CLIP, Z_CLIP)
    norm = np.linalg.norm(z, axis=1, keepdims=True)
    return z / np.where(norm > 0, norm, 1.0)


def literal(v: np.ndarray) -> str:
    return "[" + ",".join(f"{x:.5f}" for x in v) + "]"


if __name__ == "__main__":
    load_dotenv(ROOT.parent / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set in .env")
    events = [e for p in sorted((ROOT / "out").glob("*.json")) for e in json.loads(p.read_text())["events"]]
    vectors = embed(events)
    with psycopg.connect(url, autocommit=True) as conn:
        with conn.transaction(), conn.cursor() as cur:
            cur.executemany(
                "update events set embedding = %s::vector where id = %s",
                [(literal(v), e["id"]) for e, v in zip(events, vectors)],
            )
            updated = cur.rowcount
        conn.execute(INDEX_MIGRATION.read_text())
        rows = conn.execute("select site, count(*), count(embedding) from events group by site order by site").fetchall()
    print(f"embedded {len(events)} events from out/, updated {updated} rows")
    for site, n, done in rows:
        print(f"  {site}: {done}/{n} rows have an embedding")
