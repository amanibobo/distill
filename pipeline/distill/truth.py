"""Independent ground truth on each site's grid, plus scoring of rule labels against it."""

import json
import re
import warnings
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import fsspec
import numpy as np
import planetary_computer
import pystac_client
import requests
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.warp import transform_geom
from shapely.geometry import shape

from distill.cube import Cube, Grid
from distill.fetch import CACHE
from distill.rasters import grid_bounds_4326, warp

NIFC = (
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer/0/query"
)
EMS = "https://rapidmapping.emergency.copernicus.eu/backend/"
DETER = "https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/ows"
DETER_CLEARING = ("DESMATAMENTO_CR", "DESMATAMENTO_VEG")
CDL = "https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLFile"
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
S1_WATER_DB = -18.0
CORN, SOYBEANS = 1, 5


@dataclass
class Truth:
    """What the reference data says, per pixel, for one site."""

    name: str
    source: str
    mask: np.ndarray  # pixels where the reference says the change happened
    valid: np.ndarray  # pixels the reference actually covers
    when: date | None  # the pass the reference is compared against, None for season-long


def _cached(site_id: str, name: str, build) -> np.ndarray:
    path = CACHE / site_id / f"truth_{name}.npy"
    if path.exists():
        return np.load(path)
    arr = build()
    np.save(path, arr)
    return arr


def nifc_perimeter(cube: Cube, incident: str) -> Truth:
    def build() -> np.ndarray:
        r = requests.get(
            NIFC,
            params={"where": f"poly_IncidentName = '{incident}'", "outFields": "poly_IncidentName", "outSR": 4326, "f": "geojson"},
            timeout=60,
        )
        r.raise_for_status()
        geoms = [transform_geom("EPSG:4326", f"EPSG:{cube.grid.epsg}", f["geometry"]) for f in r.json()["features"]]
        if not geoms:
            raise RuntimeError(f"NIFC has no perimeter named {incident}")
        return rasterize(geoms, out_shape=(cube.grid.rows, cube.grid.cols), transform=cube.grid.transform).astype(bool)

    mask = _cached(cube.site.id, "nifc", build)
    return Truth("fire_scar", "NIFC WFIGS final perimeter", mask, np.isfinite(cube.hv).all(axis=0), None)


def _ems_layer(product: str, layer: str) -> list[dict]:
    """GeoJSON features of one layer of a Copernicus EMS rapid-mapping product, read by range requests out of the zip."""
    zipped = requests.get(f"{EMS}{product}.zip", allow_redirects=False, timeout=60).headers["location"]
    with fsspec.open(zipped, "rb", block_size=4 * 1024 * 1024) as f:
        z = zipfile.ZipFile(f)
        names = [n for n in z.namelist() if re.search(rf"_{layer}_v\d+\.json$", n)]
        return [feat for n in names for feat in json.loads(z.read(n))["features"]]


def ems_perimeter(cube: Cube, products: list[str]) -> Truth:
    """Burnt area from Copernicus EMS delineation or grading products, scored only inside each product's area of interest."""

    def burn(features: list[dict]) -> np.ndarray:
        if not features:
            return np.zeros((cube.grid.rows, cube.grid.cols), bool)
        local = [transform_geom("EPSG:4326", f"EPSG:{cube.grid.epsg}", f["geometry"]) for f in features]
        return rasterize(local, out_shape=(cube.grid.rows, cube.grid.cols), transform=cube.grid.transform).astype(bool)

    def build() -> np.ndarray:
        burnt = np.zeros((cube.grid.rows, cube.grid.cols), bool)
        aoi = np.zeros_like(burnt)
        for product in products:
            burnt |= burn([f for f in _ems_layer(product, "observedEventA") if f["properties"].get("notation") == "Burnt area"])
            aoi |= burn(_ems_layer(product, "areaOfInterestA")) & ~burn(_ems_layer(product, "notAnalysedA"))
        if not burnt.any():
            raise RuntimeError(f"EMS products {products} have no burnt area on this grid")
        return np.stack([burnt, aoi])

    burnt, aoi = _cached(cube.site.id, "ems", build)
    code = products[0].split("/")[0]
    return Truth("fire_scar", f"Copernicus EMS {code} burnt area", burnt, aoi & np.isfinite(cube.hv).all(axis=0), None)


def deter_clearing(cube: Cube) -> Truth:
    """INPE DETER clear-cut alerts seen after the baseline, from the Amazon WFS."""

    def build() -> np.ndarray:
        w, s, e, n = grid_bounds_4326(cube.grid)
        classes = ",".join(f"'{c}'" for c in DETER_CLEARING)
        r = requests.get(
            DETER,
            params={
                "service": "WFS",
                "version": "2.0.0",
                "request": "GetFeature",
                "typeName": "deter-amz:deter_amz",
                "outputFormat": "application/json",
                "CQL_FILTER": f"BBOX(geom,{w},{s},{e},{n},'EPSG:4326') AND classname IN ({classes}) "
                f"AND view_date > '{cube.site.baseline_end}' AND view_date <= '{cube.dates[-1]}'",
            },
            timeout=180,
        )
        r.raise_for_status()
        geoms = [transform_geom("EPSG:4326", f"EPSG:{cube.grid.epsg}", f["geometry"]) for f in r.json()["features"]]
        if not geoms:
            raise RuntimeError("DETER has no clearing alerts in this window")
        return rasterize(geoms, out_shape=(cube.grid.rows, cube.grid.cols), transform=cube.grid.transform).astype(bool)

    mask = _cached(cube.site.id, "deter", build)
    return Truth(
        "deforestation",
        f"INPE DETER clear-cut alerts, {cube.site.baseline_end:%-d %b} to {cube.dates[-1]:%-d %b %Y}",
        mask,
        np.isfinite(cube.hv).all(axis=0),
        None,
    )


def _s1_vv(grid: Grid, day: date) -> np.ndarray:
    cat = pystac_client.Client.open(STAC, modifier=planetary_computer.sign_inplace)
    items = list(cat.search(collections=["sentinel-1-rtc"], bbox=grid_bounds_4326(grid), datetime=day.isoformat()).items())
    if not items:
        raise RuntimeError(f"no Sentinel-1 RTC on {day}")
    out = np.full((grid.rows, grid.cols), np.nan, np.float32)
    for it in items:
        part = warp(it.assets["vv"].href, grid, Resampling.average)
        out = np.where(np.isnan(out), part, out)
    with np.errstate(divide="ignore", invalid="ignore"):
        return 10 * np.log10(out)


def s1_new_water(cube: Cube, event_day: date, before_day: date) -> Truth:
    def build() -> np.ndarray:
        during = _s1_vv(cube.grid, event_day)
        before = _s1_vv(cube.grid, before_day)
        valid = np.isfinite(during) & np.isfinite(before)
        new = (during < S1_WATER_DB) & (before >= S1_WATER_DB) & valid
        return np.stack([new, valid])

    new, valid = _cached(cube.site.id, f"s1_{event_day}_vs_{before_day}", build)
    return Truth("flood", f"Sentinel-1 RTC new open water, {event_day} vs {before_day}", new, valid, event_day)


def _cropscape(grid: Grid, year: int) -> np.ndarray:
    from pyproj import Transformer

    w, s, e, n = grid_bounds_4326(grid)
    xs, ys = Transformer.from_crs(4326, 5070, always_xy=True).transform([w, e, w, e], [s, s, n, n])
    r = requests.get(CDL, params={"year": year, "bbox": f"{min(xs)},{min(ys)},{max(xs)},{max(ys)}"}, timeout=30)
    r.raise_for_status()
    url = r.text.split("<returnURL>")[1].split("</returnURL>")[0]
    return warp(f"/vsicurl/{url}", grid, Resampling.mode, dst_dtype="uint8", fill=0)


def _planetary_cdl(grid: Grid, year: int) -> np.ndarray:
    cat = pystac_client.Client.open(STAC, modifier=planetary_computer.sign_inplace)
    items = [it for it in cat.search(collections=["usda-cdl"], bbox=grid_bounds_4326(grid)).items() if it.id.startswith(f"cropland_{year}_")]
    if not items:
        raise RuntimeError(f"no CDL {year} on Planetary Computer")
    out = np.zeros((grid.rows, grid.cols), np.uint8)
    for it in items:
        part = warp(it.assets["cropland"].href, grid, Resampling.mode, dst_dtype="uint8", fill=0)
        out = np.where(out == 0, part, out)
    return out


def cdl_corn_soy(cube: Cube) -> Truth:
    """Corn and soybean fields. Iowa fields rotate between the two, so the union is stable across years."""
    for year, fetch in ((2025, _cropscape), (2021, _planetary_cdl)):
        path = CACHE / cube.site.id / f"truth_cdl_{year}.npy"
        if not path.exists():
            try:
                np.save(path, fetch(cube.grid, year))
            except Exception as err:
                print(f"  CDL {year} unavailable: {err!r}", flush=True)
                continue
        cdl = np.load(path)
        return Truth("harvest", f"USDA Cropland Data Layer {year}, corn and soybean fields", np.isin(cdl, [CORN, SOYBEANS]), cdl > 0, None)
    raise RuntimeError("no Cropland Data Layer source reachable")


def site_truth(cube: Cube) -> list[Truth]:
    if cube.site.id == "kaiser":
        return [nifc_perimeter(cube, "Kaiser Canyon")]
    if cube.site.id == "assam":
        return [
            s1_new_water(cube, date(2026, 7, 22), date(2026, 6, 16)),
            s1_new_water(cube, date(2026, 8, 15), date(2026, 6, 16)),
        ]
    if cube.site.id == "iowa":
        return [cdl_corn_soy(cube)]
    if cube.site.id == "huelva":
        return [ems_perimeter(cube, ["EMSR913/AOI01/GRA_PRODUCT/EMSR913_AOI01_GRA_PRODUCT_v1"])]
    if cube.site.id == "viotia":
        return [ems_perimeter(cube, ["EMSR909/AOI01/GRA_PRODUCT/EMSR909_AOI01_GRA_PRODUCT_v1"])]
    if cube.site.id == "gredos":
        return [ems_perimeter(cube, ["EMSR900/AOI03/DEL_MONIT04/EMSR900_AOI03_DEL_MONIT04_v1"])]
    if cube.site.id == "xingu":
        return [deter_clearing(cube)]
    return []


def pixel_scores(pred: np.ndarray, truth: Truth) -> dict:
    p, t = pred & truth.valid, truth.mask & truth.valid
    tp = int((p & t).sum())
    fp = int((p & ~t).sum())
    fn = int((~p & t).sum())
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return {
            "precision": round(tp / (tp + fp), 3) if tp + fp else None,
            "recall": round(tp / (tp + fn), 3) if tp + fn else None,
            "iou": round(tp / (tp + fp + fn), 3) if tp + fp + fn else None,
            "predicted_km2": None,
            "truth_km2": None,
        }


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, default=str))


__all__ = ["Truth", "site_truth", "pixel_scores", "shape"]
