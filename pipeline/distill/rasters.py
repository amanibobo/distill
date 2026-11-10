"""Warp outside rasters (land cover, ground truth) onto a site's 40 m grid."""

import math

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds

from distill.cube import Grid

WORLDCOVER = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
COVER_CLASSES = {
    10: "tree",
    20: "shrub",
    30: "grass",
    40: "crop",
    50: "built",
    60: "bare",
    70: "snow",
    80: "water",
    90: "wetland",
    95: "mangrove",
    100: "moss",
}


def warp(src_path: str, grid: Grid, resampling: Resampling, band: int = 1, dst_dtype="float32", fill=np.nan) -> np.ndarray:
    dst = np.full((grid.rows, grid.cols), fill, dtype=dst_dtype)
    with rasterio.Env(GDAL_HTTP_MULTIRANGE="YES", GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open(src_path) as src:
        reproject(
            source=rasterio.band(src, band),
            destination=dst,
            dst_transform=grid.transform,
            dst_crs=CRS.from_epsg(grid.epsg),
            dst_nodata=fill,
            resampling=resampling,
        )
    return dst


def grid_bounds_4326(grid: Grid) -> tuple[float, float, float, float]:
    return transform_bounds(
        CRS.from_epsg(grid.epsg), CRS.from_epsg(4326), grid.x0, grid.y0 - grid.rows * grid.res, grid.x0 + grid.cols * grid.res, grid.y0
    )


def worldcover_tiles(bounds: tuple[float, float, float, float]) -> list[str]:
    w, s, e, n = bounds
    tiles = []
    for lat in range(math.floor(s / 3) * 3, math.floor(n / 3) * 3 + 1, 3):
        for lon in range(math.floor(w / 3) * 3, math.floor(e / 3) * 3 + 1, 3):
            ns = f"N{lat:02d}" if lat >= 0 else f"S{-lat:02d}"
            ew = f"E{lon:03d}" if lon >= 0 else f"W{-lon:03d}"
            tiles.append(ns + ew)
    return tiles


def landcover(grid: Grid) -> np.ndarray:
    out = np.zeros((grid.rows, grid.cols), np.uint8)
    for tile in worldcover_tiles(grid_bounds_4326(grid)):
        part = warp(f"/vsicurl/{WORLDCOVER.format(tile=tile)}", grid, Resampling.mode, dst_dtype="uint8", fill=0)
        out = np.where(out == 0, part, out)
    return out


def cover_fractions(cover: np.ndarray, footprint: np.ndarray) -> dict[str, float]:
    values = cover[footprint]
    values = values[values > 0]
    if values.size == 0:
        return {}
    codes, counts = np.unique(values, return_counts=True)
    return {COVER_CLASSES.get(int(c), "other"): round(float(n) / values.size, 3) for c, n in zip(codes, counts)}
