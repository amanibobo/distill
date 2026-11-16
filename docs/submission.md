# Distill: Space Apps 2026 submission

Draft text for the project page on spaceappschallenge.org, plus demo video scripts. The sections follow the official form fields (see "Form fields" at the end). Every number comes from `pipeline/reports/accuracy.md` or `docs/decisions.md`.

Open items for the team are marked TODO.

## Project name

Distill

## One-sentence pitch

Distill turns NISAR radar into a map of how Earth's surface is changing, and explains every change in plain words.

## High-level project summary (final, unslopped; paste this one, 166 words)

Distill turns radar from NASA and ISRO's NISAR satellite into a map of how Earth's surface changed in 2026. It is live at https://distill-khaki.vercel.app.

The challenge asks for an interactive app that tracks and visualizes surface change with NISAR data. Distill reads NISAR passes over seven sites on four continents. It found 1,410 changes there: wildfires in Washington, Spain and Greece, the Iowa harvest, the Assam monsoon and forest clearing in the Amazon. It also shows ground motion in 3D from five 2026 earthquakes.

Each change has a start date, a peak date, a confidence score and a plain-English reason for its label. You can press play to watch a fire scar grow pass by pass. You can also ask questions with ⌘K, find similar changes at other sites, and watch an area for new passes.

We compare every label with an independent map and publish all the scores, including the low ones. Radar sees through clouds, smoke and darkness, but few people can read radar images. Distill lets anyone use NISAR's open data without radar training. We released every labeled event as an open dataset on Hugging Face.

## Detailed project description

(Form field: Detailed Project Description.)

### What it does

Distill answers three questions about a place: what changed, when, and why the app thinks so. You open the map, pick a site, and step through NISAR passes. Changes appear as colored shapes, one color per type, and every type is also named in text. Click a shape and a panel shows its type, confidence, area, first and last dates, how its area grew pass by pass, how its radar signal moved, and the rule that produced the label, written as a sentence.

The first version covers three sites, one for each timing pattern:

- Upper Assam floods, India (Sivasagar and Jorhat). Monsoon floods after 18 to 20 July 2026 rain.
- Kaiser Canyon Fire, Washington, USA (Colville Reservation). Lightning start on 16 July 2026, about 138,293 acres, contained around 7 September. It grew for weeks.
- Central Iowa harvest, USA (Story and Boone counties). Corn and soybean harvest, September to November 2026.

### How it works

1. Streamed NISAR GCOV. Each GCOV file is about 7 GB, and the laptop it was built on had under 3 GB free. So the pipeline never downloads a whole file. It finds passes with `asf_search`, then reads only the HDF5 tiles over each site over HTTPS with an Earthdata login. It averages 4 by 4 pixels down to 40 m, which also cuts speckle, and caches each pass as float16 dB. Each site uses one orbit track, so every pass sees the ground from the same angle.

2. The space-time cube. All passes for a site are stacked into a cube of x, y and time. Change is measured per pixel against the median of the pre-event passes. Each pass's scene-wide wet or dry shift is subtracted, measured only on land that shouldn't change with the seasons (not cropland, water or wetland). Change is smoothed over 5 by 5 pixels (200 m) to find where it is, then trimmed back to pixels whose own change also clears the threshold. The threshold is three robust standard deviations of pass-to-pass change among the baseline passes, with a 1 dB floor. Changed pixels that touch in space, or sit on the same spot in neighboring passes, join one event. So each event has an onset, a peak, a footprint for every pass, a status and, if it ends, a recovery date.

3. Rule labels with reasons. Three sites can't give an honest held-out set for a trained classifier, so labels come from rules a reader can check. The rules look at which polarization moved (HH or HV) and by how much, the land cover underneath from ESA WorldCover, when the change started, whether it grew, and whether it came back. Labels are flood, fire scar, harvest, crop growth and other. Each label stores the reason it was chosen, and the app shows it.

4. Scoring against independent references. Nothing in detection or labeling is tuned on these maps.
   - Kaiser Canyon against the NIFC WFIGS final fire perimeter.
   - Central Iowa against the USDA Cropland Data Layer, corn and soybean fields.
   - Upper Assam against new open water in Copernicus Sentinel-1 RTC (C-band, from Microsoft Planetary Computer) on 22 July and 15 August, the same days as NISAR passes, compared with 16 June.

   Pixel scores ask whether the area labeled with a type matches the reference. Event scores ask whether each event that clearly sits inside the reference (at least 50% overlap) or clearly outside it (at most 10%) got the right label.

5. Claude captions. Claude (Anthropic) writes each event's title and a two or three sentence summary from the same numbers the rules use: the rule and its reason, the dates, the area and the land cover. It is told not to invent causes or casualties. Its output is constrained to a typed schema and cached.

6. The map. A Next.js app with MapLibre draws the events over a CARTO Positron basemap. A rail lists sites and the changes at the chosen site, with filters by type. The toolbar has a pass stepper, the current site, date and pass number, a Radar button that shows the grayscale NISAR image for the pass under the shapes, and a Share button. A timeline along the bottom has one mark per pass, an activity strip showing how much area is changing on each pass, and a play button. The arrow keys, space bar, number keys and Escape work as shortcuts, and each flashes a small toast. The URL holds the site, event, pass and camera, so any view can be shared. The writeup page explains the method with hand-drawn diagrams and shows the accuracy table generated by the pipeline.

### Results

Generated by the pipeline (`pipeline/reports/accuracy.md`).

| Site | Reference | Pixel precision | Pixel recall | IoU | Events right |
| --- | --- | --- | --- | --- | --- |
| Kaiser Canyon Fire, fire scar | NIFC WFIGS final perimeter | 0.88 | 0.26 | 0.25 | 97 of 108 (0.90) |
| Central Iowa harvest, harvest | USDA CDL 2021, corn and soybean | 0.91 | 0.93 | 0.85 | 14 of 18 (0.78) |
| Upper Assam floods, flood | Sentinel-1 RTC new water, 22 Jul vs 16 Jun | 0.19 | 0.05 | 0.04 | 103 of 122 (0.84) |
| Upper Assam floods, flood | Sentinel-1 RTC new water, 15 Aug vs 16 Jun | 0.01 | 0.00 | 0.00 | 270 of 286 (0.94) |

TODO: the Assam rows are provisional. Assam is being rerun. Replace both rows and the Assam event counts below with the new `accuracy.md` before submitting.

Events found: Kaiser Canyon 111 over 10 passes (37 fire scar). Central Iowa 21 over 9 passes (13 harvest). Upper Assam 917 over 12 passes (25 flood, 587 crop growth).

The fire result is the clearest example of how the method was built. A flat 3 dB threshold found 6% of the burn. L-band HV inside the perimeter fell only about 1.2 dB, against 0.6 dB outside, and a rain pass on 30 August brightened the whole scene by 1.5 dB. Measuring the noise and removing the scene-wide shift raised pixel recall from 0.06 to 0.26, with precision going from 1.00 to 0.88. The perimeter was never used to set any of it.

### Benefits

- It works when optical satellites can't. Floods and fires come with cloud and smoke, and radar sees through both, day or night.
- It explains itself. Every label comes with the sentence that produced it, so a reader can check the reasoning instead of trusting a color.
- It shows change as events in time. A flood has a first day, a worst day and a day it drained. Timing also separates changes that look alike in one before and after pair, such as a harvest and a flood.
- It is honest about accuracy. The scores against independent maps are published, including the weak ones.
- It is cheap to run. Streaming only the site window means a laptop with a few gigabytes free can process a site.

### Honest limits

- Fire recall is low. Pixel recall on Kaiser Canyon is 0.26 at 0.88 precision. L-band backscatter barely changes over burned grass. Coherence loss from the GUNW interferograms would close much of the gap, and that's a later milestone.
- Harvest recall is probably inflated. Radar also sees crops drying before they are cut, so some "harvest" pixels changed for that reason.
- The Iowa reference is the 2021 Cropland Data Layer. The USDA CropScape service for 2025 timed out on the day of the run, so the pipeline fell back to the 2021 layer on Planetary Computer. Corn and soybeans rotate on the same fields, which keeps the comparison useful but not exact.
- Assam is ambiguous. July rice transplanting floods paddies and looks like new water, which is why most Assam events are labeled crop growth rather than flood. Pixel agreement with Sentinel-1 water is very low, and Sentinel-1 is itself a radar, so it shares some of radar's blind spots. TODO: update this point after the Assam rerun.
- Three sites, and only about five months of NISAR data. Calibrated NISAR data has been public only since mid-June 2026, and the GCOV products used are provisional.
- Rules, not a trained model. A LightGBM classifier waits until there are enough sites for a real held-out set.

### What's next

- Plain-English search over the events table, for questions like "fire scars that are still growing." TODO: if search ships before submission, move this into "How it works" and the demo.
- A 3D view of ground motion from NISAR GUNW interferograms, starting with the Venezuela earthquakes of 24 June 2026.
- Alerts: draw an area, and get told when a new pass shows change there.
- Find more like this: each event already stores its per-pass signature, so a nearest-neighbor search can find places where the ground changed the same way.
- An open labeled dataset of NISAR change events (type, geometry, timing, source passes) and the labeling code, published on Hugging Face.
- More sites, then a trained classifier scored on a held-out set.

### Tools, languages and software

Pipeline (Python, run with `uv`):

- Data access: `asf_search`, `earthaccess` with an `fsspec` HTTPS session, `pystac-client` and `planetary-computer`, `requests`
- Raster work: `h5py`, `numpy`, `scipy`, `xarray`, `rioxarray`, `rasterio`, `pyproj`, `shapely`, `geopandas`, `pillow`
- Segmentation: `scikit-image`
- Captions: the `anthropic` Python SDK with `pydantic` for the output schema
- Storage: Supabase Postgres with PostGIS and pgvector (`psycopg`). Without a database the app reads the pipeline's JSON output directly.
- Tests: `pytest`

App (TypeScript):

- Next.js 16 and React 19
- MapLibre GL with the CARTO Positron basemap
- rough.js and the Excalidraw Virgil font for the hand-drawn diagrams
- Geist type, Lucide icons, `zod`

Hardware: one laptop. The pipeline runs locally, with no cloud compute.

## Project details (final, unslopped; paste this one)

What does it do, and how does it work?

Distill turns radar from NASA and ISRO's NISAR satellite into a map of how Earth's surface changed in 2026. It explains each change in plain words. Try it at https://distill-khaki.vercel.app.

- Watch change happen. Pick a place and press play. Changes appear pass by pass over the real radar image, colored by type: fire scar, flood, harvest, crop growth or deforestation.
- Click any change to see why. The panel shows when it started, when it peaked, whether it is still growing, its area, a confidence score, and the reason for its label, such as "the canopy is gone and the patch grew over five passes."
- Ask questions with ⌘K. Type "which fires are still growing?" Claude calls tools that query our events database. Each tool call appears with its result and how long it took, then the answer and the matching changes.
- Find similar changes. Pick any change and Distill lists the changes, at any site, where the radar signal moved the same way over time.
- Watch an area. Draw a box, or start from a change, and replay past passes to see which ones would have raised an alert. A daily job checks NASA's archive for new NISAR passes over each watched area.
- See ground motion in 3D. The 3D view drapes ground motion from five 2026 earthquakes over terrain: two in Venezuela, Kumamoto in Japan, the Flores Sea in Indonesia, and Panama, where the ground moved up to about 1.45 m.

How it works:

- Streaming. Each NISAR file is about 7 GB. We read only the part that covers a site, straight from NASA's ASF archive.
- Events across time. We stack every pass for a site into one block of place and time. A fire becomes a single event with a start, a peak and an end, instead of a series of before-and-after differences.
- Measured noise. We correct each pass for rain and drying across the whole scene. Then we flag only change larger than the noise we measured in the passes before each event.
- Readable rules. Rules label each change from how the radar's two polarizations moved, the land cover underneath and the timing. Claude writes a short caption from the same numbers.
- Scoring. We compare every label with an independent map: Copernicus and NIFC fire perimeters, USDA crop maps, INPE deforestation alerts from Brazil, and Sentinel-1 water maps.

Distill covers seven radar sites on four continents:

- Wildfires in Washington (Kaiser Canyon), Spain (Huelva, Gredos) and Greece (Viotia).
- The harvest in central Iowa.
- The monsoon season in Upper Assam, India.
- Forest clearing in the Brazilian Amazon.

That is 1,410 changes across 75 radar passes, plus the five earthquakes in 3D.

What benefits does it have?

- Radar works through clouds, smoke and darkness. Optical satellites lose sight of the ground during floods, fires and monsoons, which is when people most need to see it.
- You do not need to know anything about radar. Distill explains every change in plain words, and you can ask questions in plain English.
- Every label shows its reason and confidence. We publish all of our accuracy scores, including the low ones.
- The heavy processing runs once per site, so the map loads in seconds. Every view has its own link to share.
- We released every labeled event as an open dataset on Hugging Face: https://huggingface.co/datasets/amanibobo/nisar-surface-change-2026

What is the intended impact?

Disaster responders, farmers, insurers, journalists and students should be able to see what changed on the ground within days of a satellite pass, without training in remote sensing.

NISAR's data is open but only months old, and few people can read radar imagery. Distill is a first version of a tool that lets them.

Our open dataset has 1,410 labeled events, with their footprints at each pass, their radar signatures and their accuracy scores. We believe it is the first open dataset of change events from NISAR, and researchers can use it to train and test their own methods.

What tools, coding languages, hardware or software did you use?

- Languages: Python and TypeScript.
- NASA data: NISAR L2 GCOV (radar backscatter) and GUNW (ground motion), from NASA's ASF DAAC through Earthdata.
- Other data:
  - ESA WorldCover.
  - Copernicus Emergency Management Service burned-area maps.
  - Copernicus Sentinel-1, through Microsoft Planetary Computer.
  - Copernicus GLO-30 elevation.
  - NIFC fire perimeters.
  - USDA Cropland Data Layer.
  - INPE DETER deforestation alerts.
  - USGS earthquake catalog.
- Processing: asf_search, earthaccess, h5py, xarray, NumPy, SciPy, scikit-image, rasterio, Shapely and GeoPandas.
- App: Next.js, React, MapLibre GL, react-three-fiber, and Supabase Postgres with PostGIS and pgvector, hosted on Vercel.
- AI: the Claude API, which writes event captions and answers search questions.
- Hardware: one laptop with under 3 GB of free disk, which is why we stream data instead of downloading it.
- Code: https://github.com/amanibobo/distill (MIT license).

How is the project creative?

- Change as events in space and time. Most radar tools compare two dates. We treat the whole time series as one block, so each change has a lifecycle you can play back, and search can use time, such as "still growing" or "since August."
- Labels with reasons. Each label comes with the physical reason behind it, written for someone who has never used radar data.
- Visible search steps. Claude answers by querying the data with tools, and the palette shows every query and its result as it runs.
- Similarity by behavior. Find similar compares how the radar signal changed over time, so it can match a burn in Washington with one in Greece without anyone naming the pattern first.
- Published accuracy. The app, the writeup and the dataset all show how each site scores against its reference map.

What factors did the team consider?

- Accuracy, reported in full.
  - Where fires burned forest and shrubland, Distill matches the reference well. At the Huelva wildfire in Spain, precision is 0.81 and recall is 0.92 against the official Copernicus burned-area map.
  - L-band radar barely changes over burned grass, so at Kaiser Canyon we find about a quarter of the burn, with precision 0.88.
  - In Assam, paddies flooded for planting look like floods to radar, so we detect only about 5% of the flooded area there.
  - We wrote two labeling rules after looking at their own site's reference map, and we say so wherever we show those scores.
- Constraints. The laptop had under 3 GB of free disk, and NISAR passes over each site every 12 days. So we stream the data and reason over the time series.
- Accessibility. The app uses plain language and has keyboard shortcuts, light and dark modes, and a guided tour. We checked the colors for color blindness and name every change type in text.
- AI use. Claude writes captions and answers questions only from numbers the pipeline computed. It never decides what changed. We disclose where we used AI in the app, the dataset and the code.

## Use of Super Intelligence (SI)

(Form field: Use of Super Intelligence (SI). Space Apps says this answer is for data collection and is not shown to judges, but SI use in code and data must also be acknowledged in the project itself.)

Yes, in two ways.

1. At run time, Claude (Anthropic, model `claude-opus-5-5`) writes the title and short summary for each change event. It receives only numbers the pipeline computed: the rule and its reason, the dates, the area and the land cover. It is told not to invent causes or casualties, and its output is constrained to a typed schema. Claude does not detect change, choose labels, or produce any accuracy number. The writeup page says that Claude writes these captions.
2. During development, an AI coding assistant (Claude Code) helped write the pipeline and app code and drafted documentation, including this text. The team chose the challenge, the approach, the sites and the references, and reviewed the results. All accuracy numbers are generated by the pipeline from public reference data.

TODO: confirm that no images, video or audio in the project are AI-generated, and that nothing AI-generated uses NASA branding (the form forbids it). If any image is AI-generated, it needs a visible watermark.

TODO: Space Apps asks that SI-generated data be acknowledged "in descriptive text and metadata." The event records have no field saying the title and summary came from Claude. Consider adding a caption source field to the exported events, and a one-line note in the map's change panel such as "Summary written by Claude from the numbers above."

## NASA data

(Form field: NASA Data.)

NISAR L2 GCOV (geocoded polarimetric covariance, L-band, frequency A, HH and HV), provisional release, from the Alaska Satellite Facility DAAC. Found with `asf_search` (dataset NISAR, processing level GCOV) and streamed over HTTPS with NASA Earthdata login. NISAR is a joint NASA and ISRO mission. Only provisional ("PR") products were used. One track per site keeps the viewing geometry the same across passes.

| Site | Track | Passes | Dates | Area (lon, lat) |
| --- | --- | --- | --- | --- |
| Upper Assam floods | 040 ascending | 12 | 16 Jun to 7 Nov 2026 | 94.2 to 95.0, 26.6 to 27.5 |
| Kaiser Canyon Fire | 071 descending | 10 | 19 Jun to 17 Oct 2026 | -119.45 to -118.65, 48.0 to 48.42 |
| Central Iowa harvest | 004 ascending | 11 found on ASF, 9 in the current run | 26 Jun to 24 Oct 2026 | -94.0 to -93.2, 41.85 to 42.2 |

TODO: decisions.md lists 11 Iowa passes, but the current run and `accuracy.md` use 9. Check whether two passes were dropped on purpose and say why, or rerun.

Also used:

- NASA Earthdata login, for authenticated streaming from ASF.
- The NISAR Data User Guide from ASF, for the GCOV file layout.
- NASA Earthdata SAR basics, for the HH and HV interpretation.

## Space agency partner data and other references

(Form field: Space Agency Partner Data and Other References. The form asks for all data, resources, code, text and images used.)

Space agency partner data:

- ISRO: co-builder of NISAR. The GCOV data above is a joint NASA and ISRO product.
- ESA WorldCover 10 m 2021 v200, for land cover under each event. Read directly from ESA's public bucket. Attribution: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.
- Copernicus Sentinel-1 RTC (ESA and the European Union), radiometrically terrain corrected VV backscatter, from Microsoft Planetary Computer. Used as the flood reference for Upper Assam on 16 June, 22 July and 15 August 2026. Contains modified Copernicus Sentinel data 2026.

Other data:

- NIFC WFIGS Interagency Fire Perimeters, final perimeter of the Kaiser Canyon Fire, as the fire reference.
- USDA NASS Cropland Data Layer, corn and soybean classes, as the harvest reference. The 2025 layer via CropScape was tried first. The run used the 2021 layer from Microsoft Planetary Computer because CropScape timed out.
- Basemap: CARTO Positron style, with OpenStreetMap data (© OpenStreetMap contributors, © CARTO).

Code, fonts and tools: listed under "Tools, languages and software" above, with links in References.

## References

Challenge and rules

- Dancing with the SARs challenge: https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/
- Project Submission Guide: https://www.spaceappschallenge.org/resources/project-submission-guide/
- Judging and Awards Guide: https://www.spaceappschallenge.org/resources/judging-awards-guide/

NASA and NISAR

- NISAR Data User Guide (ASF): https://nisar-docs.asf.alaska.edu/
- ASF Vertex search: https://search.asf.alaska.edu/
- NASA Earthdata Search: https://search.earthdata.nasa.gov/search
- NASA Earthdata, what is SAR: https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/sar
- NISAR mission (JPL): https://nisar.jpl.nasa.gov/
- asf_search: https://github.com/asfadmin/Discovery-asf_search
- earthaccess: https://github.com/nsidc/earthaccess

Partner and reference data

- ESA WorldCover: https://esa-worldcover.org/
- Sentinel-1 RTC on Microsoft Planetary Computer: https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc
- USDA CDL on Microsoft Planetary Computer: https://planetarycomputer.microsoft.com/dataset/usda-cdl
- USDA NASS CropScape: https://nassgeodata.gmu.edu/CropScape/
- NIFC open data (WFIGS Interagency Fire Perimeters): https://data-nifc.opendata.arcgis.com/
- CARTO basemap styles: https://github.com/CartoDB/basemap-styles
- OpenStreetMap copyright: https://www.openstreetmap.org/copyright

Site research

- JalDrishti (Assam flood context): https://github.com/nayanip2001-max/JalDrishti
- Copernicus Emergency Management Service: https://emergency.copernicus.eu/
- TODO: add links to the NIFC and Watch Duty or IQAir reports used for the Kaiser Canyon Fire dates and acreage.

App libraries

- Next.js: https://nextjs.org/
- MapLibre GL JS: https://maplibre.org/
- rough.js: https://roughjs.com/
- Virgil font (Excalidraw): https://github.com/excalidraw/virgil
- Geist font: https://vercel.com/font
- Lucide icons: https://lucide.dev/
- Claude (Anthropic): https://www.anthropic.com/claude

Project

- Code: https://github.com/amanibobo/distill (TODO: confirm the repo is public and add a license)
- Live app: TODO, add the public URL. The demo and final project links must open with no login.

## Demo video

The official demo limit is 30 seconds. The Project Submission Guide says the demo is either a video of 30 seconds or less or a deck of up to seven slides, and that "projects that exceed these limits will not be eligible for Global Judging." So the "Link to Project Demo" must point to the 30-second cut below.

The longer walkthrough (2:30 to 3:00) is written below as requested. Don't use it as the demo link. If the team wants judges to see it, link it from the final project page or the README. TODO: decide whether to publish it at all, and confirm with the local lead if unsure.

Rules for both videos: English voice-over (or English subtitles), no images or voices of anyone under 18, public link with no login.

### 30-second demo (for the "Link to Project Demo" field)

Follows the order the guide suggests.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00 to 0:03 | Landing page, wordmark | "I'm TODO name, from team TODO." |
| 0:03 to 0:07 | Landing page lede | "Our challenge is Dancing with the SARs. Radar sees the ground through clouds and at night." |
| 0:07 to 0:11 | Open the map, pick Kaiser Canyon Fire | "This is Distill. It turns NISAR radar into a map of change that explains itself." |
| 0:11 to 0:21 | Press play. The burn grows pass by pass. Click it. The panel shows confidence, the charts and "Why Distill labeled it this way." | "It stacks every NISAR pass into a cube of place and time, finds each change as an event, and tells you in plain words why it called it a fire scar." |
| 0:21 to 0:30 | Writeup accuracy table | "We check every label against independent maps. Checked against the official fire perimeter, 97 of 108 events got the right label. Next: search, 3D ground motion and alerts, for more places." |

### Full walkthrough, about 2:50

Timed beats. Read the voice-over slowly. Times assume search is shown. If search isn't ready, cut that beat and the video runs about 2:30.

1. Hook, 0:00 to 0:15

   On screen: start on the landing page, scrolled to the top. Hold on the lede. Slowly scroll to "what it does" so the highlights draw in.

   Voice-over: "When a river floods or a forest burns, the sky is usually full of cloud or smoke. A normal camera in orbit sees the top of that cloud. Radar sees the ground underneath, day or night."

2. The problem, 0:15 to 0:30

   On screen: keep scrolling the landing page past "Distill reads that static for you."

   Voice-over: "Since June, NISAR, the joint NASA and ISRO radar satellite, has been imaging the planet. But to almost everyone, radar images look like static. Distill reads that static for you."

3. The map, 0:30 to 0:50

   On screen: click "Open the map." The map opens framing all sites. The rail shows "Where the ground changed" and the site list with change and pass counts. Press the number key for Kaiser Canyon Fire. The toast flashes the number and the map flies there.

   Voice-over: "Each site is a real NISAR track, streamed straight from NASA's archive. I'll pick the Kaiser Canyon Fire in Washington. Number keys jump between sites."

   TODO: check the site order on the day. Assam is being rerun and may change the numbering.

4. Passes over time, 0:50 to 1:15

   On screen: point at the toolbar ("Kaiser Canyon Fire / date / pass 1 of 10"). Press play on the timeline. Shapes grow and fade as passes advance, and the activity strip marks which passes had the most change. Pause. Press the left and right arrow keys, and the toast shows the arrows. Click Radar to show the grayscale NISAR image under the shapes, then click it off.

   Voice-over: "The timeline has one mark for every pass. Press play and you watch change happen. The strip shows how much ground was changing on each pass. Arrow keys step one pass at a time. And this is the radar image itself, under the shapes."

5. One event, explained, 1:15 to 1:50

   On screen: in the change list, click the largest fire scar. The inspector opens: type, title, confidence meter, summary, peak area, status, first seen. Hover the area-over-time chart, then the radar signature chart with HH and HV. Click a point on a chart to jump the map to that pass. Scroll to "Why Distill labeled it this way" and hold on the sentence.

   Voice-over: "Click any change and Distill tells you what it is, how sure it is, and when it started. This chart is the area, pass by pass. This one is the radar signal itself. And here is the part I care most about: the reason. The rule that labeled this a fire scar, written as a sentence you can check. The summary at the top is written by Claude, from these same numbers."

6. Search, 1:50 to 2:10 (if search is ready)

   On screen: type a plain-English question into search, for example "fire scars that kept growing" or "harvest in Iowa after September." Show the parsed filter and the results list. Click a result and the map flies there.

   Voice-over: "You can also just ask. Distill turns a question into a filter on type, place and time, and takes you to the matches."

   TODO: use a query that the finished search handles well, and match the on-screen words to the real UI.

7. How it works, 2:10 to 2:35

   On screen: open Writeup. Scroll past the pipeline diagram, the cube diagram, and the fire signal sketch. Stop on the accuracy table.

   Voice-over: "Under the hood, Distill never downloads a whole radar file. It reads only the part over each site, stacks every pass into a cube of place and time, and finds change as events with a start, a peak and an end. Then we check every label against maps it never saw: fire perimeters, crop surveys and another satellite's water maps."

8. Close, 2:35 to 2:50

   On screen: hold on the Kaiser Canyon row of the accuracy table, then cut to the landing page wordmark.

   Voice-over: "Checked against the official fire perimeter, 97 of 108 events got the right label. Distill still finds only about a quarter of the burned ground, and we say so. Distill turns NISAR radar into a map of how Earth's surface is changing, and explains every change in plain words."

## Form fields found

From the 2026 Project Submission Guide (https://www.spaceappschallenge.org/resources/project-submission-guide/, dated 13 November 2026):

- Project Name
- High-Level Project Summary
- Link to Project Demo (video of 30 seconds or less, or up to 7 slides)
- Link to Final Project
- Detailed Project Description
- Use of Super Intelligence (SI)
- NASA Data
- Space Agency Partner Data and Other References
- Two checkboxes before "Submit for Judging": the Terms and Conditions, and "Confirm All Work is Original"

Other rules from the same guide and the Judging and Awards Guide (https://www.spaceappschallenge.org/resources/judging-awards-guide/):

- Submission closes Sunday 15 November 2026 at 11:59 p.m. local event time.
- Everything must be in English. A video can use another language only with English subtitles.
- Videos and documents can't be uploaded. Link them publicly with no login. Images up to 10 MB can be uploaded.
- No likeness of anyone under 18.
- At least one NASA data source or resource is required for a Global Award.
- Judging criteria: Impact, Creativity, Validity, Relevance and Presentation.

The guide sets no word limit for the summary. The 150-word cap here is our own.

## Form links (verified 200 on 2026-11-15)

### NASA Data

| Link Text | Link Url |
|---|---|
| NISAR mission (NASA JPL) | https://nisar.jpl.nasa.gov/ |
| NISAR data on NASA Earthdata | https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/nisar |
| NISAR L2 GCOV radar backscatter product (ASF DAAC) | https://nisar-docs.asf.alaska.edu/gcov/ |
| NISAR L2 GUNW unwrapped interferogram product (ASF DAAC) | https://nisar-docs.asf.alaska.edu/gunw/ |
| NISAR provisional product known issues (ASF DAAC) | https://nisar-docs.asf.alaska.edu/provisional-known-issues/ |
| ASF Data Search (Vertex) | https://search.asf.alaska.edu/ |
| asf_search Python library (ASF) | https://docs.asf.alaska.edu/asf_search/basics/ |
| NASA Earthdata Login | https://urs.earthdata.nasa.gov/ |
| earthaccess library (NASA NSIDC DAAC) | https://github.com/nsidc/earthaccess |

### Space Agency Partner & Other Data

| Link Text | Link Url |
|---|---|
| ESA WorldCover land cover | https://esa-worldcover.org/en |
| Copernicus EMS EMSR913, Huelva wildfire burned area | https://mapping.emergency.copernicus.eu/activations/EMSR913/ |
| Copernicus EMS EMSR909, Viotia wildfire burned area | https://mapping.emergency.copernicus.eu/activations/EMSR909/ |
| Copernicus EMS EMSR900, Central Spain wildfires burned area | https://mapping.emergency.copernicus.eu/activations/EMSR900/ |
| Copernicus Sentinel-1 RTC (Microsoft Planetary Computer) | https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc |
| Copernicus Sentinel-2 L2A (Microsoft Planetary Computer) | https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a |
| Copernicus DEM GLO-30 | https://registry.opendata.aws/copernicus-dem/ |
| USDA Cropland Data Layer (Microsoft Planetary Computer) | https://planetarycomputer.microsoft.com/dataset/usda-cdl |
| NIFC WFIGS interagency fire perimeters | https://data-nifc.opendata.arcgis.com/ |
| INPE DETER deforestation alerts (TerraBrasilis) | https://terrabrasilis.dpi.inpe.br/ |
| USGS Earthquake Catalog | https://earthquake.usgs.gov/earthquakes/search/ |
| CARTO basemaps | https://carto.com/basemaps |
| OpenStreetMap map data | https://www.openstreetmap.org/copyright |
| Anthropic Claude API | https://docs.anthropic.com/ |
| Next.js | https://nextjs.org/ |
| MapLibre GL JS | https://maplibre.org/ |
| react-three-fiber | https://github.com/pmndrs/react-three-fiber |
| Supabase Postgres | https://supabase.com/ |
| PostGIS | https://postgis.net/ |
| pgvector | https://github.com/pgvector/pgvector |
| Vercel hosting | https://vercel.com/ |
| Rough.js hand-drawn diagrams | https://roughjs.com/ |
| Virgil font (Excalidraw) | https://github.com/excalidraw/virgil |
| Lucide icons | https://lucide.dev/ |
| Geist font | https://vercel.com/font |
| Simple Icons (Hugging Face logo) | https://simpleicons.org/ |
| Distill source code (our project) | https://github.com/amanibobo/distill |
| Distill open dataset of NISAR change events (our project) | https://huggingface.co/datasets/amanibobo/nisar-surface-change-2026 |
