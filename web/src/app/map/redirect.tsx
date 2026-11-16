"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// /watch and /explore are now modes of the map screen; old links and the tour land here.
const TARGETS = {
  watch: (p: URLSearchParams) => {
    const out = new URLSearchParams({ site: p.get("site") ?? "kaiser", draw: "1" });
    for (const k of ["bbox", "name"]) {
      const v = p.get(k);
      if (v) out.set(k, v);
    }
    return `/map?${out}`;
  },
  explore: () => "/map?site=venezuela",
};

export function RedirectToMap({ from }: { from: keyof typeof TARGETS }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(TARGETS[from](new URLSearchParams(window.location.search)));
  }, [router, from]);
  return <div style={{ position: "fixed", inset: 0, background: "var(--surface)" }} />;
}
