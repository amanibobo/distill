"use client";

import { ChevronsLeftRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { z } from "zod";

// Written by pipeline/distill/see.py. Only the fields the slider shows are read here.
const Side = z.object({ label: z.string(), image: z.string() });
const SeeMeta = z.object({
  width: z.number(),
  height: z.number(),
  caption: z.string(),
  optical: Side,
  radar: Side,
});
type SeeMeta = z.infer<typeof SeeMeta>;

const STEP = 5;
const INTRO_FROM = 70;
const INTRO_TO = 50;
const INTRO_MS = 600;
// Labels shrink a little on phone-width cards so the optical one fits left of the resting divider.
const INSET = "clamp(8px, 2.5cqw, 12px)";

const clamp = (v: number) => Math.min(100, Math.max(0, v));
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function RadarCompare({ site, className }: { site: string; className?: string }) {
  const [meta, setMeta] = useState<SeeMeta | "error" | null>(null);
  const [position, setPosition] = useState(INTRO_FROM);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const touched = useRef(false);

  useEffect(() => {
    let live = true;
    fetch(`/see/${site}/meta.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((json: unknown) => {
        if (!live) return;
        setMeta(SeeMeta.parse(json));
        if (prefersReducedMotion()) setPosition(INTRO_TO);
      })
      .catch(() => live && setMeta("error"));
    return () => {
      live = false;
    };
  }, [site]);

  // Once on view, the handle settles from 70% to 50% so the reader sees it moves.
  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null || prefersReducedMotion()) return;
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          if (touched.current) return;
          const t = Math.min(1, (now - start) / INTRO_MS);
          const eased = 1 - (1 - t) ** 3;
          setPosition(INTRO_FROM + (INTRO_TO - INTRO_FROM) * eased);
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(stage);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [meta]);

  const moveTo = (clientX: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    touched.current = true;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e.clientX);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e.clientX);
  };
  const onPointerEnd = () => {
    dragging.current = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = {
      ArrowLeft: position - STEP,
      ArrowDown: position - STEP,
      ArrowRight: position + STEP,
      ArrowUp: position + STEP,
      Home: 0,
      End: 100,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    touched.current = true;
    setPosition(clamp(Math.round(next / STEP) * STEP));
  };

  const ready = meta !== null && meta !== "error";

  return (
    <figure className={className} style={{ margin: 0 }}>
      <div style={styles.card}>
        {ready ? (
          <div
            ref={stageRef}
            style={{ ...styles.stage, aspectRatio: `${meta.width} / ${meta.height}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <Image
              src={`/see/${site}/${meta.radar.image}`}
              alt={`${meta.radar.label}. Radar backscatter of the same place, unaffected by cloud.`}
              fill
              sizes="(max-width: 960px) 100vw, 960px"
              draggable={false}
              style={styles.image}
            />
            <span style={{ ...styles.label, right: INSET }}>{meta.radar.label}</span>
            <div style={{ ...styles.layer, clipPath: `inset(0 ${100 - position}% 0 0)` }}>
              <Image
                src={`/see/${site}/${meta.optical.image}`}
                alt={`${meta.optical.label}. A satellite photo of the same place, covered by cloud.`}
                fill
                sizes="(max-width: 960px) 100vw, 960px"
                draggable={false}
                style={styles.image}
              />
              <span style={{ ...styles.label, left: INSET }}>{meta.optical.label}</span>
            </div>
            <div style={{ ...styles.divider, left: `${position}%` }}>
              <div
                role="slider"
                tabIndex={0}
                aria-label="Optical and radar comparison"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(position)}
                aria-valuetext={`${Math.round(position)}% optical, ${100 - Math.round(position)}% radar`}
                onKeyDown={onKeyDown}
                style={styles.handle}
              >
                <ChevronsLeftRight size={14} strokeWidth={1.75} aria-hidden />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ ...styles.stage, aspectRatio: "3 / 2", cursor: "default" }} />
        )}
      </div>
      <figcaption style={styles.caption}>
        {meta === "error" ? "The comparison images didn't load." : ready ? meta.caption : " "}
      </figcaption>
    </figure>
  );
}

const styles = {
  card: {
    borderRadius: 20,
    border: "1px solid var(--line, #e6e6e6)",
    overflow: "hidden",
    background: "var(--raised, #fff)",
  },
  stage: {
    position: "relative",
    width: "100%",
    containerType: "inline-size",
    touchAction: "pan-y",
    userSelect: "none",
    WebkitUserSelect: "none",
    cursor: "ew-resize",
  },
  layer: { position: "absolute", inset: 0 },
  image: { objectFit: "cover", pointerEvents: "none" },
  label: {
    position: "absolute",
    top: INSET,
    whiteSpace: "nowrap",
    padding: "3px 8px",
    borderRadius: 8,
    border: "1px solid var(--line, #e6e6e6)",
    background: "rgb(255 255 255 / 0.9)",
    color: "var(--ink, #2b2b2b)",
    fontSize: "clamp(11px, 3.2cqw, 12px)",
    lineHeight: 1.35,
    pointerEvents: "none",
  },
  divider: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    background: "#fff",
    boxShadow: "0 0 0 0.5px rgb(0 0 0 / 0.12)",
  },
  handle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 32,
    height: 32,
    marginTop: -16,
    marginLeft: -16,
    borderRadius: "50%",
    border: "1px solid var(--line, #e6e6e6)",
    background: "#fff",
    color: "var(--ink-2, #6f6f6f)",
    display: "grid",
    placeItems: "center",
    cursor: "ew-resize",
  },
  caption: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 1.5,
    color: "var(--ink-2, #6f6f6f)",
  },
} satisfies Record<string, CSSProperties>;
