"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEYS: Record<string, string> = { m: "/map", "/": "/map", w: "/watch", e: "/explore" };

export function LandingKeys() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
      const href = KEYS[e.key.toLowerCase()];
      if (href) {
        e.preventDefault();
        router.push(href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
