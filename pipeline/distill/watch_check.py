"""Dry run of the scheduled watch job: list NISAR passes newer than each site's last processed one.

Prints what would be fetched and detected. It downloads nothing and writes nothing.
"""

import os
import sys
from dataclasses import replace
from datetime import date, timedelta
from pathlib import Path

import psycopg
from dotenv import load_dotenv

from distill.fetch import find_passes
from distill.sites import SITES

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    load_dotenv(ROOT.parent / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set in .env")
    with psycopg.connect(url) as conn:
        rows = conn.execute(
            """select w.name, w.site, ST_XMin(w.area), ST_YMin(w.area), ST_XMax(w.area), ST_YMax(w.area),
                 (select max((p->>'date')::date) from sites s, jsonb_array_elements(s.passes) p where s.id = w.site)
               from watches w order by w.site, w.created_at"""
        ).fetchall()
    if not rows:
        print("No watches yet. Create one on /watch.")
        return
    today = date.today()
    for name, site_id, w, s, e, n, last in rows:
        site = SITES.get(site_id)
        if not site:
            print(f"{name}: site {site_id} has no track settings in sites.py, skipped")
            continue
        start = (last or site.start) + timedelta(days=1)
        window = replace(site, bbox=(w, s, e, n), start=start, end=today)
        passes = find_passes(window)
        track = f"track {site.track:03d} {'ascending' if site.direction == 'A' else 'descending'}"
        if not passes:
            print(f"{name} ({site_id}, {track}): no passes after {last}")
            continue
        print(f"{name} ({site_id}, {track}): {len(passes)} new since {last}, would fetch and detect:")
        for p in passes:
            print(f"  {p['date']}  {len(p['files'])} frame(s)  {p['files'][0]['file_id']}")


if __name__ == "__main__":
    main()
