from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    place: str
    bbox: tuple[float, float, float, float]  # west, south, east, north
    track: int
    direction: str
    start: date
    end: date
    baseline_start: date
    baseline_end: date


SITES: dict[str, Site] = {
    s.id: s
    for s in [
        Site(
            id="assam",
            name="Upper Assam floods",
            place="Sivasagar and Jorhat, Assam, India",
            bbox=(94.2, 26.6, 95.0, 27.5),
            track=40,
            direction="A",
            start=date(2026, 6, 1),
            end=date(2026, 11, 10),
            baseline_start=date(2026, 6, 1),
            baseline_end=date(2026, 7, 11),
        ),
        Site(
            id="kaiser",
            name="Kaiser Canyon Fire",
            place="Colville Reservation, Washington, USA",
            bbox=(-119.45, 48.0, -118.65, 48.42),
            track=71,
            direction="D",
            start=date(2026, 6, 1),
            end=date(2026, 11, 10),
            baseline_start=date(2026, 6, 1),
            baseline_end=date(2026, 7, 14),
        ),
        Site(
            id="iowa",
            name="Central Iowa harvest",
            place="Story and Boone counties, Iowa, USA",
            bbox=(-94.0, 41.85, -93.2, 42.2),
            track=4,
            direction="A",
            start=date(2026, 6, 1),
            end=date(2026, 11, 10),
            baseline_start=date(2026, 7, 15),
            baseline_end=date(2026, 8, 31),
        ),
    ]
}
