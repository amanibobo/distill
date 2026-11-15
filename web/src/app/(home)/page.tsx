import { ArrowRight, ArrowUpRight, BellRing, BookOpen, Code2, Map as MapIcon, Mountain } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { RadarCompare } from "@/components/radar-compare";
import { Highlights } from "@/components/highlights";
import { LogoMark } from "@/components/logo";
import accuracy from "@/data/accuracy.json";

type SiteReport = { events: number; passes: number };

const LINKS = [
  { href: "/map", Icon: MapIcon, label: "Change map", meta: "every pass, every change" },
  { href: "/watch", Icon: BellRing, label: "Watch an area", meta: "alerts as passes arrive" },
  { href: "/explore", Icon: Mountain, label: "Ground motion in 3D", meta: "radar interferometry" },
  { href: "/writeup", Icon: BookOpen, label: "Writeup", meta: "how it works, with scores" },
  { href: "https://github.com/amanibobo/distill", Icon: Code2, label: "GitHub", meta: "amanibobo/distill", external: true },
] as const;

export default function Home() {
  const sites = accuracy as SiteReport[];
  const events = sites.reduce((n, s) => n + s.events, 0);
  const passes = sites.reduce((n, s) => n + s.passes, 0);

  return (
    <>
      <header className="hero">
        <div className="hero-glow" aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <b />
          <b />
        </div>
        <nav className="hero-bar" aria-label="Site">
          <span className="hero-bar-name">
            <LogoMark className="hero-bar-mark" />
            Distill
          </span>
          <span className="sitenav">
            <Link href="/map">map</Link>
            <Link href="/watch">watch</Link>
            <Link href="/explore">explore</Link>
            <Link href="/writeup">writeup</Link>
          </span>
        </nav>

        <div className="hero-copy">
          <h1 className="hero-title">
            <span>Radar sees the ground through clouds.</span>
            <span>
              Distill makes it <em>readable.</em>
            </span>
          </h1>
          <p className="hero-lede">
            NISAR passes over most of Earth every twelve days. Distill turns its radar into a map of change you can search, explain
            and watch, with a start, a peak and a reason for every event.
          </p>
          <div className="hero-cta">
            <Link className="hero-btn hero-btn-solid" href="/map">
              Open the map
              <ArrowRight aria-hidden />
            </Link>
            <Link className="hero-btn hero-btn-soft" href="/writeup">
              How it works
            </Link>
          </div>
          <p className="hero-note">
            NASA–ISRO NISAR · {sites.length} places · {events.toLocaleString("en-US")} changes · {passes} passes
          </p>
        </div>

        <div className="hero-stage">
          <RadarCompare site="assam" />
        </div>
      </header>

      <div className="page">
        <main className="after-hero">
          <section className="shot" aria-labelledby="the-map">
            <h2 id="the-map">the map</h2>
            <Image
              className="hero-shot"
              src="/landing/map-kaiser.jpg"
              width={2880}
              height={1720}
              sizes="(min-width: 1120px) 1040px, 100vw"
              alt="The Distill map over the Kaiser Canyon Fire on September 23, 2026: burn scars outlined in orange over the radar image, a list of changes on the left, and the selected burn's details and area chart on the right."
            />
          </section>
          <div className="grid">
            <section aria-labelledby="how">
              <h2 id="how">how it works</h2>
              <Highlights className="prose">
                <p>
                  Radar sees the ground through cloud, smoke and darkness, but to almost everyone its images look like static. A
                  flood under monsoon cloud, or a fire under its own smoke, is invisible to the cameras most maps use.
                </p>
                <p>
                  Distill streams only the part of each NISAR file it needs and stacks every pass into one block of place and time.
                  Change shows up as <mark className="hl hl-blue">events with a beginning, a peak and an end</mark>, so a burn scar
                  can be watched growing, pass by pass.
                </p>
                <p>
                  Each event gets a type from rules a person can check, and <mark className="hl hl-blue">a reason in plain words</mark>
                  . Claude writes the short caption from the same numbers.
                </p>
                <p>
                  We score the labels against <span className="t-red">independent maps</span> of fire perimeters, crop fields and
                  Sentinel-1 water, and <mark className="hl hl-red">publish the numbers, good or bad</mark>.
                </p>
              </Highlights>
            </section>

            <div className="aside">
              <section aria-labelledby="links">
                <h2 id="links">links</h2>
                <ul className="links">
                  {LINKS.map(({ href, Icon, label, meta, ...rest }) => {
                    const external = "external" in rest;
                    const inner = (
                      <>
                        <Icon className="icon" aria-hidden />
                        <span className="label">{label}</span>
                        <span className="meta">{meta}</span>
                        <ArrowUpRight className="arrow" aria-hidden />
                      </>
                    );
                    return (
                      <li key={label}>
                        {external ? (
                          <a href={href} target="_blank" rel="noopener">
                            {inner}
                          </a>
                        ) : (
                          <Link href={href}>{inner}</Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section aria-labelledby="team">
                <h2 id="team">team</h2>
                <ul className="links">
                  <li>
                    <a href="https://www.amanibobo.dev" target="_blank" rel="noopener">
                      <span className="label">Amani Bobo</span>
                      <span className="meta">amanibobo.dev</span>
                      <ArrowUpRight className="arrow" aria-hidden />
                    </a>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </main>

        <footer>
          <span>Distill, 2026</span>
          <span>Built for NASA Space Apps 2026</span>
        </footer>
      </div>
    </>
  );
}
