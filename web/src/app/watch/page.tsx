import type { Metadata } from "next";
import { WatchLoader } from "./watch-loader";

export const metadata: Metadata = { title: "Watch · Distill" };

export default function WatchPage() {
  return <WatchLoader />;
}
