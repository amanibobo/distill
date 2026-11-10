# Decisions

## 2026-11-09 — First milestone is the pipeline plus the change map

Build layer 2 (the change map, P0) on real NISAR data at 2–3 sites first. This covers the Python pipeline, the change regions table, and a polished map with region detail and the time scrubber. Layers 1, 3, 4, and 5 come after.

Why: everything reads from the regions table, and the data pipeline is the biggest schedule risk.

## 2026-11-09 — Three differentiators added to Distill

Added to the PRD: space-time change events (x, y, time cube with onset, peak, recovery), "find more like this" search over event embeddings, and an open labeled NISAR change dataset on Hugging Face. The regions table becomes an events table with lifecycle fields, a per-pass signature, and an embedding.

## 2026-11-09 — Milestone 1 detects space-time events and stores signatures

The pipeline segments the (x, y, time) cube into events with onset, peak, recovery, status, and per-pass footprints. The time scrubber plays each event's footprint pass by pass. Each event also stores its per-pass signature now, so "find more like this" and the dataset export are cheap later. Two-date change detection is not built.

## 2026-11-09 — Milestone 1 labels events with explainable rules, scored against ground truth

Event type comes from rules on the signature and timing (HH/HV change, onset-to-recovery shape, land cover). Each label stores the reason it was chosen, and the UI shows that reason. Rule labels are scored against ground truth at each site and the scores are reported. LightGBM waits until there are enough sites for a real held-out set.

## 2026-11-09 — Milestone 1 sites

Three GCOV sites, one per timing shape. Venezuela (GUNW) waits for the 3D milestone. The agent confirms coverage with `asf_search` before downloading and swaps a site if passes are thin.

- **Flood: Upper Assam, India, July–Aug 2026.** Monsoon floods after 18–20 July rain, 7 districts. Known NISAR GCOV passes on track 40 (21–22 Jul, 15 Aug) and track 163 (10–12 Aug). Ground truth: Copernicus EMS EMSR935, cloud-free Sentinel-2 water. Watch out: July rice transplanting looks like new water. This is a good test for timing rules. Backup: Chao Phraya, Thailand, Sep–Oct 2026.
- **Fire scar: Kaiser Canyon Fire, Okanogan/Ferry counties, Washington.** Lightning start 16 Jul 2026, ~138,293 acres, contained ~7 Sep. Grew over weeks, which fits "still expanding." Ground truth: NIFC final perimeter, FIRMS hotspots by date for growth.
- **Harvest: central Iowa corn and soybean, Sep–Nov 2026.** Ground truth: USDA CDL 2025 for field crop type, HLS/Sentinel-2 NDVI drop for per-field harvest date.

Sources: JalDrishti (github.com/nayanip2001-max/JalDrishti), Copernicus EMS, IQAir/Watch Duty and NIFC reports on Kaiser Canyon.

## 2026-11-09 — Map screen look and layout

Dark, quiet basemap, map full-bleed. Change events are the only color on screen, one color per type. One slim timeline along the bottom scrubs across passes. Clicking an event opens a right-side panel with type, the rule's reason, confidence, area, lifecycle (onset, peak, recovery), and the plain-English summary. Follows the no-vibecoded-UI rules: sentence case, no tracked uppercase labels, no glass cards, no decorative accents.

## 2026-11-09 — Milestone 1 infrastructure

_Updated 2026-11-10: the database is a hosted Supabase free project, not local. There's no Docker on this machine._

Pipeline runs locally in Python and caches clipped subsets per site. Events go into Supabase Postgres with PostGIS (and pgvector for the embedding column, unused until "find more like this"). Next.js API routes read the events table. Rasters are served as static PMTiles. FastAPI, Modal, and TiTiler wait until a later milestone needs them.

## 2026-11-09 — First-open experience

Opens on a dark globe with the three sites glowing in their event colors and one line saying what Distill is. A small site list in a corner allows keyboard jumps. Clicking a site flies there and starts the timeline. The URL updates with site, event, pass, and camera so any view can be shared.

## 2026-11-10 — Hosted Supabase, not local

Supersedes the local Supabase CLI note. Events live in a hosted Supabase free project with PostGIS and pgvector. The connection string goes in `/Users/amanibobo/distill/.env` as `DATABASE_URL`. Earthdata credentials are in `~/.netrc`, and `ANTHROPIC_API_KEY` is in `.env`.
