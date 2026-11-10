from datetime import date

from distill.rules import ChangeType, Features, classify


def features(**kw) -> Features:
    base = dict(
        direction="darker",
        peak_d_hh=-1.0,
        peak_d_hv=-1.0,
        onset=date(2026, 7, 22),
        passes_active=1,
        recovered=True,
        growth_passes=0,
        peak_area_km2=3.0,
        cover={"grass": 1.0},
    )
    base.update(kw)
    return Features(**base)


def test_open_water_that_recedes_is_flood():
    label = classify(features(peak_d_hh=-9, peak_d_hv=-8, recovered=True))
    assert label.type is ChangeType.flood
    assert "returned to normal" in label.reason


def test_flood_on_july_paddies_is_less_confident_than_on_grass():
    grass = classify(features(peak_d_hh=-9, peak_d_hv=-8))
    paddy = classify(features(peak_d_hh=-9, peak_d_hv=-8, cover={"crop": 0.9}))
    assert paddy.type is ChangeType.flood
    assert paddy.confidence < grass.confidence


def test_persistent_autumn_hv_drop_on_cropland_is_harvest():
    label = classify(
        features(peak_d_hh=-1, peak_d_hv=-4, onset=date(2026, 9, 18), recovered=False, passes_active=3, cover={"crop": 0.95})
    )
    assert label.type is ChangeType.harvest


def test_growing_persistent_hv_drop_over_forest_is_fire_scar():
    label = classify(
        features(
            peak_d_hh=-1.5,
            peak_d_hv=-3.5,
            onset=date(2026, 7, 25),
            recovered=False,
            passes_active=6,
            growth_passes=2,
            peak_area_km2=200,
            cover={"tree": 0.6, "shrub": 0.3},
        )
    )
    assert label.type is ChangeType.fire_scar
    assert "3 passes" in label.reason


def test_small_static_forest_loss_is_deforestation():
    label = classify(
        features(peak_d_hh=-1, peak_d_hv=-3, recovered=False, passes_active=3, growth_passes=0, peak_area_km2=1.2, cover={"tree": 0.9})
    )
    assert label.type is ChangeType.deforestation


def test_summer_cropland_drop_is_not_harvest():
    label = classify(features(peak_d_hv=-4, onset=date(2026, 7, 22), recovered=False, passes_active=3, cover={"crop": 0.9}))
    assert label.type is not ChangeType.harvest


def test_weak_change_is_other_with_values_in_reason():
    label = classify(features(direction="brighter", peak_d_hh=3.5, peak_d_hv=0.5, recovered=False, cover={"built": 1.0}))
    assert label.type is ChangeType.other
    assert "+3.5 dB" in label.reason
