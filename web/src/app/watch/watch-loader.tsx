"use client";

import dynamic from "next/dynamic";

export const WatchLoader = dynamic(() => import("./watch").then((m) => m.WatchApp), {
  ssr: false,
  loading: () => <div style={{ position: "fixed", inset: 0, background: "var(--surface)" }} />,
});
