import type { Metadata } from "next";
import { ExploreLoader } from "./explore-loader";

export const metadata: Metadata = { title: "Explore · Distill" };

export default function ExplorePage() {
  return <ExploreLoader />;
}
