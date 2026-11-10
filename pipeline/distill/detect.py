"""Segment change in the (time, y, x) cube into space-time events."""

import warnings
from dataclasses import dataclass, field
from datetime import date
from enum import Enum

import numpy as np
from scipy import ndimage
from skimage.measure import label

from distill.cube import Cube

DROP_DB = 3.0
RISE_DB = 3.0
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


def baseline_change(cube: Cube) -> tuple[np.ndarray, np.ndarray]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        base_hh = np.nanmedian(cube.hh[cube.baseline], axis=0)
        base_hv = np.nanmedian(cube.hv[cube.baseline], axis=0)
    return cube.hh - base_hh, cube.hv - base_hv


def change_masks(d_hh: np.ndarray, d_hv: np.ndarray, monitored: np.ndarray) -> dict[Direction, np.ndarray]:
    darker = (d_hh <= -DROP_DB) | (d_hv <= -DROP_DB)
    brighter = (d_hh >= RISE_DB) & ~darker
    open_ = np.ones((1, 3, 3), bool)
    masks = {}
    for direction, m in ((Direction.darker, darker), (Direction.brighter, brighter)):
        m = m & monitored[:, None, None]
        m = ndimage.binary_opening(m, structure=open_)
        masks[direction] = m
    return masks


def keep(areas: np.ndarray) -> bool:
    peak = areas.max()
    passes = int((areas > 0).sum())
    return peak >= MIN_PEAK_KM2 and (passes >= 2 or peak >= MIN_SINGLE_PASS_KM2)


def detect(cube: Cube) -> list[Event]:
    d_hh, d_hv = baseline_change(cube)
    masks = change_masks(d_hh, d_hv, cube.monitored)
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
