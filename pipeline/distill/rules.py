"""Explainable change-type rules. Each label carries the reason it was chosen."""

from dataclasses import dataclass
from datetime import date
from enum import Enum


class ChangeType(str, Enum):
    flood = "flood"
    fire_scar = "fire_scar"
    harvest = "harvest"
    crop_growth = "crop_growth"
    deforestation = "deforestation"
    glacier_movement = "glacier_movement"
    ground_deformation = "ground_deformation"
    other = "other"


@dataclass(frozen=True)
class Features:
    direction: str  # "darker" | "brighter"
    peak_d_hh: float  # dB change vs baseline at the peak pass
    peak_d_hv: float
    onset: date
    passes_active: int
    recovered: bool
    growth_passes: int
    peak_area_km2: float
    cover: dict[str, float]  # WorldCover class fractions over the footprint
    after_d_hh: float | None = None  # mean HH change over the same ground after the event ended, None if it never ended
    lat: float | None = None  # latitude of the footprint's centre


@dataclass(frozen=True)
class Label:
    type: ChangeType
    confidence: float
    reason: str


TROPIC_LAT = 23.44


def _db(x: float) -> str:
    return f"{abs(x):.1f} dB"


def _clip(x: float) -> float:
    return round(min(max(x, 0.05), 0.95), 2)


def _margin(value: float, threshold: float, span: float) -> float:
    return min(max((value - threshold) / span, 0.0), 1.0)


def classify(f: Features) -> Label:
    vegetated = f.cover.get("tree", 0) + f.cover.get("shrub", 0) + f.cover.get("grass", 0)
    crop = f.cover.get("crop", 0)
    tree = f.cover.get("tree", 0)
    both_drop = min(-f.peak_d_hh, -f.peak_d_hv)

    turned_green = f.after_d_hh is not None and f.after_d_hh >= 2

    if f.direction == "darker" and f.recovered and crop >= 0.5 and turned_green:
        if both_drop >= 3:
            return Label(
                ChangeType.flood,
                0.4,
                f"Water stood on these fields, darkening both polarizations by at least {_db(both_drop)}, then drained. The fields greened afterwards, so some of this may be paddies flooded for planting rather than a flood. Radar passes 12 days apart cannot tell the two apart.",
            )
        return Label(
            ChangeType.crop_growth,
            _clip(0.5 + 0.3 * _margin(f.after_d_hh or 0, 2, 4)),
            f"Fields went dark by {_db(f.peak_d_hh)}, as flooded paddies do at planting, then turned {f.after_d_hh:+.1f} dB brighter than before as the crop grew. Planting water, not a flood.",
        )

    if f.direction == "darker" and both_drop >= 3 and (f.recovered or f.passes_active <= 2):
        back = "returned to normal" if f.recovered else "has not yet returned to normal"
        conf = 0.5 + 0.3 * _margin(both_drop, 3, 7) + (0.1 if f.recovered else 0)
        return Label(
            ChangeType.flood,
            _clip(conf),
            f"Both polarizations went dark by at least {_db(both_drop)}, which is how smooth standing water looks to radar, and the area {back}.",
        )

    if f.direction == "brighter" and f.peak_d_hh >= 3 and f.passes_active <= 2 and f.recovered and (crop + f.cover.get("wetland", 0)) >= 0.4:
        return Label(
            ChangeType.flood,
            _clip(0.45 + 0.2 * _margin(f.peak_d_hh, 3, 5)),
            f"HH brightened by {_db(f.peak_d_hh)} over vegetation and then faded, the double-bounce pattern of water standing under crops or reeds.",
        )

    if f.direction == "brighter" and crop >= 0.5 and f.passes_active >= 3 and f.onset.month in (5, 6, 7, 8, 9):
        return Label(
            ChangeType.crop_growth,
            _clip(0.5 + 0.3 * _margin(crop, 0.5, 0.4) + 0.1 * _margin(f.peak_d_hh, 2, 4)),
            f"Cropland grew {_db(f.peak_d_hh)} brighter in the growing season and stayed bright for {f.passes_active} passes, which is how a crop canopy filling in looks to radar.",
        )

    if f.direction == "darker" and not f.recovered and crop >= 0.5 and f.onset.month >= 9 and f.peak_d_hv <= -1:
        conf = 0.55 + 0.3 * _margin(crop, 0.5, 0.4) + 0.1 * _margin(-f.peak_d_hv, 1, 3)
        return Label(
            ChangeType.harvest,
            _clip(conf),
            f"Cross-polarized return fell {_db(f.peak_d_hv)} on cropland in autumn and stayed low, which is what happens when standing crops are cut.",
        )

    tropical = f.lat is not None and abs(f.lat) <= TROPIC_LAT
    if f.direction == "darker" and not f.recovered and tropical and tree >= 0.6 and f.peak_d_hv <= -1:
        return Label(
            ChangeType.deforestation,
            _clip(0.45 + 0.2 * _margin(tree, 0.6, 0.3) + 0.1 * _margin(-f.peak_d_hv, 1, 3)),
            f"Tropical forest lost {_db(f.peak_d_hv)} of cross-polarized return and did not recover. In tropical forest, lasting canopy loss is most often clearing, and the burning that follows a clearing looks the same to radar, so this may also be a fire.",
        )

    if f.direction == "darker" and not f.recovered and vegetated >= 0.5 and f.peak_d_hv <= -1:
        if f.growth_passes >= 1 or f.peak_area_km2 >= 5:
            grew = f"grew over {f.growth_passes + 1} passes" if f.growth_passes else "covers a large area"
            conf = 0.55 + 0.2 * _margin(vegetated, 0.5, 0.4) + 0.15 * _margin(-f.peak_d_hv, 1, 3)
            return Label(
                ChangeType.fire_scar,
                _clip(conf),
                f"Cross-polarized return over vegetation fell {_db(f.peak_d_hv)} and stayed low, a sign that leaves and branches are gone; the patch {grew}, the way a fire spreads.",
            )
        if tree >= 0.6:
            return Label(
                ChangeType.deforestation,
                _clip(0.45 + 0.2 * _margin(tree, 0.6, 0.3)),
                f"A small forest patch lost {_db(f.peak_d_hv)} of cross-polarized return and did not recover, consistent with trees being cleared.",
            )

    verb = "darkened" if f.direction == "darker" else "brightened"
    return Label(
        ChangeType.other,
        0.3,
        f"The surface {verb} (HH {f.peak_d_hh:+.1f} dB, HV {f.peak_d_hv:+.1f} dB), but the pattern does not match any change type confidently.",
    )
