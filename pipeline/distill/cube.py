import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
from affine import Affine
from scipy.ndimage import median_filter

from distill.fetch import CACHE
from distill.sites import Site


@dataclass(frozen=True)
class Grid:
    epsg: int
    x0: float
    y0: float
    res: float
    rows: int
    cols: int

    @property
    def transform(self) -> Affine:
        return Affine(self.res, 0, self.x0, 0, -self.res, self.y0)

    @property
    def pixel_km2(self) -> float:
        return (self.res / 1000) ** 2


@dataclass
class Cube:
    site: Site
    grid: Grid
    dates: list[date]
    pass_ids: list[str]
    hh: np.ndarray  # (T, H, W) dB, speckle filtered
    hv: np.ndarray

    @property
    def baseline(self) -> np.ndarray:
        return np.array([self.site.baseline_start <= d <= self.site.baseline_end for d in self.dates])

    @property
    def monitored(self) -> np.ndarray:
        return np.array([d > self.site.baseline_end for d in self.dates])


def despeckle(db: np.ndarray) -> np.ndarray:
    filled = np.where(np.isfinite(db), db, np.nanmedian(db))
    out = median_filter(filled, size=3)
    out[~np.isfinite(db)] = np.nan
    return out


def load_cube(site: Site, cache: Path = CACHE) -> Cube:
    files = sorted(p for p in (cache / site.id).glob("*.npz") if ".tmp" not in p.name)
    if not files:
        raise FileNotFoundError(f"no cached passes for {site.id}; run python -m distill.fetch {site.id}")
    hh, hv, dates, ids = [], [], [], []
    grid = None
    for f in files:
        z = np.load(f)
        meta = json.loads(str(z["meta"]))
        g = Grid(meta["epsg"], meta["x0"], meta["y0"], meta["res"], meta["rows"], meta["cols"])
        if grid is not None and g != grid:
            raise ValueError(f"{f.name} is on a different grid")
        grid = g
        hh.append(despeckle(z["hh"].astype(np.float32)))
        hv.append(despeckle(z["hv"].astype(np.float32)))
        dates.append(date.fromisoformat(f.stem))
        ids.append(meta["files"][0])
    return Cube(site, grid, dates, ids, np.stack(hh), np.stack(hv))
