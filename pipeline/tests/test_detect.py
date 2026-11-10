from datetime import date, timedelta

import numpy as np

from distill.cube import Cube, Grid
from distill.detect import Direction, Status, detect
from distill.sites import Site

T, H, W = 8, 60, 60
DATES = [date(2026, 6, 1) + timedelta(days=12 * i) for i in range(T)]
SITE = Site("test", "Test", "Nowhere", (0, 0, 1, 1), 1, "A", DATES[0], DATES[-1], DATES[0], DATES[2])
GRID = Grid(32610, 0.0, 0.0, 40.0, H, W)


def make_cube(seed: int = 0) -> tuple[Cube, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    hh = -8 + rng.normal(0, 0.4, (T, H, W)).astype(np.float32)
    hv = -14 + rng.normal(0, 0.4, (T, H, W)).astype(np.float32)
    return Cube(SITE, GRID, DATES, [f"p{i}" for i in range(T)], hh, hv), hh, hv


def test_flood_that_grows_then_recedes_is_one_event_with_lifecycle():
    cube, hh, hv = make_cube()
    for t, size in ((3, 10), (4, 20)):
        hh[t, 10 : 10 + size, 10 : 10 + size] -= 10
        hv[t, 10 : 10 + size, 10 : 10 + size] -= 10
    events = detect(cube)
    assert len(events) == 1
    e = events[0]
    assert e.direction is Direction.darker
    assert (e.onset, e.peak, e.last_seen, e.recovery) == (3, 4, 4, 5)
    assert e.status is Status.recovered
    assert e.growth_passes == 1
    assert abs(e.peak_area_km2 - 400 * GRID.pixel_km2) < 0.1


def test_persistent_change_at_end_of_series_is_ongoing():
    cube, hh, hv = make_cube(1)
    hv[4:, 30:55, 30:55] -= 5
    e = detect(cube)[0]
    assert e.recovery is None
    assert e.status is Status.stable
    assert e.signature.shape == (T, 3)
    assert e.signature[-1, 1] < -4


def test_baseline_passes_never_become_events():
    cube, hh, hv = make_cube(2)
    hh[1, 5:40, 5:40] -= 10
    hv[1, 5:40, 5:40] -= 10
    assert detect(cube) == []


def test_speckle_and_tiny_patches_are_dropped():
    cube, hh, hv = make_cube(3)
    hh[5, 20:22, 20:22] -= 10
    hv[5, 20:22, 20:22] -= 10
    assert detect(cube) == []
