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


def test_moderate_open_water_that_recedes_is_flood():
    label = classify(features(peak_d_hh=-3.4, peak_d_hv=-3.1, recovered=True, after_d_hh=0.2, cover={"crop": 0.8}))
    assert label.type is ChangeType.flood


def test_shallow_planting_water_that_greens_is_crop_growth():
    label = classify(features(peak_d_hh=-2.5, peak_d_hv=-1.5, recovered=True, after_d_hh=4.5, cover={"crop": 0.9}))
    assert label.type is ChangeType.crop_growth
    assert "not a flood" in label.reason


def test_deep_water_on_fields_that_green_is_a_low_confidence_flood_that_says_so():
    label = classify(features(peak_d_hh=-6, peak_d_hv=-5, recovered=True, after_d_hh=4.5, cover={"crop": 0.9}))
    assert label.type is ChangeType.flood
    assert label.confidence < 0.5
    assert "planting" in label.reason


def test_greening_on_non_cropland_after_water_stays_flood():
    label = classify(features(peak_d_hh=-6, peak_d_hv=-5, recovered=True, after_d_hh=4.5, cover={"grass": 0.9}))
    assert label.type is ChangeType.flood


def test_summer_cropland_that_brightens_and_stays_is_crop_growth():
    label = classify(
        features(direction="brighter", peak_d_hh=5.3, peak_d_hv=3.9, onset=date(2026, 7, 22), passes_active=9, recovered=False, cover={"crop": 0.85})
    )
    assert label.type is ChangeType.crop_growth


def test_brief_brightening_under_crops_is_flooded_vegetation():
    label = classify(features(direction="brighter", peak_d_hh=4.5, peak_d_hv=1, passes_active=1, recovered=True, cover={"crop": 0.7}))
    assert label.type is ChangeType.flood


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
