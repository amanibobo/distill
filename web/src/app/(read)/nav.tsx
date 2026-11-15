"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "../map/rail";

export function Nav() {
  const path = usePathname();
  return <Tabs current={path === "/writeup" ? "writeup" : null} />;
}
