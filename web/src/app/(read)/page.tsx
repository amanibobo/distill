import { BookOpen, Database, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { Highlights } from "@/components/highlights";
import { Ink, Label, Mark } from "@/components/prose";

export default function Home() {
  return (
    <>
      <p className="lede">
        A map of how Earth&rsquo;s surface is changing, read from NISAR radar. It sees through clouds and at night, and it explains
        every change in plain words.
      </p>

      <section className="links-block" aria-labelledby="links">
        <h2 id="links" className="links-title">
          links
        </h2>
        <ul className="links">
          <li>
            <Link href="/map">
              <MapIcon className="icon icon-stroke" aria-hidden />
              <span className="links-label">Open the map</span>
              <span className="meta">live app</span>
              <svg className="arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden><path d="M3.5 8.5l5-5M4.5 3.5h4v4" /></svg>
            </Link>
          </li>
          <li>
            <a href="https://github.com/amanibobo/distill" target="_blank" rel="noopener">
              <svg className="icon" viewBox="0 0 24 24" aria-hidden><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
              <span className="links-label">GitHub</span>
              <span className="meta">amanibobo/distill</span>
              <svg className="arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden><path d="M3.5 8.5l5-5M4.5 3.5h4v4" /></svg>
            </a>
          </li>
          <li>
            <a href="https://huggingface.co/datasets/amanibobo/nisar-surface-change-2026" target="_blank" rel="noopener">
              <Database className="icon icon-stroke" aria-hidden />
              <span className="links-label">Hugging Face</span>
              <span className="meta">open dataset</span>
              <svg className="arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden><path d="M3.5 8.5l5-5M4.5 3.5h4v4" /></svg>
            </a>
          </li>
          <li>
            <Link href="/writeup">
              <BookOpen className="icon icon-stroke" aria-hidden />
              <span className="links-label">Writeup</span>
              <span className="meta">how it works</span>
              <svg className="arrow" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden><path d="M3.5 8.5l5-5M4.5 3.5h4v4" /></svg>
            </Link>
          </li>
        </ul>
      </section>

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
            It covers real 2026 events so far: the Upper Assam floods, the Kaiser Canyon Fire and the harvest in central Iowa,
            plus ground motion in 3D from five earthquakes in Venezuela, Japan, Indonesia and Panama.
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
