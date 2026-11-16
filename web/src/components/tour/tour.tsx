"use client";

import { ArrowRight, ChevronDown, Circle, CircleCheck, Compass, Play, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { openCommandPalette } from "@/components/command/command-palette";
import { STEPS, poster, video, type Step } from "./steps";
import { tour, useReducedMotion, useTour } from "./store";
import styles from "./tour.module.css";

export function TourButton({ className }: { className?: string }) {
  const { open } = useTour();
  return (
    <button type="button" className={`${styles.button} ${className ?? ""}`} aria-expanded={open} onClick={open ? tour.close : tour.open}>
      <Compass className={styles.icon} aria-hidden />
      Take a tour
    </button>
  );
}

function Demo({ step }: { step: Step }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  if (!reduced) {
    return <video key={step.id} className={styles.video} src={video(step.id)} poster={poster(step.id)} autoPlay muted loop playsInline preload="auto" aria-label={`Demo: ${step.title}`} />;
  }
  return (
    <div className={styles.demo}>
      <video
        key={step.id}
        ref={ref}
        className={styles.video}
        src={video(step.id)}
        poster={poster(step.id)}
        muted
        loop
        playsInline
        preload="none"
        aria-label={`Demo: ${step.title}`}
        onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
      />
      {!started && (
        <button
          type="button"
          className={styles.playDemo}
          onClick={() => {
            setStarted(true);
            ref.current?.play().catch(() => setStarted(false));
          }}
          aria-label="Play demo"
        >
          <Play aria-hidden />
        </button>
      )}
    </div>
  );
}

type Props = {
  // Defaults to a full load for same-page jumps, because the map reads its URL only on mount.
  // Pass a soft navigation once the map follows URL changes.
  navigate?: (href: string) => void;
};

export function Tour({ navigate }: Props) {
  const { open, done, expanded } = useTour();
  const router = useRouter();

  useEffect(() => tour.openIfFirstVisit(), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      tour.close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;

  const go = (step: Step) => {
    tour.complete(step.id);
    if ("command" in step.action) {
      requestAnimationFrame(openCommandPalette);
      return;
    }
    const { href } = step.action;
    const target = new URL(href, window.location.href);
    if (navigate) navigate(href);
    else if (target.pathname === window.location.pathname) window.location.assign(target.href);
    else router.push(href);
  };

  const count = done.length;
  const finished = count === STEPS.length;

  return (
    <section className={styles.card} role="dialog" aria-modal="false" aria-labelledby="tour-title">
      <header className={styles.head}>
        <div>
          <h2 id="tour-title" className={styles.title}>
            {finished ? "You have seen it all" : "Get started with Distill"}
          </h2>
          <p className={styles.count}>
            {count} of {STEPS.length} done
          </p>
        </div>
        <button type="button" className={styles.close} onClick={tour.close} aria-label="Close tour" title="Close (Esc)">
          <X aria-hidden />
        </button>
      </header>
      <div className={styles.progress} role="progressbar" aria-label="Tour progress" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={count}>
        <span style={{ width: `${(count / STEPS.length) * 100}%` }} />
      </div>

      <ol className={styles.steps}>
        {STEPS.map((step) => {
          const isDone = done.includes(step.id);
          const isOpen = expanded === step.id;
          return (
            <li key={step.id} className={styles.step} data-open={isOpen || undefined}>
              <button type="button" className={styles.row} aria-expanded={isOpen} aria-controls={`tour-${step.id}`} onClick={() => tour.toggle(step.id)}>
                {isDone ? <CircleCheck className={styles.check} data-done aria-label="Done" /> : <Circle className={styles.check} aria-hidden />}
                <span className={styles.rowLabel} data-done={isDone || undefined}>
                  {step.title}
                  {"keys" in step && (
                    <span className={styles.keys} aria-label={step.keys.join(" ")}>
                      {step.keys.map((k) => (
                        <kbd key={k} className={styles.cap} aria-hidden>
                          {k}
                        </kbd>
                      ))}
                    </span>
                  )}
                </span>
                <ChevronDown className={styles.chevron} aria-hidden />
              </button>
              {isOpen && (
                <div id={`tour-${step.id}`} className={styles.panel}>
                  <Demo step={step} />
                  <p className={styles.copy}>{step.copy}</p>
                  <button type="button" className={styles.try} onClick={() => go(step)}>
                    Try it
                    <ArrowRight aria-hidden />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <footer className={styles.foot}>
        {finished ? (
          <button type="button" className={styles.link} onClick={tour.restart}>
            Start over
          </button>
        ) : (
          <button type="button" className={styles.link} onClick={tour.skip}>
            Skip tour
          </button>
        )}
      </footer>
    </section>
  );
}
