from datetime import date, timedelta

import numpy as np

from distill.embed import DIM, embed, features


def event(start: date, n: int, onset: int, d_hh: list[float], d_hv: list[float], area: list[float], recovered: bool) -> dict:
    dates = [(start + timedelta(days=12 * i)).isoformat() for i in range(n)]
    pad = [0.0] * onset
    hh, hv, a = pad + d_hh, pad + d_hv, pad + area
    hh, hv, a = (x + [x[-1] if not recovered else 0.0] * (n - len(x)) for x in (hh, hv, a))
    peak = int(np.argmax(a))
    active = [i for i in range(n) if a[i] > 0]
    last = active[-1]
    return {
        "signature": {"dates": dates, "d_hh": hh, "d_hv": hv, "fraction": [v / max(a) for v in a]},
        "footprint_by_pass": [{"date": dates[i], "area_km2": a[i]} for i in active],
        "pass_ids": [f"p{i}" for i in active],
        "onset": dates[onset],
        "peak": dates[peak],
        "recovery": dates[last + 1] if last + 1 < n else None,
        "status": "recovered" if last + 1 < n else "growing" if a[last] > a[last - 1] else "stable",
        "area_km2": max(a),
    }


def flood(start: date, n: int, onset: int, depth: float, km2: float) -> dict:
    return event(start, n, onset, [-depth, -depth * 0.6], [-depth * 0.9, -depth * 0.5], [km2, km2 * 0.4], recovered=True)


def fire(start: date, n: int, onset: int, km2: float) -> dict:
    return event(start, n, onset, [-0.4, -0.6, -0.7], [-1.2, -1.5, -1.6], [km2 * 0.3, km2 * 0.7, km2], recovered=False)


def crop_growth(start: date, n: int, onset: int, km2: float) -> dict:
    return event(start, n, onset, [1.0, 2.0, 3.0], [1.5, 3.0, 4.0], [km2 * 0.2, km2 * 0.6, km2], recovered=False)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(a @ b)


def corpus() -> list[dict]:
    iowa, assam = date(2026, 6, 26), date(2026, 6, 3)
    return [
        flood(iowa, 9, 3, depth=6.0, km2=40.0),
        flood(assam, 12, 7, depth=5.0, km2=30.0),
        fire(iowa, 9, 2, km2=200.0),
        crop_growth(assam, 12, 4, km2=60.0),
        fire(assam, 12, 5, km2=150.0),
        crop_growth(iowa, 9, 3, km2=80.0),
    ]


def test_events_with_the_same_lifecycle_sit_closer_than_different_ones():
    v = embed(corpus())
    flood_iowa, flood_assam, fire_iowa, crops_assam, fire_assam, crops_iowa = v
    assert cosine(flood_iowa, flood_assam) > cosine(flood_iowa, fire_iowa)
    assert cosine(flood_iowa, flood_assam) > cosine(flood_iowa, crops_assam)
    assert cosine(fire_iowa, fire_assam) > cosine(fire_iowa, crops_iowa)
    assert cosine(crops_assam, crops_iowa) > cosine(crops_assam, flood_assam)


def test_nearest_neighbor_of_each_event_is_its_own_kind_across_sites():
    v = embed(corpus())
    sims = v @ v.T
    np.fill_diagonal(sims, -np.inf)
    assert sims.argmax(axis=1).tolist() == [1, 0, 4, 5, 2, 3]


def test_the_time_series_part_ignores_calendar_dates_and_pass_counts():
    a = flood(date(2026, 6, 26), 9, 3, depth=6.0, km2=40.0)
    b = flood(date(2026, 8, 1), 12, 6, depth=6.0, km2=40.0)
    assert np.allclose(features(a), features(b))


def test_embeddings_are_unit_vectors_of_the_database_width():
    v = embed(corpus())
    assert v.shape == (6, DIM) == (6, 32)
    assert np.allclose(np.linalg.norm(v, axis=1), 1.0)
