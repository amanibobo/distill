"use client";

import dynamic from "next/dynamic";

export const AtlasLoader = dynamic(() => import("./atlas").then((m) => m.Atlas), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "var(--surface)" }} />,
});
