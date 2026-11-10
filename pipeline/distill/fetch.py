"""Stream each site's window out of NISAR GCOV files and cache it at 40 m."""

import json
import sys
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import asf_search as asf
import earthaccess
import h5py
import numpy as np
from pyproj import Transformer

from distill.sites import SITES, Site

CACHE = Path(__file__).resolve().parent.parent / "cache"
GRID = "science/LSAR/GCOV/grids/frequencyA"
LOOKS = 4


def find_passes(site: Site) -> list[dict]:
    w, s, e, n = site.bbox
    results = asf.search(
        dataset="NISAR",
        processingLevel="GCOV",
        intersectsWith=f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))",
        start=site.start.isoformat(),
        end=site.end.isoformat(),
    )
    latest: dict[tuple[str, str], dict] = {}
    for r in results:
        file_id = r.properties["fileID"]
        parts = file_id.split("_")
        if parts[2] != "PR" or int(parts[5]) != site.track or parts[6] != site.direction:
            continue
        key = (r.properties["startTime"][:10], parts[7])
        if key not in latest or file_id > latest[key]["file_id"]:
            latest[key] = {"file_id": file_id, "url": r.properties["url"]}
    by_date: dict[str, list[dict]] = {}
    for (day, _frame), f in sorted(latest.items()):
        by_date.setdefault(day, []).append(f)
    return [{"date": d, "files": fs} for d, fs in sorted(by_date.items())]


def multilook(a: np.ndarray, k: int) -> np.ndarray:
    h, w = (a.shape[0] // k) * k, (a.shape[1] // k) * k
    blocks = a[:h, :w].reshape(h // k, k, w // k, k)
    with np.errstate(invalid="ignore"), warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        return np.nanmean(blocks, axis=(1, 3))


def site_grid(site: Site, epsg: int, step: float) -> dict:
    to_utm = Transformer.from_crs(4326, epsg, always_xy=True)
    w, s, e, n = site.bbox
    xs, ys = to_utm.transform([w, e, w, e], [s, s, n, n])
    x0 = np.floor(min(xs) / step) * step
    y0 = np.ceil(max(ys) / step) * step
    cols = int((max(xs) - x0) // step)
    rows = int((y0 - min(ys)) // step)
    return {"epsg": epsg, "x0": float(x0), "y0": float(y0), "res": step, "rows": rows, "cols": cols}


def read_into(fs, url: str, grid: dict | None, site: Site) -> tuple[dict, dict[str, np.ndarray]]:
    with fs.open(url, block_size=4 * 1024 * 1024, cache_type="blockcache") as f, h5py.File(f, "r") as h:
        g = h[GRID]
        epsg = int(g["projection"][()])
        x = g["xCoordinates"][:]
        y = g["yCoordinates"][:]
        dx = float(x[1] - x[0])
        if grid is None:
            grid = site_grid(site, epsg, dx * LOOKS)
        if grid["epsg"] != epsg:
            raise ValueError(f"frame is in EPSG {epsg}, site grid is {grid['epsg']}")
        fine_rows, fine_cols = grid["rows"] * LOOKS, grid["cols"] * LOOKS
        c_off = int(round((grid["x0"] - x[0]) / dx))
        r_off = int(round((y[0] - grid["y0"]) / dx))
        c0, c1 = max(c_off, 0), min(c_off + fine_cols, len(x))
        r0, r1 = max(r_off, 0), min(r_off + fine_rows, len(y))
        out = {}
        for pol in ("HHHH", "HVHV"):
            full = np.full((fine_rows, fine_cols), np.nan, np.float32)
            if c1 > c0 and r1 > r0:
                a = g[pol][r0:r1, c0:c1].astype(np.float32)
                a[a <= 0] = np.nan
                full[r0 - r_off : r1 - r_off, c0 - c_off : c1 - c_off] = a
            out[pol] = multilook(full, LOOKS)
    return grid, out


def fetch_site(site: Site, workers: int = 3) -> None:
    out = CACHE / site.id
    out.mkdir(parents=True, exist_ok=True)
    passes = find_passes(site)
    (out / "passes.json").write_text(json.dumps(passes, indent=2))
    todo = [p for p in passes if not (out / f"{p['date']}.npz").exists()]
    print(f"{site.id}: {len(passes)} passes, {len(todo)} to fetch", flush=True)
    earthaccess.login(strategy="netrc")

    def one(p: dict) -> None:
        fs = earthaccess.get_fsspec_https_session()
        grid = None
        hh = hv = None
        try:
            for f in p["files"]:
                grid, layers = read_into(fs, f["url"], grid, site)
                hh = layers["HHHH"] if hh is None else np.where(np.isnan(hh), layers["HHHH"], hh)
                hv = layers["HVHV"] if hv is None else np.where(np.isnan(hv), layers["HVHV"], hv)
        except Exception as err:
            print(f"  {site.id} {p['date']} failed: {err!r}", flush=True)
            return
        with np.errstate(divide="ignore", invalid="ignore"):
            hh_db = (10 * np.log10(hh)).astype(np.float16)
            hv_db = (10 * np.log10(hv)).astype(np.float16)
        meta = {**grid, "files": [f["file_id"] for f in p["files"]], "valid_frac": float(np.isfinite(hh).mean())}
        tmp = out / f"{p['date']}.tmp.npz"
        np.savez_compressed(tmp, hh=hh_db, hv=hv_db, meta=json.dumps(meta))
        tmp.rename(out / f"{p['date']}.npz")
        print(f"  {site.id} {p['date']} ok {hh_db.shape} valid {meta['valid_frac']:.2f}", flush=True)

    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(one, todo))


if __name__ == "__main__":
    for sid in sys.argv[1:] or list(SITES):
        fetch_site(SITES[sid])
