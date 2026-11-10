import type { Metadata } from "next";
import { AtlasLoader } from "./atlas-loader";

export const metadata: Metadata = { title: "Map · Distill" };

export default function MapPage() {
  return <AtlasLoader />;
}
