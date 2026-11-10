import type { Metadata } from "next";
import Link from "next/link";
import { Highlights } from "@/components/highlights";
import { Label, Mark } from "@/components/prose";

export const metadata: Metadata = { title: "Process · Distill" };

const STEPS: { when: string; title: string; body: string }[] = [
  {
    when: "22 Oct",
    title: "Wrote the spec",
    body: "Five layers in one workflow: see, find, understand, explore, watch. The change map is the core, and everything else reads from its table of change regions.",
  },
  {
    when: "9 Nov",
    title: "Cut the first milestone down to the map",
    body: "The pipeline is the biggest risk, so it came first: real NISAR data at three sites, the events table, and the map that shows it. Search, 3D and alerts wait.",
  },
  {
    when: "9 Nov",
    title: "Chose events over snapshots",
    body: "Treating the time series as a cube changed the data model from regions to events with an onset, a peak and a recovery. Every later feature, from search with time built in to find more like this, reads that shape, so it had to be right first.",
  },
  {
    when: "9 Nov",
    title: "Rules before a classifier",
    body: "Three sites can't produce an honest held-out set. Rules a person can read give each label a reason, and scoring them against reference maps starts the accuracy number early.",
  },
  {
    when: "9 Nov",
    title: "Picked sites by searching, then checked them",
    body: "Upper Assam floods in July, the Kaiser Canyon Fire from 16 July, and the central Iowa harvest. ASF had 10 to 12 passes on a single track for each one.",
  },
  {
    when: "10 Nov",
    title: "Streamed instead of downloading",
    body: "Each file is about 7 GB and the laptop had under 3 GB free. The pipeline reads only the HDF5 tiles over each site and caches a 40 m version, a few megabytes per pass.",
  },
  {
    when: "10 Nov",
    title: "Caught a wrong reference",
    body: "I had planned to check Assam against Copernicus activation EMSR935. It turned out to be the October flood in Valencia. Assam has no activation, so it is checked against Sentinel-1 water maps from the same days instead.",
  },
  {
    when: "10 Nov",
    title: "The first fire result was 6%",
    body: "A fixed 3 dB threshold found 6% of the burn. The fire lowers the radar signal by about 1 dB, and one rainy pass lifted the whole scene by 1.5. Measuring the noise and removing the scene-wide shift raised recall to 26% at 88% precision without looking at the answer.",
  },
  {
    when: "10 Nov",
    title: "Worked around a service that was down",
    body: "USDA's crop map service timed out, so Iowa is scored against the 2021 crop map from Planetary Computer. The report says which source it used.",
  },
];

export default function Process() {
  return (
    <>
      <p className="lede">How Distill was built, in order, with the parts that went wrong left in.</p>

      <section aria-labelledby="approach">
        <Label id="approach">approach</Label>
        <Highlights>
          <p>
            Every layer had to run on <Mark tone="green">real NISAR data, never mock-ups</Mark>. That meant building the data
            pipeline before any interface and treating each surprise in the data as a decision to write down.
          </p>
          <p>
            Each choice went into a decisions log as it was made, along with what it replaced.{" "}
            <Mark tone="blue">When a number looked too good or too bad, I explained it before acting on it.</Mark>
          </p>
        </Highlights>
      </section>

      <section aria-labelledby="log">
        <Label id="log">log</Label>
        <ol className="timeline-list">
          {STEPS.map((s) => (
            <li key={s.title}>
              <time>{s.when}</time>
              <div>
                <h3 style={{ margin: 0 }}>{s.title}</h3>
                <p style={{ margin: "4px 0 0" }}>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="next">
        <Label id="next">next</Label>
        <p>
          Plain-English search over the events table, a 3D view of ground motion from the GUNW interferograms starting with the
          Venezuela earthquakes, alerts for a drawn area, find more like this from each event&rsquo;s signature, and the first open
          labeled dataset of NISAR change events. The technical details are in the <Link href="/writeup">writeup</Link>.
        </p>
      </section>
    </>
  );
}
