"use client";

import dynamic from "next/dynamic";

export const ExploreLoader = dynamic(() => import("./explore").then((m) => m.Explore), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "var(--surface)" }} />,
});
