"""Stream one NISAR GUNW pair and a GLO-30 DEM around an earthquake and export the Explore layer.

Run: uv run python -m distill.deformation [site ...]
Each stage caches under pipeline/cache/deformation/<site>/ and is skipped when its file exists.
"""

import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asf_search as asf
import earthaccess
import h5py
import numpy as np
import rasterio
from PIL import Image
from pyproj import Geod, Transformer
from rasterio.crs import CRS
from rasterio.errors import RasterioIOError
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject
from shapely.geometry import Point, shape

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache" / "deformation"
PUBLIC = ROOT.parent / "web" / "public" / "explore"
GRID = "science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram"
LAYERS = ("unwrappedPhase", "coherenceMagnitude", "connectedComponents", "ionospherePhaseScreen")
DEM_URL = "https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
C = 299_792_458.0
SIZE = 512
COHERENCE_MIN = 0.3


@dataclass(frozen=True)
class Quake:
    id: str
    magnitude: float
    lon: float
    lat: float
    time: datetime
    place: str


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    place: str
    quake: Quake
    others: tuple[Quake, ...]
    center: tuple[float, float]
    size_km: float


def _utc(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


SAN_FELIPE = Quake("us6000t7zc", 7.2, -68.5564, 10.3713, _utc("2026-06-24T22:04:31"), "20 km E of San Felipe, Venezuela")
CATIA = Quake("us6000t7zp", 7.5, -67.2205, 10.5955, _utc("2026-06-24T22:05:04"), "20 km W of Catia La Mar, Venezuela")

SITES: dict[str, Site] = {
    "venezuela": Site(
        id="venezuela",
        name="Venezuela earthquakes",
        place="Yaracuy and Carabobo, Venezuela",
        quake=SAN_FELIPE,
        others=(CATIA,),
        center=(-68.30, 10.33),
        size_km=64.0,
    ),
}


def find_pair(site: Site) -> dict:
    """The shortest provisional GUNW pair over the epicenter that brackets the quake, preferring the earliest post-quake pass."""
    q = site.quake
    results = asf.search(
        dataset="NISAR",
        processingLevel="GUNW",
        intersectsWith=Point(q.lon, q.lat).wkt,
        start=(q.time - timedelta(days=40)).isoformat(),
        end=(q.time + timedelta(days=40)).isoformat(),
    )
    best: dict | None = None
    best_rank: tuple = ()
    for r in results:
        file_id = r.properties["fileID"]
        parts = file_id.split("_")
        if parts[2] != "PR" or not shape(r.geometry).contains(Point(q.lon, q.lat)):
            continue
        ref, sec = (datetime.strptime(p, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc) for p in (parts[11], parts[13]))
        if not ref < q.time < sec:
            continue
        cand = {
            "file_id": file_id,
            "url": r.properties["url"],
            "track": int(parts[5]),
            "direction": "ascending" if parts[6] == "A" else "descending",
            "frame": int(parts[7]),
            "reference": ref.isoformat(),
            "secondary": sec.isoformat(),
            "days": round((sec - ref).total_seconds() / 86400),
        }
        rank = (cand["days"], cand["secondary"], parts[-1])
        if best is None or rank < best_rank:
            best, best_rank = cand, rank
    if best is None:
        raise LookupError(f"no provisional GUNW pair over {site.id} brackets {q.time}")
    return best


def window(site: Site, epsg: int, res: float) -> dict:
    """A square grid of SIZE pixels centred on the site, in the product's UTM zone."""
    x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(*site.center)
    half = site.size_km * 500
    step = site.size_km * 1000 / SIZE
    x0 = math.floor((x - half) / res) * res
    y0 = math.ceil((y + half) / res) * res
    return {"epsg": epsg, "x0": x0, "y0": y0, "res": step, "size": SIZE}


def stream_gunw(site: Site, pair: dict, path: Path) -> None:
    """Read only the window's chunks of each layer over HTTPS. The 2 GB file is never downloaded."""
    earthaccess.login(strategy="netrc")
    fs = earthaccess.get_fsspec_https_session()
    with fs.open(pair["url"], block_size=4 * 1024 * 1024, cache_type="blockcache") as f, h5py.File(f, "r") as h:
        g = h[GRID]
        epsg = int(g["projection"][()])
        x = g["xCoordinates"][:]
        y = g["yCoordinates"][:]
        dx = float(x[1] - x[0])
        grid = window(site, epsg, dx)
        span = grid["res"] * grid["size"]
        c0 = int(round((grid["x0"] - x[0]) / dx))
        r0 = int(round((y[0] - grid["y0"]) / dx))
        n = int(round(span / dx))
        if c0 < 0 or r0 < 0 or c0 + n > len(x) or r0 + n > len(y):
            raise ValueError(f"{site.id} window runs off the frame")
        layers = {k: g[f"HH/{k}"][r0 : r0 + n, c0 : c0 + n] for k in LAYERS}
        layers["mask"] = g["mask"][r0 : r0 + n, c0 : c0 + n]
        wavelength = C / float(h["science/LSAR/GUNW/grids/frequencyA/centerFrequency"][()])
    native = {"epsg": epsg, "x0": float(x[c0]) - dx / 2, "y0": float(y[r0]) + dx / 2, "res": dx, "size": n}
    tmp = path.with_suffix(".tmp.npz")
    np.savez_compressed(tmp, **layers, native=json.dumps(native), grid=json.dumps(grid), wavelength=wavelength)
    tmp.rename(path)


def dem_tiles(bounds: tuple[float, float, float, float]) -> list[str]:
    w, s, e, n = bounds
    names = []
    for lat in range(math.floor(s), math.floor(n) + 1):
        for lon in range(math.floor(w), math.floor(e) + 1):
            ns = f"N{lat:02d}" if lat >= 0 else f"S{-lat:02d}"
            ew = f"E{lon:03d}" if lon >= 0 else f"W{-lon:03d}"
            names.append(f"Copernicus_DSM_COG_10_{ns}_00_{ew}_00_DEM")
    return names


def fetch_dem(grid: dict, path: Path) -> None:
    """Read the window out of the public GLO-30 COGs and average it onto the export grid. Missing tiles are open sea."""
    out = np.full((grid["size"], grid["size"]), np.nan, np.float32)
    dst_crs = CRS.from_epsg(grid["epsg"])
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", AWS_NO_SIGN_REQUEST="YES"):
        for name in dem_tiles(lonlat_bounds(grid)):
            try:
                src = rasterio.open(DEM_URL.format(name=name))
            except RasterioIOError:
                continue
            with src:
                part = np.full_like(out, np.nan)
                reproject(
                    rasterio.band(src, 1),
                    part,
                    dst_transform=affine(grid),
                    dst_crs=dst_crs,
                    dst_nodata=np.nan,
                    resampling=Resampling.average,
                )
            out = np.where(np.isnan(out), part, out)
    np.save(path, np.nan_to_num(out, nan=0.0))


def affine(grid: dict):
    return from_origin(grid["x0"], grid["y0"], grid["res"], grid["res"])


def lonlat_bounds(grid: dict) -> tuple[float, float, float, float]:
    span = grid["res"] * grid["size"]
    xs = [grid["x0"], grid["x0"] + span]
    ys = [grid["y0"] - span, grid["y0"]]
    lon, lat = Transformer.from_crs(grid["epsg"], 4326, always_xy=True).transform(
        [xs[0], xs[1], xs[0], xs[1]], [ys[0], ys[0], ys[1], ys[1]]
    )
    return min(lon), min(lat), max(lon), max(lat)


def resample(a: np.ndarray, native: dict, grid: dict, how: Resampling) -> np.ndarray:
    out = np.full((grid["size"], grid["size"]), np.nan, np.float32)
    crs = CRS.from_epsg(grid["epsg"])
    reproject(
        a.astype(np.float32),
        out,
        src_transform=affine(native),
        src_crs=crs,
        src_nodata=np.nan,
        dst_transform=affine(grid),
        dst_crs=crs,
        dst_nodata=np.nan,
        resampling=how,
    )
    return out


def line_of_sight(raw: dict) -> tuple[np.ndarray, np.ndarray, dict]:
    """Native-resolution LOS displacement in cm, positive toward the satellite, plus a 0..1 trust layer.

    NISAR phase follows the ISCE convention, where positive phase is range increase (motion away),
    so toward-the-satellite displacement is -phase * wavelength / (4 pi).
    """
    phase = raw["unwrappedPhase"].astype(np.float64) - raw["ionospherePhaseScreen"]
    cc = raw["connectedComponents"]
    water = (raw["mask"] // 100) % 10 == 1
    valid = np.isfinite(phase) & (cc != 0) & (cc != 65535) & ~water
    labels, counts = np.unique(cc[valid], return_counts=True)
    main = labels[np.argmax(counts)]
    in_main = valid & (cc == main)
    los = -phase * float(raw["wavelength"]) / (4 * np.pi) * 100
    coh = np.where(valid, raw["coherenceMagnitude"], 0.0)
    trusted = in_main & (coh >= COHERENCE_MIN)
    los -= np.median(los[trusted])
    los[~valid] = np.nan
    trust = np.where(in_main, coh, 0.0)
    stats = {
        "main_component": int(main),
        "main_component_frac": float(in_main.mean()),
        "trusted_frac": float(trusted.mean()),
        "water_frac": float(water.mean()),
    }
    return los, trust, stats


RDBU = [  # ColorBrewer RdBu, red end is away, blue end is toward
    (0.0, (178, 24, 43)),
    (0.17, (214, 96, 77)),
    (0.33, (244, 165, 130)),
    (0.5, (242, 240, 236)),
    (0.67, (146, 197, 222)),
    (0.83, (67, 147, 195)),
    (1.0, (33, 102, 172)),
]


def colorize(los: np.ndarray, limit: float) -> np.ndarray:
    t = np.clip((np.nan_to_num(los) / limit + 1) / 2, 0, 1)
    stops = np.array([s for s, _ in RDBU])
    rgb = np.stack([np.interp(t, stops, [c[i] for _, c in RDBU]) for i in range(3)], axis=-1)
    return rgb.astype(np.uint8)


def nice_limit(x: float) -> float:
    for step in (1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100):
        if x <= step:
            return float(step)
    return float(math.ceil(x / 50) * 50)


def export(site: Site, pair: dict, raw: dict, dem: np.ndarray) -> dict:
    native = json.loads(str(raw["native"]))
    grid = json.loads(str(raw["grid"]))
    los_n, trust_n, stats = line_of_sight(raw)
    los = resample(los_n, native, grid, Resampling.average)
    trust = np.nan_to_num(resample(trust_n, native, grid, Resampling.average))
    shown = np.isfinite(los) & (trust >= COHERENCE_MIN)
    p99 = float(np.percentile(np.abs(los[shown]), 99))
    limit = nice_limit(p99)

    out = PUBLIC / site.id
    out.mkdir(parents=True, exist_ok=True)
    lo, hi = float(dem.min()), float(dem.max())
    height = np.round((dem - lo) / max(hi - lo, 1e-6) * 65535).astype("<u2")
    (out / "height.bin").write_bytes(height.tobytes())
    mm = np.clip(np.nan_to_num(los) * 10, -32767, 32767).round().astype("<i2")
    (out / "displacement.bin").write_bytes(mm.tobytes())
    Image.fromarray(colorize(np.where(shown, los, 0), limit)).save(out / "displacement.png", optimize=True)
    Image.fromarray((np.clip(trust, 0, 1) * 255).astype(np.uint8)).save(out / "coherence.png", optimize=True)

    to_grid = Transformer.from_crs(4326, grid["epsg"], always_xy=True)

    def pixel(q: Quake) -> dict:
        x, y = to_grid.transform(q.lon, q.lat)
        return {
            "id": q.id,
            "magnitude": q.magnitude,
            "lon": q.lon,
            "lat": q.lat,
            "time": q.time.isoformat(),
            "place": q.place,
            "col": (x - grid["x0"]) / grid["res"],
            "row": (grid["y0"] - y) / grid["res"],
        }

    located = [pixel(q) for q in (site.quake, *site.others)]
    in_window = [p for p in located if 0 <= p["col"] < SIZE and 0 <= p["row"] < SIZE]
    geod = Geod(ellps="WGS84")
    nearby = [
        {**p, "km_from_main": geod.inv(site.quake.lon, site.quake.lat, p["lon"], p["lat"])[2] / 1000}
        for p in located
        if p not in in_window
    ]
    meta = {
        "site": site.id,
        "name": site.name,
        "place": site.place,
        "size": SIZE,
        "pixel_m": grid["res"],
        "extent_km": site.size_km,
        "epsg": grid["epsg"],
        "bounds": dict(zip(("west", "south", "east", "north"), lonlat_bounds(grid))),
        "pair": {k: pair[k] for k in ("reference", "secondary", "days", "track", "direction", "frame")},
        "source": {"gunw": pair["file_id"], "dem": dem_tiles(lonlat_bounds(grid)), "dem_product": "Copernicus GLO-30"},
        "displacement": {
            "units": "cm",
            "sign": "positive is toward the satellite (line of sight)",
            "reference": "median of the trusted pixels in the window",
            "wavelength_m": float(raw["wavelength"]),
            "ionosphere": "product ionosphere phase screen subtracted",
            "min": float(np.nanmin(los[shown])),
            "max": float(np.nanmax(los[shown])),
            "p99_abs": p99,
            "p1": float(np.percentile(los[shown], 1)),
            "p99": float(np.percentile(los[shown], 99)),
            "limit": limit,
            "encoding": "displacement.bin is little-endian int16 millimetres, row-major from the north-west corner",
        },
        "coherence": {"threshold": COHERENCE_MIN, "encoding": "coherence.png is coherence x 255, zero off the main unwrapping component or on water"},
        "height": {"min_m": lo, "max_m": hi, "encoding": "height.bin is little-endian uint16, min_m + v / 65535 * (max_m - min_m)"},
        "quality": {**stats, "shown_frac": float(shown.mean())},
        "quakes": in_window,
        "nearby_quakes": nearby,
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def run(site: Site) -> dict:
    cache = CACHE / site.id
    cache.mkdir(parents=True, exist_ok=True)
    pair_path = cache / "pair.json"
    if not pair_path.exists():
        pair_path.write_text(json.dumps(find_pair(site), indent=2))
    pair = json.loads(pair_path.read_text())
    raw_path = cache / "gunw.npz"
    if not raw_path.exists():
        stream_gunw(site, pair, raw_path)
    raw = dict(np.load(raw_path))
    dem_path = cache / "dem.npy"
    if not dem_path.exists():
        fetch_dem(json.loads(str(raw["grid"])), dem_path)
    meta = export(site, pair, raw, np.load(dem_path))
    d = meta["displacement"]
    print(f"{site.id}: {pair['file_id']}")
    print(f"  {d['min']:.1f} to {d['max']:.1f} cm, shown {meta['quality']['shown_frac']:.2f}")
    return meta


if __name__ == "__main__":
    for sid in sys.argv[1:] or list(SITES):
        run(SITES[sid])
