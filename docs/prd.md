# Distill — PRD & Tech Spec

Oct 22, 2026 · Amani Bobo

## Overview

**Distill turns NISAR radar data into a searchable, self-explaining map of how Earth's surface is changing.** Radar sees through clouds and darkness, but its imagery is hard for anyone outside remote sensing to read. Distill detects change, labels what kind of change it is, and lets anyone search, explore, and monitor it.

- **Challenge:** NASA Space Apps 2026, *Dancing with the SARs*. Build an interactive app using NISAR radar data to track and visualize surface change worldwide.
- **Pitch:** Radar sees Earth through clouds and darkness. Distill makes it something anyone can search, understand, and monitor.

## Goals and users

The goal is a working product on real NISAR data where every layer is backed by real analysis, not mock-ups.

**Goals**

- Detect surface change from NISAR time series at 10–15 curated sites.
- Classify each change region by type (flood, fire scar, harvest, deforestation, glacier movement, ground deformation).
- Make change searchable in plain English.
- Let users watch an area and get alerted when a new pass shows change.
- Ship a demo video and submission page strong enough to win on their own.

**Non-goals**

- Live global coverage. Curated sites only; the pipeline works for any area, but nothing runs planet-wide.
- Our own InSAR processing. Use NISAR's processed products, not raw data.
- Accounts, billing, or multi-user infrastructure.

**Target users**

| User | What they want |
| --- | --- |
| Curious public and students | See what's changing on Earth without knowing what SAR is |
| Farmers and land managers | Know when their fields, forests, or water changed |
| Insurers and city planners | Monitor assets and get alerted to floods or ground movement |
| Journalists and educators | Find and explain change events quickly |

**Success metrics**

- Classifier accuracy measured against ground truth on a held-out set, reported in the submission.
- A first-time user finds a change event through search in under 30 seconds.
- All five layers work end to end in the demo with no faked data.

## Product: five layers

One workflow — see → find → understand → explore → watch. The change map (layer 2) is the core; everything else reads from its table of change regions.

| # | Layer | User story | Requirements | Priority |
| --- | --- | --- | --- | --- |
| 1 | See — radar vs. optical slider | As a newcomer, I want to see why radar matters so I trust what follows. | Pre-aligned optical and NISAR images of the same cloudy event; drag slider; one-line caption. | P2 |
| 2 | Understand — auto-labeled change map | As a user, I want to see where the surface changed and what kind of change it was. | Change regions drawn on a map, colored by type; click for a timeline, area, confidence, and plain-English explanation; time scrubber across passes. | P0 |
| 3 | Find — natural-language search | As a user, I want to ask "where did farmland flood since August?" and jump to results. | LLM parses query into a structured filter (type, place, date range, size); results list plus map fly-to; graceful fallback when nothing matches. | P1 |
| 4 | Explore — 3D deformation viewer | As a user, I want to watch the ground move after an earthquake. | Interferogram displacement draped over a DEM; adjustable vertical exaggeration; time playback; works for any site with GUNW data. | P1 |
| 5 | Watch — area alerts | As a land manager, I want to know when my area changes. | Draw or pick an area; scheduled job checks ASF for new passes, runs detection, emails on change; replay mode that steps through past passes for demos. | P1 |

## Differentiators

Added 2026-11-09. These apply to Distill overall, not one layer.

**1. Change as space-time events, not snapshots.** Treat the NISAR time series as a cube (x, y, time) and segment change as volumes. Each event has an onset, a peak, a spread, and a recovery. A flood starts on one pass, grows for two, and recedes by the fourth. This enables:

- Search with time built in: "floods that lasted more than two passes," "fire scars that are still expanding."
- Lifecycle playback: watch one event start, grow, and fade.
- Better classification: a harvest and a flood can look the same in one before/after pair, but their timing differs.

**2. "Find more like this" search.** Click any event and Distill finds places where the ground changed the same way. Each event gets an embedding of its signature: backscatter change per polarization over time, coherence loss, displacement, and timing. Then it's a nearest-neighbor search over all events. Text search needs a word for the thing; query-by-example finds patterns nobody has named.

**3. Release the first open NISAR change dataset.** Package the labeled events (type, geometry, timing, source passes) and the classifier, and publish both on Hugging Face. Claim: "We released the first open labeled dataset of surface change events from NISAR L-band data."

## Demo flow (~3 min)

1. Hook (20s): cloudy optical image of a flood; drag the slider; NISAR sees the water.
2. Map (40s): globe with change regions lit up by type; scrub time across passes.
3. Search (30s): "where did farmland change since August?" — map flies to results.
4. Understand (30s): click a region; type, confidence, area, timeline, explanation.
5. Explore (30s): Venezuela earthquake site in 3D.
6. Watch (30s): draw a box around a glacier, hit Watch, run replay mode.
7. Close (10s): pitch line and accuracy number.

## Data

Two NISAR L-band products from ASF. Calibrated NISAR data is public from June 17, 2026 onward.

| Product | What it is | Used for |
| --- | --- | --- |
| GCOV | Geocoded backscatter | Floods, fire scars, harvest, deforestation |
| GUNW | Geocoded unwrapped interferogram | Earthquakes, subsidence, glacier motion |

Access via `asf_search` or `earthaccess`; Vertex for browsing. Products are large HDF5; download, clip, and cache each site once.

Sites: at least one per change type; anchor deformation site is the Venezuela earthquakes of June 24, 2026; prefer sites with good ground truth and cloudy optical imagery.

Ground truth and support: Copernicus EMS and NASA flood maps (floods), NASA FIRMS and MTBS (fire), USDA CDL (harvest, US), Hansen Global Forest Change (deforestation), ESA WorldCover (context, unchanged sampling), USGS earthquake catalog, Copernicus GLO-30 DEM, Sentinel-2 / HLS optical.

## Architecture

Heavy radar processing runs offline per site; the app only reads precomputed results. The change regions table is the center: search filters it, the map draws it, alerts write rows to it.

**Change event record:** `id`, `site`, `geometry` (footprint at peak), `footprint_by_pass`, `change_type`, `confidence`, `area_km2`, `onset`, `peak`, `recovery` (null if ongoing), `status` (growing, stable, receding, recovered), `pass_ids`, `signature` (per-pass feature vector), `embedding`, `summary`, `has_deformation`.

## Tech stack

| Layer | Choice |
| --- | --- |
| Data access | `asf_search`, `earthaccess` |
| Raster processing | Python, `xarray`, `rioxarray`, `h5py`, GDAL |
| Change detection | Log-ratio of backscatter across passes, speckle filtering, `scikit-image` segmentation |
| Classifier | LightGBM on per-region features (HH/HV change, texture, timing, slope, land cover) |
| Heavy compute | Modal |
| Database | Supabase (Postgres + PostGIS) |
| Rasters and tiles | COGs in object storage, served via TiTiler |
| API | FastAPI |
| Search and explanations | Claude API with structured output |
| Frontend | Next.js, MapLibre GL, deck.gl |
| 3D viewer | react-three-fiber |
| Slider | `react-compare-slider` |
| Alerts | Modal scheduled function + Resend |
| Hosting | Vercel (frontend), Modal (API and jobs) |

## Risks

| Risk | Mitigation |
| --- | --- |
| HDF5 products are large and unfamiliar | Clip and cache each site once; pipeline before UI |
| Provisional data has known issues | Check ASF's known-issues page; drop bad sites |
| Only ~four months of passes | Pick events inside the window; compare against a pre-event baseline |
| Speckle noise causes false changes | Speckle filter, require change across consecutive passes, minimum region size |
| Unwrapping errors | Mask by coherence; fade low-confidence areas |
| Ground truth misaligned | Hand-label a small set; report accuracy honestly |
| LLM search returns wrong filters | Constrained schema; show the parsed filter |
| Scope creep | Feature freeze before polish |

## Open questions

- [ ] Which 10–15 sites, and which events at each? (Milestone 1 sites: see decisions.md)
- [ ] Submission deadline date and judging format?
