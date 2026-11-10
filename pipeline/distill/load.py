"""Load pipeline output into Postgres. Re-running replaces each site's rows in one transaction."""

import json
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT.parent / "db" / "migrations"


def migrate(conn: psycopg.Connection) -> None:
    for path in sorted(MIGRATIONS.glob("*.sql")):
        conn.execute(path.read_text())


def load_site(conn: psycopg.Connection, payload: dict) -> int:
    site = payload["site"]
    w, s, e, n = site["bbox"]
    with conn.transaction():
        conn.execute(
            """insert into sites (id, name, place, bbox, track, passes, updated_at)
               values (%s, %s, %s, ST_MakeEnvelope(%s, %s, %s, %s, 4326), %s, %s, now())
               on conflict (id) do update set name = excluded.name, place = excluded.place, bbox = excluded.bbox,
                 track = excluded.track, passes = excluded.passes, updated_at = now()""",
            (site["id"], site["name"], site["place"], w, s, e, n, site["track"], json.dumps(payload["passes"])),
        )
        conn.execute("delete from events where site = %s", (site["id"],))
        with conn.cursor() as cur:
            cur.executemany(
                """insert into events (id, site, direction, geometry, footprint_by_pass, change_type, confidence, reason,
                     title, summary, area_km2, onset, peak, last_seen, recovery, status, pass_ids, signature, cover, has_deformation)
                   values (%s, %s, %s, ST_Multi(ST_GeomFromGeoJSON(%s)), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                [
                    (
                        ev["id"], ev["site"], ev["direction"], json.dumps(ev["geometry"]), json.dumps(ev["footprint_by_pass"]),
                        ev["change_type"], ev["confidence"], ev["reason"], ev.get("title"), ev.get("summary"), ev["area_km2"],
                        ev["onset"], ev["peak"], ev["last_seen"], ev["recovery"], ev["status"], ev["pass_ids"],
                        json.dumps(ev["signature"]), json.dumps(ev["cover"]), ev["has_deformation"],
                    )
                    for ev in payload["events"]
                ],
            )
    return len(payload["events"])


if __name__ == "__main__":
    load_dotenv(ROOT.parent / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set in .env")
    with psycopg.connect(url, autocommit=True) as conn:
        migrate(conn)
        for path in sorted((ROOT / "out").glob("*.json")):
            if sys.argv[1:] and path.stem not in sys.argv[1:]:
                continue
            print(f"{path.stem}: {load_site(conn, json.loads(path.read_text()))} events")
