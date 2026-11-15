"""The "See" hook: a cloudy optical scene and the NISAR pass of the same place, on one lon/lat grid.

Run: python -m distill.see [site]
Writes web/public/see/<site>/{optical.webp, radar.webp, meta.json}.
"""

import json
import math
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import planetary_computer
import pystac_client
import rasterio
from affine import Affine
from PIL import Image
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.vrt import WarpedVRT
from rasterio.warp import reproject

from distill.cube import load_cube
from distill.sites import SITES
from distill.truth import STAC

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "see"
WIDTH_PX = 1440
S2_OFFSET, S2_SCALE = 1000, 10000  # L2A processing baseline 04.00+: reflectance = (DN - 1000) / 10000
SCL_CLOUD = (8, 9, 10)  # cloud medium probability, cloud high probability, thin cirrus
HH_DB = (-22.0, -2.0)
WHITE_REFLECTANCE = 0.8


@dataclass(frozen=True)
class Scene:
    site: str
    center: tuple[float, float]  # lon, lat
    size_km: tuple[float, float]  # width, height
    nisar_day: date
    s2_items: tuple[str, ...]  # tiles of one Sentinel-2 datatake, mosaicked first-valid
    caption: str


SCENES = {
    "assam": Scene(
        site="assam",
        center=(94.48, 26.985),
        size_km=(36.0, 24.0),
        nisar_day=date(2026, 7, 22),
        # One tile only: the neighbouring T46RFR tile got its own atmospheric correction and leaves a seam.
        s2_items=("S2A_MSIL2A_20260723T042221_R090_T46RFQ_20260723T075119",),
        caption="Five hours apart: a monsoon cloud deck hides Upper Assam from Sentinel-2, "
        "but NISAR's L-band radar sees through it to the Brahmaputra's braided channels.",
    ),
}


def lonlat_grid(scene: Scene) -> tuple[Affine, int, int, tuple[float, float, float, float]]:
    """A lon/lat grid whose pixels are square on the ground, so the image isn't squashed east-west."""
    lon, lat = scene.center
    km_per_deg_lat = 110.574
    km_per_deg_lon = 111.320 * math.cos(math.radians(lat))
    half_w = scene.size_km[0] / 2 / km_per_deg_lon
    half_h = scene.size_km[1] / 2 / km_per_deg_lat
    west, east, south, north = lon - half_w, lon + half_w, lat - half_h, lat + half_h
    width = WIDTH_PX
    height = round(WIDTH_PX * scene.size_km[1] / scene.size_km[0])
    transform = Affine((east - west) / width, 0, west, 0, -(north - south) / height, north)
    return transform, width, height, (west, south, east, north)


def warp_asset(href: str, transform: Affine, width: int, height: int, resampling: Resampling) -> np.ndarray:
    """Read one COG band onto the grid. WarpedVRT fetches only the blocks the window needs."""
    with (
        rasterio.Env(GDAL_HTTP_MULTIRANGE="YES", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"),
        rasterio.open(href) as src,
        WarpedVRT(src, crs=CRS.from_epsg(4326), transform=transform, width=width, height=height, resampling=resampling, nodata=0) as vrt,
    ):
        return vrt.read(1)


def optical(scene: Scene, transform: Affine, width: int, height: int) -> tuple[np.ndarray, float, list[dict]]:
    cat = pystac_client.Client.open(STAC, modifier=planetary_computer.sign_inplace)
    coll = cat.get_collection("sentinel-2-l2a")
    rgb = np.zeros((height, width, 3), np.float32)
    scl = np.zeros((height, width), np.uint8)
    have = np.zeros((height, width), bool)
    items = []
    for item_id in scene.s2_items:
        item = coll.get_item(item_id)
        if item is None:
            raise RuntimeError(f"{item_id} is not on Planetary Computer")
        bands = [warp_asset(item.assets[b].href, transform, width, height, Resampling.average) for b in ("B04", "B03", "B02")]
        part_scl = warp_asset(item.assets["SCL"].href, transform, width, height, Resampling.nearest)
        fill = ~have & (bands[0] > 0)
        for i, band in enumerate(bands):
            rgb[..., i][fill] = (band[fill].astype(np.float32) - S2_OFFSET) / S2_SCALE
        scl[fill] = part_scl[fill]
        have |= fill
        items.append({"id": item_id, "datetime": item.properties["datetime"], "tile_cloud_pct": round(item.properties["eo:cloud_cover"], 1)})
    valid = scl > 0
    cloud_pct = float(np.isin(scl[valid], SCL_CLOUD).mean() * 100) if valid.any() else float("nan")
    return tonemap(rgb, have), cloud_pct, items


def tonemap(rgb: np.ndarray, have: np.ndarray) -> np.ndarray:
    """Soft-knee stretch: land keeps true-color contrast while bright cloud tops keep their texture."""
    r = np.clip(rgb, 0, None)
    k = 6.0
    v = np.log1p(k * r) / np.log1p(k * WHITE_REFLECTANCE)
    out = (np.clip(v, 0, 1) * 255).astype(np.uint8)
    out[~have] = 255
    return out


def radar(scene: Scene, transform: Affine, width: int, height: int) -> tuple[np.ndarray, str]:
    cube = load_cube(SITES[scene.site])
    t = cube.dates.index(scene.nisar_day)
    g = cube.grid

    hh = np.full((height, width), np.nan, np.float32)
    reproject(
        cube.hh[t],
        hh,
        src_transform=g.transform,
        src_crs=CRS.from_epsg(g.epsg),
        dst_transform=transform,
        dst_crs=CRS.from_epsg(4326),
        src_nodata=np.nan,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )
    if np.isnan(hh).mean() > 0.01:
        raise RuntimeError(f"crop runs off the {scene.nisar_day} pass ({np.isnan(hh).mean():.1%} empty)")
    gray = np.clip((hh - HH_DB[0]) / (HH_DB[1] - HH_DB[0]), 0, 1)
    out = (np.nan_to_num(gray) * 255).astype(np.uint8)
    return np.dstack([out, out, out]), cube.pass_ids[t]


def short_day(iso: str) -> str:
    d = date.fromisoformat(iso[:10])
    return f"{d.strftime('%b')} {d.day}"


def export(site: str) -> dict:
    scene = SCENES[site]
    transform, width, height, bounds = lonlat_grid(scene)
    out_dir = OUT / site
    out_dir.mkdir(parents=True, exist_ok=True)

    rgb, cloud_pct, items = optical(scene, transform, width, height)
    Image.fromarray(rgb, "RGB").save(out_dir / "optical.webp", "WEBP", quality=82)
    gray, pass_id = radar(scene, transform, width, height)
    Image.fromarray(gray, "RGB").save(out_dir / "radar.webp", "WEBP", quality=82)

    optical_dt = items[0]["datetime"]
    s = pass_id.split("_")[11]  # acquisition start, e.g. 20260722T230528
    nisar_dt = f"{s[:4]}-{s[4:6]}-{s[6:8]}T{s[9:11]}:{s[11:13]}:{s[13:15]}Z"
    meta = {
        "site": site,
        "place": SITES[site].place,
        "bounds": [round(b, 5) for b in bounds],
        "width": width,
        "height": height,
        "meters_per_pixel": round(scene.size_km[0] * 1000 / width, 1),
        "optical": {
            "label": f"Optical, {short_day(optical_dt)} (cloud {round(cloud_pct)}%)",
            "source": "Sentinel-2 L2A, true color (B04, B03, B02)",
            "datetime": optical_dt,
            "cloud_pct": round(cloud_pct, 1),
            "scenes": items,
            "image": "optical.webp",
        },
        "radar": {
            "label": f"NISAR radar, {short_day(scene.nisar_day.isoformat())}",
            "source": "NISAR L2 GCOV, L-band HH backscatter",
            "datetime": nisar_dt,
            "pass_id": pass_id,
            "image": "radar.webp",
        },
        "caption": scene.caption,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


if __name__ == "__main__":
    for s in sys.argv[1:] or list(SCENES):
        print(json.dumps(export(s), indent=2))
