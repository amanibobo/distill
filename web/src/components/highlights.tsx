"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Marks a block as seen once it scrolls into view, so its highlights draw in one after another.
export function Highlights({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    node.querySelectorAll<HTMLElement>(".hl").forEach((el, i) => el.style.setProperty("--hl-delay", `${200 + i * 260}ms`));
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-seen={seen || undefined} className={className}>
      {children}
    </div>
  );
}
