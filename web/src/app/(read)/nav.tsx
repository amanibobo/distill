"use client";

import { usePathname } from "next/navigation";
import { Tabs } from "../map/rail";

export function Nav() {
  const path = usePathname();
  const current = path === "/writeup" ? "writeup" : path === "/process" ? "process" : null;
  return <Tabs current={current} />;
}
