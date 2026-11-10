"""Turn detected events into the change event records the app and database read."""

import numpy as np
from affine import Affine
from pyproj import Transformer
from rasterio.features import shapes
from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import transform, unary_union

from distill.cube import Cube
from distill.detect import Event
from distill.rasters import cover_fractions
from distill.rules import Features, Label, classify


def polygon(mask: np.ndarray, e: Event, cube: Cube, to_wgs84) -> MultiPolygon:
    window_transform = cube.grid.transform * Affine.translation(e.window[1].start, e.window[0].start)
    parts = [shape(g) for g, v in shapes(mask.astype(np.uint8), mask=mask, transform=window_transform) if v == 1]
    geom = unary_union(parts).simplify(cube.grid.res, preserve_topology=True).buffer(0)
    geom = transform(to_wgs84, geom)
    if geom.geom_type == "Polygon":
        geom = MultiPolygon([geom])
    return geom


def features(e: Event, cover: dict[str, float]) -> Features:
    return Features(
        direction=e.direction.value,
        peak_d_hh=round(float(e.d_hh[e.peak]), 2),
        peak_d_hv=round(float(e.d_hv[e.peak]), 2),
        onset=e.dates[e.onset],
        passes_active=len(e.active),
        recovered=e.recovery is not None,
        growth_passes=e.growth_passes,
        peak_area_km2=e.peak_area_km2,
        cover=cover,
    )


def build(cube: Cube, events: list[Event], landcover: np.ndarray) -> list[tuple[dict, Event, Label]]:
    to_wgs84 = Transformer.from_crs(cube.grid.epsg, 4326, always_xy=True).transform
    out = []
    counters: dict[str, int] = {}
    for e in events:
        cover = cover_fractions(landcover[e.window], e.footprint)
        label = classify(features(e, cover))
        onset = e.dates[e.onset]
        stem = f"{cube.site.id}-{onset:%m%d}"
        counters[stem] = counters.get(stem, 0) + 1
        by_pass = [
            {
                "pass_id": e.pass_ids[t],
                "date": e.dates[t].isoformat(),
                "area_km2": round(float(e.area_by_pass[t]), 2),
                "geometry": mapping(polygon(e.voxels[t], e, cube, to_wgs84)),
            }
            for t in e.active
        ]
        record = {
            "id": f"{stem}-{counters[stem]:02d}",
            "site": cube.site.id,
            "direction": e.direction.value,
            "geometry": mapping(polygon(e.voxels[e.peak], e, cube, to_wgs84)),
            "footprint_by_pass": by_pass,
            "change_type": label.type.value,
            "confidence": label.confidence,
            "reason": label.reason,
            "area_km2": round(e.peak_area_km2, 2),
            "onset": onset.isoformat(),
            "peak": e.dates[e.peak].isoformat(),
            "last_seen": e.dates[e.last_seen].isoformat(),
            "recovery": e.dates[e.recovery].isoformat() if e.recovery is not None else None,
            "status": e.status.value,
            "pass_ids": [e.pass_ids[t] for t in e.active],
            "signature": {
                "dates": [d.isoformat() for d in e.dates],
                "d_hh": [round(float(v), 2) for v in e.d_hh],
                "d_hv": [round(float(v), 2) for v in e.d_hv],
                "fraction": [round(float(v), 3) for v in e.signature[:, 2]],
            },
            "cover": cover,
            "has_deformation": False,
        }
        out.append((record, e, label))
    return out
