import { Highlights } from "@/components/highlights";
import { Ink, Label, Mark, Mono } from "@/components/prose";

export default function Home() {
  return (
    <>
      <p className="lede">
        A map of how Earth&rsquo;s surface is changing, read from NISAR radar. It sees through clouds and at night, and it explains
        every change in plain words.
      </p>

      <section aria-labelledby="what">
        <Label id="what">what it does</Label>
        <Highlights>
          <p>
            Radar sees the ground through cloud, smoke and darkness. Since June, NISAR, the joint NASA and ISRO satellite, has
            passed over most of the planet every twelve days. To almost everyone, its images look like static.
          </p>
          <p>
            Distill reads that static for you. It stacks every pass into one block of place and time and finds change as{" "}
            <Mark tone="blue">events with a beginning, a peak and an end</Mark>, so a flood has a first day, a worst day and a day it
            drained.
          </p>
          <p>
            Each event gets a type, a confidence and <Mark tone="green">a reason in plain words</Mark>. Click a burn scar in
            Washington and it tells you the forest canopy is gone and the patch kept growing for weeks.
          </p>
          <p>
            We check ourselves against <Ink tone="orange">independent maps</Ink>: fire perimeters, crop surveys and another
            satellite&rsquo;s water maps. <Mark tone="orange">The scores are published, good or bad.</Mark>
          </p>
          <p>
            The first version covers three places: the Upper Assam floods, the Kaiser Canyon Fire and the harvest in central Iowa.
            Plain-English search, a 3D view of ground motion and alerts for an area you care about come next.
          </p>
        </Highlights>
      </section>

      <section aria-labelledby="how">
        <Label id="how">how to use it</Label>
        <p>
          Open the map and pick a place. Press play, or use <Mono>←</Mono> and <Mono>→</Mono>, to step through the passes. Click any
          colored shape to see what changed, when, and why Distill thinks so. Every view has its own link, so you can send exactly
          what you are looking at.
        </p>
      </section>
    </>
  );
}
