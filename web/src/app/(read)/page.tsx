import { Highlights } from "@/components/highlights";
import { Ink, Label, Mark } from "@/components/prose";

export default function Home() {
  return (
    <>
      <p className="lede">
        A map of how Earth&rsquo;s surface is changing, read from NISAR radar. It sees through clouds and at night, and it explains
        every change in plain words.
      </p>

      <p className="links-row">
        <a href="/map">Open the map</a>
        <span aria-hidden>&middot;</span>
        <a href="https://github.com/amanibobo/distill" target="_blank" rel="noopener">
          Code on GitHub
        </a>
        <span aria-hidden>&middot;</span>
        <a href="https://huggingface.co/datasets/amanibobo/nisar-surface-change-2026" target="_blank" rel="noopener">
          Open dataset on Hugging Face
        </a>
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
            Each event gets a type, a confidence and <Mark tone="blue">a reason in plain words</Mark>. Click a burn scar in
            Washington and it tells you the forest canopy is gone and the patch kept growing for weeks.
          </p>
          <p>
            We check ourselves against <Ink tone="red">independent maps</Ink>: fire perimeters, crop surveys and another
            satellite&rsquo;s water maps. <Mark tone="red">The scores are published, good or bad.</Mark>
          </p>
          <p>
            It covers four real events so far: the Upper Assam floods, the Kaiser Canyon Fire, the harvest in central Iowa and
            the ground motion from the June earthquakes in Venezuela.
          </p>
        </Highlights>
      </section>

      <section aria-labelledby="how">
        <Label id="how">how to use it</Label>
        <p>
          Open the map and pick a place. Press play, or use the arrow keys, to step through the passes. Click any colored shape
          to see what changed, when, and why Distill thinks so, then find changes like it anywhere in the data. Ask questions in
          plain English, draw an area to watch for new change, or see the ground move in 3D. Every view has its own link, so you
          can send exactly what you are looking at.
        </p>
      </section>
    </>
  );
}
