import { ArrowRight, BellRing, Map as MapIcon, Mountain, Search } from "lucide-react";
import Link from "next/link";
import { Highlights } from "@/components/highlights";
import { Ink, Label, Mark } from "@/components/prose";
import accuracy from "@/data/accuracy.json";
import { LandingKeys } from "./landing-keys";

type SiteReport = { site: { id: string; name: string }; passes: number; events: number; types: Record<string, number> };

const ACTIONS = [
  { href: "/map", Icon: MapIcon, label: "Explore the change map", note: "Step through every pass and see what changed, where and why", key: "M" },
  { href: "/map", Icon: Search, label: "Ask in plain English", note: "Where did farmland flood since August?", key: "/" },
  { href: "/watch", Icon: BellRing, label: "Watch an area", note: "Draw a box and get an alert when a pass shows change", key: "W" },
  { href: "/explore", Icon: Mountain, label: "See the ground move in 3D", note: "Radar interferometry draped over terrain", key: "E" },
] as const;

export default function Home() {
  const sites = accuracy as SiteReport[];
  const events = sites.reduce((n, s) => n + s.events, 0);
  const passes = sites.reduce((n, s) => n + s.passes, 0);

  return (
    <>
      <LandingKeys />
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title" className="hero-title">
          Radar sees Earth through clouds and darkness. Distill makes it readable.
        </h1>
        <p className="hero-sub">
          A map of how the ground is changing, built from NASA and ISRO&rsquo;s NISAR satellite. Every change has a start, a peak
          and a reason in plain words.
        </p>
        <div className="hero-actions">
          <Link href="/map" className="button button-primary">
            Open the map
            <ArrowRight aria-hidden />
          </Link>
          <Link href="/writeup" className="button">
            How it works
          </Link>
        </div>
      </section>

      <dl className="facts" aria-label="What is in Distill today">
        <div>
          <dt>Places</dt>
          <dd>{sites.length}</dd>
        </div>
        <div>
          <dt>Changes found</dt>
          <dd>{events.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt>Radar passes read</dt>
          <dd>{passes}</dd>
        </div>
        <div>
          <dt>Data window, 2026</dt>
          <dd>Jun to Nov</dd>
        </div>
      </dl>

      <section className="block" aria-labelledby="do">
        <h2 id="do" className="block-title">
          What you can do
        </h2>
        <p className="block-desc">Four ways in, all running on real NISAR passes.</p>
        <ul className="actions">
          {ACTIONS.map(({ href, Icon, label, note, key }) => (
            <li key={label}>
              <Link href={href} className="action">
                <Icon aria-hidden />
                <span className="action-text">
                  <span>{label}</span>
                  <span className="action-note">{note}</span>
                </span>
                <kbd className="keycap">{key}</kbd>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="block prose" aria-labelledby="why">
        <Label id="why">why it exists</Label>
        <Highlights>
          <p>
            Since June, NISAR has passed over most of the planet every twelve days. Its radar sees the ground through cloud,
            smoke and night. To almost everyone, its images look like static.
          </p>
          <p>
            Distill reads that static for you. It stacks every pass into one block of place and time, so change shows up as{" "}
            <Mark tone="blue">events with a beginning, a peak and an end</Mark>. A flood has a first day, a worst day and a day it
            drained.
          </p>
          <p>
            Each event gets a type, a confidence and <Mark tone="blue">a reason you can check</Mark>. We score ourselves against{" "}
            <Ink tone="red">independent maps</Ink> of fires, crops and water, and{" "}
            <Mark tone="red">publish the numbers, good or bad</Mark>.
          </p>
        </Highlights>
      </section>
    </>
  );
}
