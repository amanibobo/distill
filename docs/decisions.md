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

- **Flood: Upper Assam, India, July–Aug 2026.** Monsoon floods after 18–20 July rain, 7 districts. Known NISAR GCOV passes on track 40 (21–22 Jul, 15 Aug) and track 163 (10–12 Aug). Ground truth: Sentinel-1 RTC water (see 2026-11-10 correction). Watch out: July rice transplanting looks like new water. This is a good test for timing rules. Backup: Chao Phraya, Thailand, Sep–Oct 2026.
- **Fire scar: Kaiser Canyon Fire, Okanogan/Ferry counties, Washington.** Lightning start 16 Jul 2026, ~138,293 acres, contained ~7 Sep. Grew over weeks, which fits "still expanding." Ground truth: NIFC final perimeter, FIRMS hotspots by date for growth.
- **Harvest: central Iowa corn and soybean, Sep–Nov 2026.** Ground truth: USDA CDL 2025 for field crop type, HLS/Sentinel-2 NDVI drop for per-field harvest date.

Sources: JalDrishti (github.com/nayanip2001-max/JalDrishti), Copernicus EMS, IQAir/Watch Duty and NIFC reports on Kaiser Canyon.

## 2026-11-09 — Map screen look and layout

Dark, quiet basemap, map full-bleed. Change events are the only color on screen, one color per type. One slim timeline along the bottom scrubs across passes. Clicking an event opens a right-side panel with type, the rule's reason, confidence, area, lifecycle (onset, peak, recovery), and the plain-English summary. Follows the no-vibecoded-UI rules: sentence case, no tracked uppercase labels, no glass cards, no decorative accents.

## 2026-11-09 — Milestone 1 infrastructure

_Updated 2026-11-10: the database is a hosted Supabase free project, not local. There's no Docker on this machine._

Pipeline runs locally in Python and caches clipped subsets per site. Events go into Supabase Postgres with PostGIS (and pgvector for the embedding column, unused until "find more like this"). Next.js API routes read the events table. Rasters are served as static PMTiles. FastAPI, Modal, and TiTiler wait until a later milestone needs them.

## 2026-11-09 — First-open experience

_Updated 2026-11-10: the globe now lives at `/map`, behind a landing page. See below._

Opens on a dark globe with the three sites glowing in their event colors and one line saying what Distill is. A small site list in a corner allows keyboard jumps. Clicking a site flies there and starts the timeline. The URL updates with site, event, pass, and camera so any view can be shared.

## 2026-11-10 — Hosted Supabase, not local

Supersedes the local Supabase CLI note. Events live in a hosted Supabase free project with PostGIS and pgvector. The connection string goes in `/Users/amanibobo/distill/.env` as `DATABASE_URL`. Earthdata credentials are in `~/.netrc`, and `ANTHROPIC_API_KEY` is in `.env`.

## 2026-11-10 — Site data, checked against ASF

Correction: EMSR935 is the October 2026 Valencia flood, not Assam. Copernicus EMS has no Assam activation. Assam ground truth is Sentinel-1 RTC (C-band, Planetary Computer) water on 22 Jul and 15 Aug, the same days as NISAR passes, with JRC permanent water removed.

One track per site keeps geometry constant across the cube:

| Site | Track | Passes | Area (lon, lat) |
| --- | --- | --- | --- |
| Assam | 040 ascending | 12, 16 Jun to 7 Nov | 94.2 to 95.0, 26.6 to 27.5 |
| Kaiser Canyon | 071 descending | 10, 19 Jun to 17 Oct | -119.45 to -118.65, 48.0 to 48.42 (NIFC perimeter plus buffer) |
| Iowa | 004 ascending | 11, 26 Jun to 24 Oct | -94.0 to -93.2, 41.85 to 42.2 (Story and Boone counties) |

Files are never downloaded whole (about 7 GB each, and the disk has under 3 GB free). The fetch streams the site window over HTTPS with Earthdata auth, multilooks 4x4 to 40 m, and caches float16 dB per pass. FIRMS needs an API key, so Kaiser Canyon growth is checked against the NIFC final perimeter only.

## 2026-11-10 — Landing page, process, and writeup

Supersedes "opens on a dark globe" for `/`. The site has four pages:

- `/` is a landing page modeled on binaryhq.vercel.app. Light ground, a narrow single column, a serif wordmark, a one-line lede, a dotted row of links (Open the map, Process, Writeup), a lowercase mono section label, and short paragraphs with marker highlights that draw in on scroll.
- `/map` is the dark globe app, as specified in the earlier decisions.
- `/process` covers how Distill was built: the decisions, the dead ends, and the corrections.
- `/writeup` covers the technical architecture, with hand-drawn diagrams in the Excalidraw style. They are drawn with rough.js (the engine Excalidraw uses) and Excalifont, as code rather than an embedded Excalidraw editor.

The map stays dark because it's an instrument. The reading pages stay light because they're editorial. Geist is the body face, not Inter.

## 2026-11-10 — Change-type colors

Validated against the dark map surface (#101113) with the dataviz palette checker, using all pairs. Flood is #3987e5, fire scar #d95926, and harvest #199e70. Other is a neutral gray. Adding yellow for harvest failed the color-blindness check against fire's orange. Every type is also named in words wherever it appears, so color is never the only cue.

## 2026-11-10 — MapLibre alone, no deck.gl

MapLibre GL 5 draws the globe, the event polygons (fill plus outline, with feature-state for hover and selection), and the per-pass radar images. deck.gl would add weight without adding anything this milestone needs.

## 2026-11-10 — Thresholds come from measured noise

A flat 3 dB threshold found 6% of the Kaiser Canyon burn. L-band HV inside the perimeter fell only about 1.2 dB, against 0.6 dB outside, and a rain pass on 30 Aug brightened the whole scene by 1.5 dB. Detection now runs in four steps:

1. Change is measured against the baseline median per pixel.
2. Each pass's scene-wide wet/dry shift is subtracted. The shift is measured on land that shouldn't change seasonally: not cropland, water, or wetland.
3. Change is smoothed over 5x5 pixels (200 m) to find where it is, then trimmed back to pixels whose own change also clears the threshold.
4. The threshold is three robust standard deviations of pass-to-pass change among the baseline passes, with a 1 dB floor.

The perimeter is never used to set any of this. On Kaiser Canyon, pixel recall rose from 0.06 to 0.26 and precision went from 1.00 to 0.88. The remaining gap is a known L-band limit: burned grass barely changes in backscatter. Coherence loss from GUNW would close it, and that's a later milestone.

## 2026-11-10 — Geist Mono, NASA accents, flat map

These supersede earlier choices:

- **Typeface.** Geist Mono everywhere: the reading pages, the map UI, the wordmark, and the panel titles. This replaces Geist and the serif wordmark. The hand-drawn diagrams keep the Excalidraw Virgil font.
- **Accents.** NASA blue (#0b3d91) and NASA red (#fc3d21). The pixel droplet logo is NASA blue with one red cell on the reading pages, and light ink with the red cell on the dark map. Links and most marker highlights use blue, and red is used sparingly. The change-type colors on the map stay as they are, because they encode data.
- **Map.** A flat Web Mercator map replaces the globe, and the idle spin is gone. The opening view frames all sites.

## 2026-11-10 — Quiet light tool style, Geist Sans

This supersedes the dark map, Geist Mono, and NASA-blue accents for chrome. It follows a style reference the user supplied:

- **Surfaces.** Off-white #f7f7f7, white raised controls, 1px #e6e6e6 hairlines. Text is #2b2b2b, #6f6f6f, and #a3a3a3, and hovered rows are #efefef.
- **Type.** Geist Sans at weight 400, with hierarchy from size and grey level. Geist Mono only for coordinates.
- **Shape.** The map sits in a white card with a 20px radius. Controls and key caps use 8px, and rows 10px. Shadows are almost absent.
- **Accent.** Blue #2f7bf6 is used only for selection. The logo keeps NASA blue with one red cell.
- **Icons.** Lucide line icons.
- **Map layout.** Rail on the page surface (tab bar, section header, action-list rows with key caps). The card holds a toolbar (pass stepper, a location field, Radar and Share buttons), the map on a CARTO Positron basemap, the inspector as an in-card column, and the timeline below a hairline. Shortcut keys flash a black toast.
- **Change colors.** Stepped for the light surface: flood #2a78d6, fire scar #eb6834, harvest #1baf7a. These pass all-pairs color-blindness checks. Orange and green are under 3:1 contrast, so shapes keep outlines and every type is named in text.

## 2026-11-15 — Assam: crop growth type, matched reference window

Assam is mostly rice farmland, and July to October is rice season. Most change there is paddies brightening as rice grows. A new type, **crop growth**, covers cropland that brightens in the growing season and stays bright, and fields that go dark, drain and then green, which is planting water. It shares harvest's green as one agriculture family and is drawn hatched, because no fourth hue passed the all-pairs color-blindness check against fire orange.

The flood rule now needs both polarizations darker by 3 dB (was 5) and the area back to normal. Water on fields that drains and then greens by 3 dB or more is labeled a flood at 0.4 confidence, and its reason says it may be planting water. Radar passes 12 days apart cannot tell the two apart. **This rule was revised after seeing that most Sentinel-1 flood pixels fell in events the planting rule had claimed, so the Assam score is not an independent check.** The Sentinel-1 reference now compares against 16 June, matching NISAR's baseline window (it was 15 July). Even so, Assam flood recall is about 5%. The honest limit is that most flood water at 40 m shows as less than a 3 dB drop and then greens.

Unexplained "other" events get a template caption instead of a Claude call, and the map hides them by default.

## 2026-11-15 — Process page removed; remaining layers built in parallel

The Process tab and page are gone at the user's request. The tabs are now Map, Watch, Explore and Writeup. Search, Watch (areas and replayed alerts), Explore (3D GUNW deformation), find more like this (pgvector embeddings), the radar versus optical slider, and the submission text are being built by parallel agents. Each one owns separate files.

## 2026-11-15 — Explore: Venezuela GUNW, sign convention inferred

`/explore` shows line-of-sight motion from NISAR GUNW track 162A, frame 7, for the pair 13 Jun and 25 Jun 2026, which brackets the 24 June M7.2 and M7.5 quakes. It's draped on the Copernicus GLO-30 DEM. The product's ionosphere screen is removed, values are referenced to the window median, and coherence below 0.3 is faded. **The sign convention is inferred, not stated in the product.** It follows the ISCE and ARIA GUNW convention, where positive phase means range increase. If that's wrong, toward and away swap. The playback is a linear blend between two passes and is labeled as one.

## 2026-11-15 — One screen, canvas first

This supersedes the Map/Watch/Explore tabs. The user found the features felt "shoved together" and hard to play with, and shared a pro creative-tool reference (Viewfinder) as the target. The app is now one screen at `/map`:

- A breadcrumb with a site switcher, which includes "Venezuela earthquake · 3D".
- A thin icon rail.
- The map as the canvas, with floating toolbars and the ⌘K ask pill.
- A dock: pass filmstrip, selected change with Find similar and Watch this area, a Play card (the only filled button), and a Map/Watch/3D mode switch.

Watch and 3D happen in the same frame. `/watch` and `/explore` redirect into it. Opening `/map` with no parameters starts on Kaiser Canyon with the passes playing. Search is the ⌘K palette, which streams Claude's tool calls over the events table. The inline rail search and `/api/search` are removed. A first-visit tour has six steps with recorded clips.

## 2026-11-15 — 3D ground motion: four more places

The 3D view now has five places. Each is one provisional NISAR GUNW pair that brackets the event, picked by `find_pair` and processed the same way as Venezuela. The ionosphere screen is removed, values are referenced to the window median, and coherence below 0.3 is faded. Venezuela's export is byte-identical to before.

| Place | Event (USGS) | Pair | Track | 1st to 99th percentile |
| --- | --- | --- | --- | --- |
| Catia La Mar | us6000t7zp, M7.5, 24 Jun | 22 Jun to 4 Jul, 12 days | 126 descending, frame 83 | -11 to +34 cm |
| Kumamoto | us6000tgb9, M6.8, 28 Jul | 21 Jul to 14 Aug, 24 days | 24 ascending, frame 18 | -21 to +19 cm |
| Flores Sea | us6000tkt2, M7.8, 14 Aug | 12 Aug to 24 Aug, 12 days | 168 ascending, frame 173 | -4 to +8 cm |
| Panama | us6000u18k, M7.7, 9 Oct | 2 Oct to 14 Oct, 12 days | 40 descending, frame 85 | -31 to +145 cm |

- `Site.track` pins a track when the default pick covers the window poorly. Catia is pinned to 126D because 162A, the Venezuela pair, has an unwrapping step along the swath edge and 061A keeps 22% of the window. Panama is pinned to 40D because 141D is a partial frame that keeps 17% and 76A has unwrapping steps.
- Catia's ascending and descending pairs show opposite-signed gradients over the same coast. That fits mostly horizontal motion, not an atmospheric ramp.
- Flores is offshore. The window covers the north coast of Flores, so it shows the far field, about 10 cm. Tropical atmosphere can add a few cm.
- The sign convention is still inferred, as for Venezuela. The look direction is read from the product: `identification/lookDirection` is Left, so ascending passes look west and descending passes look east. The facts card words toward and away from that.
- Dropped the Colombia M7.4 of 10 Aug (us6000tjl2). It was 116 km deep. On 148A, 18 Jul to 11 Aug, 18% of the window stayed coherent over the Chocó forest, and the rest split along the swath edge with striping. That is an artifact, not a deformation pattern.
- Dropped Fuego's 5 Aug eruption. On 134A, 17 Jul to 10 Aug, motion is within about ±6 cm with no pattern centred on the volcano. Coherence is low near the summit, but without a pre-eruption pair it can't be told apart from the usual loss on steep, vegetated slopes.
- Dropped the Nagqu M7.0 of 22 Oct. Only an urgent-response (UR) product brackets it, not a provisional one.
- In the app, the switcher lists the places under "Ground motion · 3D", oldest event first. The digit keys run on from the radar sites, so 4 to 8 open them. The rail's 3D button and the 3D mode open the most recent event, Panama, or stay on the open place. `/explore` and the tour still open Venezuela.

## 2026-11-15 — Four more radar sites: three EMS wildfires and an Amazon clearing

Coverage was checked with `asf_search` on one track per site before any download. Each site has at least three baseline passes and seven passes after the event. Windows are 35 to 65 km across, the same scale as Kaiser Canyon.

| Site | Event | Track | Passes | Area (lon, lat) | Reference |
| --- | --- | --- | --- | --- | --- |
| Huelva wildfire | EMSR913, from 6 Aug | 023 descending | 11, 27 Jun to 6 Nov, 3 baseline | -6.75 to -6.24, 37.40 to 37.65 | EMS grading, 15 Aug, 337 km² burnt |
| Viotia wildfires | EMSR909, 31 Jul | 158 ascending | 11, 25 Jun to 4 Nov, 3 baseline | 22.95 to 23.44, 37.99 to 38.31 | EMS grading, 6 Aug, 146 km² |
| Central Spain wildfires | EMSR900, from 20 Jul | 087 ascending | 11, 8 Jun to 30 Oct, 4 baseline | -4.86 to -4.11, 40.19 to 40.56 | EMS delineation AOI03, 28 Jul, 444 km² |
| São Félix do Xingu clearing | Dry-season clearing, Pará | 074 ascending | 10, 19 Jun to 29 Oct, 3 baseline | -52.85 to -52.45, -7.31 to -6.91 | INPE DETER clear-cut alerts after 13 Jul, 23 km² |

- **EMS truth.** `ems_perimeter` reads the burnt-area polygons (`observedEventA`, notation "Burnt area") straight out of the product zip with range requests, and scores only inside the product's area of interest, minus anything marked not analysed. It uses the last delineation or grading product.
- **DETER truth.** Hansen GFC stops at 2024, so it can't score 2026 clearing. INPE DETER publishes 2026 alerts over WFS. `deter_clearing` keeps `DESMATAMENTO_CR` and `DESMATAMENTO_VEG` alerts seen after the baseline. DETER maps clearings of 3 ha or more from 64 m optical imagery, so it undercounts small or cloud-hidden clearings. That makes precision against it a lower bound.
- **Missing passes.** The 23 and 24 Sep products on these tracks have no HV layer. The fetch skips them, so those sites have one pass fewer.
- **Dropped Strasevina, Montenegro (EMSR922).** On track 086A, median HV inside the 94 km² burn stayed within 0.4 dB of its baseline on every pass. The only fire-scar event came from a 6 Oct pass whose top rows were 11 dB too dark. That's a striping artifact, not the fire. Without that pass, nothing was detected in the burn.
- **Dropped the floods.** The Crete floods (EMSR933) are 4 km² or smaller per area, and they have only 3 passes after 1 Oct. The Latvia floods (EMSR926) were mapped from 22 to 24 Aug, but the first NISAR pass after them is on 30 Aug. Chao Phraya has no EMS activation and no independent map of where the flood was. Finding it from Sentinel-1 first, then scoring against that same Sentinel-1 data, would not be an independent check. There wasn't time for both today.

## 2026-11-15 — Lasting forest loss in the tropics is labeled deforestation

**This rule was written after looking at the Xingu reference, so the Xingu score is not an independent check.** At São Félix do Xingu, 46% of DETER clear-cut pixels fell in events that the fire-scar rule had claimed. Clearings there grow pass by pass, just as a fire spreads, so the "grew over passes" test sent them to fire scar. The deforestation rule only fired for small patches that weren't growing. DETER mapped 22.6 km² of clear-cut and 2 km² of burn scar in the same window.

A new rule runs before the fire-scar rule. It applies to darker events that don't recover, within 23.44° of the equator, with tree cover of at least 0.6 (the existing deforestation threshold, not a new one), and HV down by at least 1 dB. These become deforestation, and the reason says the change may also be the burning that follows a clearing. `Features` gains `lat`, the latitude at the centre of the event's window. No other site is in the tropics. Kaiser's export is byte-identical before and after the change. Against DETER, recall rose from 0.02 to 0.50, precision fell from 0.26 to 0.13, and event accuracy fell from 0.95 to 0.92.

Thresholds were not changed for any new site. Central Spain's recall is 0.29 for the same reason as Kaiser's: its largest burned event, 200 km², reached only -0.9 dB in HV at its peak pass, just short of the 1 dB rule. It stays "other".
