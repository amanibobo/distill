"""Segment change in the (time, y, x) cube into space-time events."""

import warnings
from dataclasses import dataclass, field
from datetime import date
from enum import Enum

import numpy as np
from scipy import ndimage
from scipy.ndimage import uniform_filter
from skimage.measure import label

from distill.cube import Cube

NOISE_K = 3.0
MIN_THRESHOLD_DB = 1.0
SMOOTH_PX = 5
MIN_PEAK_KM2 = 0.5
MIN_SINGLE_PASS_KM2 = 2.0
GROWTH = 0.1


class Direction(str, Enum):
    darker = "darker"
    brighter = "brighter"


class Status(str, Enum):
    growing = "growing"
    stable = "stable"
    receding = "receding"
    recovered = "recovered"


@dataclass
class Event:
    site: str
    direction: Direction
    voxels: np.ndarray  # (T, H, W) bool, False outside monitored passes
    dates: list[date]
    pass_ids: list[str]
    pixel_km2: float
    d_hh: np.ndarray = field(repr=False)  # (T,) mean dB change vs baseline over the event's union footprint
    d_hv: np.ndarray = field(repr=False)

    @property
    def area_by_pass(self) -> np.ndarray:
        return self.voxels.sum(axis=(1, 2)) * self.pixel_km2

    @property
    def active(self) -> np.ndarray:
        return np.flatnonzero(self.area_by_pass > 0)

    @property
    def onset(self) -> int:
        return int(self.active[0])

    @property
    def last_seen(self) -> int:
        return int(self.active[-1])

    @property
    def peak(self) -> int:
        return int(np.argmax(self.area_by_pass))

    @property
    def recovery(self) -> int | None:
        nxt = self.last_seen + 1
        return nxt if nxt < len(self.dates) else None

    @property
    def peak_area_km2(self) -> float:
        return float(self.area_by_pass[self.peak])

    @property
    def footprint(self) -> np.ndarray:
        return self.voxels.any(axis=0)

    @property
    def growth_passes(self) -> int:
        a = self.area_by_pass[self.onset : self.peak + 1]
        return int(np.sum(np.diff(a) > GROWTH * a[:-1])) if len(a) > 1 else 0

    @property
    def status(self) -> Status:
        if self.recovery is not None:
            return Status.recovered
        a = self.area_by_pass
        if self.last_seen == 0 or a[self.last_seen - 1] == 0:
            return Status.growing
        ratio = a[self.last_seen] / a[self.last_seen - 1]
        if ratio > 1 + GROWTH:
            return Status.growing
        if ratio < 1 - GROWTH:
            return Status.receding
        return Status.stable

    @property
    def signature(self) -> np.ndarray:
        """Per-pass (d_hh, d_hv, fraction of footprint changed); the input to find-more-like-this."""
        frac = self.voxels.sum(axis=(1, 2)) / max(self.footprint.sum(), 1)
        return np.stack([self.d_hh, self.d_hv, frac], axis=1)


def smooth(a: np.ndarray) -> np.ndarray:
    ok = np.isfinite(a)
    num = uniform_filter(np.where(ok, a, 0), SMOOTH_PX)
    den = uniform_filter(ok.astype(np.float32), SMOOTH_PX)
    out = num / np.maximum(den, 1e-6)
    out[den < 0.5] = np.nan
    return out


def change(cube: Cube, stable: np.ndarray) -> tuple[tuple[np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray]]:
    """dB change vs the baseline median, minus each pass's scene-wide shift on land that should not change.

    Returns (raw, smoothed) for HH and HV; smoothed decides where change is, raw trims the blur at its edges."""
    raws, smooths = [], []
    for db in (cube.hh, cube.hv):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            base = np.nanmedian(db[cube.baseline], axis=0)
            raw = db - base
            sm = np.stack([smooth(x) for x in raw])
            shift = np.nan_to_num(np.array([np.nanmedian(x[stable]) for x in sm]))[:, None, None]
        raws.append(raw - shift)
        smooths.append(sm - shift)
    return (raws[0], raws[1]), (smooths[0], smooths[1])


def noise_threshold(d: np.ndarray, baseline: np.ndarray) -> float:
    """Three robust standard deviations of pass-to-pass change among the baseline passes."""
    idx = np.flatnonzero(baseline)
    sigmas = []
    for a, b in zip(idx[:-1], idx[1:]):
        diff = d[b] - d[a]
        sigmas.append(1.4826 * np.nanmedian(np.abs(diff - np.nanmedian(diff))) / np.sqrt(2))
    return max(NOISE_K * float(np.mean(sigmas)), MIN_THRESHOLD_DB)


def change_masks(raw: tuple[np.ndarray, np.ndarray], sm: tuple[np.ndarray, np.ndarray], cube: Cube) -> dict[Direction, np.ndarray]:
    (raw_hh, raw_hv), (d_hh, d_hv) = raw, sm
    thr_hh = noise_threshold(d_hh, cube.baseline)
    thr_hv = noise_threshold(d_hv, cube.baseline)
    darker = ((d_hh <= -thr_hh) & (raw_hh <= -thr_hh)) | ((d_hv <= -thr_hv) & (raw_hv <= -thr_hv))
    brighter = (d_hh >= thr_hh) & (raw_hh >= thr_hh) & ~darker
    tidy = np.ones((1, 3, 3), bool)
    return {
        direction: ndimage.binary_opening(ndimage.binary_closing(m & cube.monitored[:, None, None], structure=tidy), structure=tidy)
        for direction, m in ((Direction.darker, darker), (Direction.brighter, brighter))
    }


def keep(areas: np.ndarray) -> bool:
    peak = areas.max()
    passes = int((areas > 0).sum())
    return peak >= MIN_PEAK_KM2 and (passes >= 2 or peak >= MIN_SINGLE_PASS_KM2)


def detect(cube: Cube, stable: np.ndarray | None = None) -> list[Event]:
    """`stable` marks land whose radar return should not change seasonally; it anchors the wet/dry correction."""
    if stable is None:
        stable = np.ones((cube.grid.rows, cube.grid.cols), bool)
    raw, sm = change(cube, stable)
    masks = change_masks(raw, sm, cube)
    d_hh, d_hv = sm
    events: list[Event] = []
    for direction, mask in masks.items():
        labels = label(mask, connectivity=1)
        objects = ndimage.find_objects(labels)
        for i, sl in enumerate(objects, start=1):
            if sl is None:
                continue
            local = labels[sl] == i
            areas = local.sum(axis=(1, 2)) * cube.grid.pixel_km2
            if not keep(areas):
                continue
            voxels = np.zeros(mask.shape, bool)
            voxels[sl] = local
            fp = voxels.any(axis=0)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)
                hh_series = np.nanmean(d_hh[:, fp], axis=1)
                hv_series = np.nanmean(d_hv[:, fp], axis=1)
            events.append(
                Event(
                    site=cube.site.id,
                    direction=direction,
                    voxels=voxels,
                    dates=cube.dates,
                    pass_ids=cube.pass_ids,
                    pixel_km2=cube.grid.pixel_km2,
                    d_hh=np.nan_to_num(hh_series),
                    d_hv=np.nan_to_num(hv_series),
                )
            )
    events.sort(key=lambda e: -e.peak_area_km2)
    return events
