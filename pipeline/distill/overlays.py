"""Per-pass grayscale radar images for the map, reprojected to lon/lat."""

import json
from pathlib import Path

import numpy as np
from PIL import Image
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.warp import calculate_default_transform, reproject

from distill.cube import Cube

LOW_DB, HIGH_DB = -24.0, -4.0


def write_overlays(cube: Cube, out_dir: Path) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    src_crs, dst_crs = CRS.from_epsg(cube.grid.epsg), CRS.from_epsg(4326)
    g = cube.grid
    left, top = g.x0, g.y0
    right, bottom = g.x0 + g.cols * g.res, g.y0 - g.rows * g.res
    dst_transform, w, h = calculate_default_transform(src_crs, dst_crs, g.cols, g.rows, left, bottom, right, top)
    frames = []
    for t, day in enumerate(cube.dates):
        dst = np.full((h, w), np.nan, np.float32)
        reproject(
            cube.hv[t],
            dst,
            src_transform=g.transform,
            src_crs=src_crs,
            dst_transform=dst_transform,
            dst_crs=dst_crs,
            src_nodata=np.nan,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
        v = np.clip((dst - LOW_DB) / (HIGH_DB - LOW_DB), 0, 1)
        gray = (np.nan_to_num(v) * 255).astype(np.uint8)
        alpha = np.where(np.isfinite(dst), 255, 0).astype(np.uint8)
        name = f"{day.isoformat()}.webp"
        Image.fromarray(np.dstack([gray, gray, gray, alpha]), "RGBA").save(out_dir / name, "WEBP", quality=80)
        frames.append({"date": day.isoformat(), "pass_id": cube.pass_ids[t], "image": name})
    west, north = dst_transform * (0, 0)
    east, south = dst_transform * (w, h)
    manifest = {
        "site": cube.site.id,
        "coordinates": [[west, north], [east, north], [east, south], [west, south]],
        "frames": frames,
    }
    (out_dir / "index.json").write_text(json.dumps(manifest, indent=2))
    return manifest
