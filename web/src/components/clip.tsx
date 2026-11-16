"use client";

import { useEffect, useRef } from "react";

// A looping demo clip that plays only while on screen. With reduced motion it never plays, so the poster frame stays.
export function Clip({ name, caption, label }: { name: string; caption: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <figure className="clip">
      <video ref={ref} src={`/tour/${name}.mp4`} poster={`/tour/${name}.jpg`} muted loop playsInline preload="metadata" aria-label={label} />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
