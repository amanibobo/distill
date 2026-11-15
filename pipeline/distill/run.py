"""Run the whole pipeline for cached sites: detect, label, score, caption, export."""

import json
import sys
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

from distill.cube import Cube, load_cube
from distill.detect import Event, detect
from distill.fetch import CACHE
from distill.overlays import write_overlays
from distill.rasters import landcover
from distill.records import build
from distill.rules import ChangeType, Label
from distill.sites import SITES
from distill.summarize import caption_events
from distill.truth import Truth, pixel_scores, site_truth

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
REPORTS = ROOT / "reports"
WEB_RADAR = ROOT.parent / "web" / "public" / "radar"
WEB_DATA = ROOT.parent / "web" / "src" / "data"
POSITIVE, NEGATIVE = 0.5, 0.1
STEADY_EXCLUDED = [0, 40, 80, 90]  # no data, cropland, water, wetland


def cached_landcover(cube: Cube) -> np.ndarray:
    path = CACHE / cube.site.id / "worldcover.npy"
    if not path.exists():
        np.save(path, landcover(cube.grid))
    return np.load(path)


def predicted_mask(cube: Cube, built: list[tuple[dict, Event, Label]], truth: Truth) -> np.ndarray:
    pred = np.zeros((cube.grid.rows, cube.grid.cols), bool)
    t = cube.dates.index(truth.when) if truth.when else None
    for _, e, label in built:
        if label.type.value != truth.name:
            continue
        pred[e.window] |= e.voxels[t] if t is not None else e.footprint
    return pred


def event_agreement(cube: Cube, built, truth: Truth) -> dict:
    """Each event gets a reference label from its overlap with the truth mask; ambiguous overlaps are skipped."""
    rows = []
    for record, e, label in built:
        fp = e.voxels[cube.dates.index(truth.when)] if truth.when else e.footprint
        fp = fp & truth.valid[e.window]
        if fp.sum() == 0:
            continue
        overlap = float((fp & truth.mask[e.window]).sum() / fp.sum())
        if NEGATIVE < overlap < POSITIVE:
            continue
        rows.append({"id": record["id"], "truth": overlap >= POSITIVE, "pred": label.type.value == truth.name, "km2": record["area_km2"]})
    tp = sum(r["truth"] and r["pred"] for r in rows)
    tn = sum(not r["truth"] and not r["pred"] for r in rows)
    fp = sum(not r["truth"] and r["pred"] for r in rows)
    fn = sum(r["truth"] and not r["pred"] for r in rows)
    n = len(rows)
    return {"events_scored": n, "tp": tp, "tn": tn, "fp": fp, "fn": fn, "accuracy": round((tp + tn) / n, 3) if n else None}


def score(cube: Cube, built, truths: list[Truth]) -> list[dict]:
    out = []
    for truth in truths:
        pred = predicted_mask(cube, built, truth)
        px = pixel_scores(pred, truth)
        px["predicted_km2"] = round(float((pred & truth.valid).sum() * cube.grid.pixel_km2), 1)
        px["truth_km2"] = round(float((truth.mask & truth.valid).sum() * cube.grid.pixel_km2), 1)
        out.append({"type": truth.name, "source": truth.source, "when": truth.when, "pixels": px, "events": event_agreement(cube, built, truth)})
    return out


def caption_payload(site, record: dict) -> dict:
    return {
        "place": site.place,
        "site": site.name,
        "change_type": record["change_type"],
        "why_this_type": record["reason"],
        "confidence": record["confidence"],
        "peak_area_km2": record["area_km2"],
        "first_seen": record["onset"],
        "peak": record["peak"],
        "last_seen": record["last_seen"],
        "back_to_normal_by": record["recovery"],
        "status_at_latest_pass": record["status"],
        "land_cover": record["cover"],
        "satellite_revisit_days": 12,
    }


def run_site(site_id: str, captions: bool) -> dict:
    site = SITES[site_id]
    cube = load_cube(site)
    cover = cached_landcover(cube)
    events = detect(cube, stable=~np.isin(cover, STEADY_EXCLUDED))
    built = build(cube, events, cover)
    print(f"{site_id}: {len(cube.dates)} passes, {len(built)} events", flush=True)
    types: dict[str, int] = {}
    for record, _, _ in built:
        types[record["change_type"]] = types.get(record["change_type"], 0) + 1
    print(f"  types {types}", flush=True)
    scores = score(cube, built, site_truth(cube))
    records = [r for r, _, _ in built]
    if captions:
        explained = [r for r in records if r["change_type"] != "other"]
        caps = caption_events([caption_payload(site, r) for r in explained], CACHE / site_id / "captions.json")
        for r, c in zip(explained, caps):
            r["title"], r["summary"] = c.title, c.summary
        for r in records:
            if r["change_type"] == "other":
                r["title"] = f"Unexplained change near {site.place.split(',')[0]}"
                r["summary"] = (
                    f"The radar saw the surface {r['direction']} here from {r['onset']}, over about {r['area_km2']:.1f} km², "
                    "but the pattern does not match a change type Distill can name with confidence."
                )
    manifest = write_overlays(cube, WEB_RADAR / site_id)
    w, s, e, n = site.bbox
    payload = {
        "site": {"id": site.id, "name": site.name, "place": site.place, "bbox": [w, s, e, n], "track": site.track},
        "passes": [{"date": f["date"], "pass_id": f["pass_id"], "baseline": not bool(m)} for f, m in zip(manifest["frames"], cube.monitored)],
        "events": records,
        "scores": scores,
    }
    OUT.mkdir(exist_ok=True)
    (OUT / f"{site_id}.json").write_text(json.dumps(payload, default=str))


def fmt(v) -> str:
    return "n/a" if v is None else f"{v:.2f}"


def write_report() -> None:
    sites = [json.loads(p.read_text()) for p in sorted(OUT.glob("*.json"))]
    lines = [
        "# Rule label accuracy",
        "",
        "Generated by `python -m distill.run` from every site in `out/`. Every number compares Distill's rule labels with an independent reference. Nothing here is tuned on the reference.",
        "",
        "Pixel scores compare the area labeled with a type against the area the reference marks. Event scores give each event a reference label from its overlap with the reference (at least 50% means the reference agrees it is that type, at most 10% means it is not; events in between are skipped) and check whether the rules agree.",
        "",
        "| Site | Type | Reference | Pixel precision | Pixel recall | IoU | Events scored | Agree | Missed | False alarm | Event accuracy |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    summary = []
    for d in sites:
        for sc in d["scores"]:
            px, ev = sc["pixels"], sc["events"]
            when = f" ({sc['when']})" if sc["when"] else ""
            lines.append(
                f"| {d['site']['name']} | {sc['type']} | {sc['source']}{when} | {fmt(px['precision'])} | {fmt(px['recall'])} | {fmt(px['iou'])} | {ev['events_scored']} | {ev['tp'] + ev['tn']} | {ev['fn']} | {ev['fp']} | {fmt(ev['accuracy'])} |"
            )
        types: dict[str, int] = {}
        for e in d["events"]:
            types[e["change_type"]] = types.get(e["change_type"], 0) + 1
        summary.append({"site": d["site"], "passes": len(d["passes"]), "events": len(d["events"]), "types": types, "scores": d["scores"]})
    lines += ["", "## Events by type", ""]
    for x in summary:
        lines.append(f"- {x['site']['name']}: {x['events']} events over {x['passes']} passes, " + ", ".join(f"{k} {v}" for k, v in sorted(x["types"].items())))
    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "accuracy.md").write_text("\n".join(lines) + "\n")
    blob = json.dumps(summary, indent=2, default=str)
    (REPORTS / "accuracy.json").write_text(blob)
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "accuracy.json").write_text(blob)


if __name__ == "__main__":
    load_dotenv(ROOT.parent / ".env")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for s in args or list(SITES):
        run_site(s, captions="--no-captions" not in sys.argv)
    write_report()
    print((REPORTS / "accuracy.md").read_text())
