"""Export Distill's labeled change events as an open dataset and publish it to Hugging Face.

uv run python -m distill.dataset            # build into dataset/
uv run python -m distill.dataset --push     # build and upload (needs HF_TOKEN)
"""

import json
import os
import sys
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd
from dotenv import load_dotenv
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
DEST = ROOT / "dataset"
REPO = "amanibobo/nisar-surface-change-2026"
CAPTION_MODEL = "claude-opus-5-5"


def load_sites() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(OUT.glob("*.json"))]


def build() -> dict:
    sites = load_sites()
    events, footprints, site_rows, scores = [], [], [], []
    for d in sites:
        s = d["site"]
        site_rows.append(
            {
                "site": s["id"],
                "name": s["name"],
                "place": s["place"],
                "track": s["track"],
                "bbox_west": s["bbox"][0],
                "bbox_south": s["bbox"][1],
                "bbox_east": s["bbox"][2],
                "bbox_north": s["bbox"][3],
                "passes": json.dumps(d["passes"]),
                "n_events": len(d["events"]),
            }
        )
        for sc in d["scores"]:
            scores.append({"site": s["id"], **{k: v for k, v in sc.items() if k not in ("pixels", "events")}, **{f"pixel_{k}": v for k, v in sc["pixels"].items()}, **{f"event_{k}": v for k, v in sc["events"].items()}})
        for e in d["events"]:
            events.append(
                {
                    "id": e["id"],
                    "site": e["site"],
                    "change_type": e["change_type"],
                    "direction": e["direction"],
                    "confidence": e["confidence"],
                    "label_reason": e["reason"],
                    "label_source": "distill rules v1 (see decisions.md)",
                    "title": e.get("title"),
                    "summary": e.get("summary"),
                    "summary_source": CAPTION_MODEL if e["change_type"] != "other" else "template",
                    "area_km2_peak": e["area_km2"],
                    "onset": e["onset"],
                    "peak": e["peak"],
                    "last_seen": e["last_seen"],
                    "recovery": e["recovery"],
                    "status": e["status"],
                    "n_passes_active": len(e["pass_ids"]),
                    "source_granules": e["pass_ids"],
                    "signature_dates": e["signature"]["dates"],
                    "signature_d_hh_db": e["signature"]["d_hh"],
                    "signature_d_hv_db": e["signature"]["d_hv"],
                    "signature_fraction": e["signature"]["fraction"],
                    "land_cover": json.dumps(e["cover"]),
                    "geometry": shape(e["geometry"]),
                }
            )
            for f in e["footprint_by_pass"]:
                footprints.append(
                    {"event_id": e["id"], "site": e["site"], "date": f["date"], "pass_id": f["pass_id"], "area_km2": f["area_km2"], "geometry": shape(f["geometry"])}
                )
    DEST.mkdir(exist_ok=True)
    gpd.GeoDataFrame(events, geometry="geometry", crs="EPSG:4326").to_parquet(DEST / "events.parquet")
    gpd.GeoDataFrame(footprints, geometry="geometry", crs="EPSG:4326").to_parquet(DEST / "footprints.parquet")
    pd.DataFrame(site_rows).to_parquet(DEST / "sites.parquet")
    pd.DataFrame(scores).to_parquet(DEST / "scores.parquet")
    stats = {
        "sites": len(site_rows),
        "events": len(events),
        "footprints": len(footprints),
        "types": pd.Series([e["change_type"] for e in events]).value_counts().to_dict(),
        "scores": scores,
        "site_rows": site_rows,
    }
    (DEST / "README.md").write_text(card(stats))
    return stats


def fmt(v) -> str:
    return "n/a" if v is None or (isinstance(v, float) and pd.isna(v)) else f"{v:.2f}"


def card(st: dict) -> str:
    type_lines = "\n".join(f"| {t} | {n} |" for t, n in sorted(st["types"].items(), key=lambda x: -x[1]))
    site_lines = "\n".join(f"| {s['site']} | {s['name']} | {s['place']} | {s['track']} | {len(json.loads(s['passes']))} | {s['n_events']} |" for s in st["site_rows"])
    score_lines = "\n".join(
        f"| {s['site']} | {s['type']} | {s['source']}{' (' + str(s['when']) + ')' if s.get('when') else ''} | {fmt(s['pixel_precision'])} | {fmt(s['pixel_recall'])} | {s['event_tp'] + s['event_tn']} of {s['event_events_scored']} |"
        for s in st["scores"]
    )
    return f"""---
license: cc-by-4.0
pretty_name: NISAR surface change events 2026 (Distill)
tags:
- earth-observation
- sar
- nisar
- change-detection
- remote-sensing
- geospatial
size_categories:
- 1K<n<10K
configs:
- config_name: events
  data_files: events.parquet
  default: true
- config_name: footprints
  data_files: footprints.parquet
- config_name: sites
  data_files: sites.parquet
- config_name: scores
  data_files: scores.parquet
---

# NISAR surface change events, 2026

An open, labeled dataset of surface change events detected in NISAR L-band radar from its first months of public data (June to November 2026). Made by [Distill](https://distill-khaki.vercel.app) for NASA Space Apps 2026. Code: [github.com/amanibobo/distill](https://github.com/amanibobo/distill).

As far as we know this is the first open labeled dataset of change events built on NISAR data.

**{st['events']:,} events, {st['footprints']:,} per-pass footprints, {st['sites']} sites.** Built {date.today().isoformat()}.

## What an event is

Distill stacks every NISAR GCOV pass over a site into a cube of place and time and segments change as 3D connected components. So each event has an onset, a peak, a footprint for every pass and, if it ends, a recovery date. Each event is labeled by explainable rules (not a trained model) using how HH and HV backscatter moved, the land cover underneath (ESA WorldCover) and the timing. Every label carries its reason.

## Files

| File | Rows | What |
| --- | --- | --- |
| `events.parquet` | one per event | GeoParquet. Peak footprint geometry, type, confidence, rule reason, lifecycle dates, status, source NISAR granule ids, per-pass radar signature (HH and HV dB change vs the pre-event baseline, and fraction of the footprint changed), land cover fractions, plain-English title and summary |
| `footprints.parquet` | one per event per pass | GeoParquet. The event's footprint at each pass, with its area |
| `sites.parquet` | one per site | Site name, place, NISAR track, bounding box, pass dates |
| `scores.parquet` | one per site and reference | How well the rule labels match an independent reference map |

## Sites

| Site | Name | Place | Track | Passes | Events |
| --- | --- | --- | --- | --- | --- |
{site_lines}

## Types

| Type | Events |
| --- | --- |
{type_lines}

`other` means the radar saw a change the rules could not name with confidence. It is kept on purpose.

## How good are the labels

Scored against references Distill never used to set a threshold (except where noted in `decisions.md`).

| Site | Type | Reference | Pixel precision | Pixel recall | Events right |
| --- | --- | --- | --- | --- | --- |
{score_lines}

Known limits: L-band backscatter barely changes over burned grass, so fire recall is low; harvest recall is inflated because radar also sees crops drying; in rice country a 12-day revisit cannot separate monsoon flood water from planting water, so those events are low-confidence floods whose reason says so. Every limit and every rule change is logged in [decisions.md](https://github.com/amanibobo/distill/blob/main/docs/decisions.md).

## Provenance

- Radar: NISAR L2 GCOV provisional products from the NASA ASF DAAC (NASA and ISRO), streamed per site window and multilooked to 40 m. Granule ids are in `source_granules`.
- Land cover: ESA WorldCover 2021.
- References: NIFC WFIGS fire perimeters, USDA Cropland Data Layer, Copernicus Sentinel-1 RTC via Microsoft Planetary Computer, Copernicus EMS where listed.
- AI: `summary` and `title` were written by Anthropic's {CAPTION_MODEL} from the computed numbers (`summary_source` says which). Labels (`change_type`, `label_reason`, `confidence`) come from Distill's rules, not from AI.

## License

CC BY 4.0. Please cite NISAR (NASA/ISRO, ASF DAAC) and this dataset.
"""


def push() -> None:
    from huggingface_hub import HfApi

    load_dotenv(ROOT.parent / ".env")
    api = HfApi(token=os.environ["HF_TOKEN"])
    api.create_repo(REPO, repo_type="dataset", exist_ok=True)
    api.upload_folder(folder_path=str(DEST), repo_id=REPO, repo_type="dataset", commit_message="update events")
    print(f"https://huggingface.co/datasets/{REPO}")


if __name__ == "__main__":
    st = build()
    print(f"{st['sites']} sites, {st['events']} events, {st['footprints']} footprints, types {st['types']}")
    if "--push" in sys.argv:
        push()
