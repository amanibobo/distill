import { BookOpen, Map as MapIcon } from "lucide-react";
import Link from "next/link";
import ui from "./ui.module.css";

const TABS = [
  { id: "map", href: "/map", label: "Map", Icon: MapIcon },
  { id: "writeup", href: "/writeup", label: "Writeup", Icon: BookOpen },
] as const;

// The reading pages' header nav. The app is one screen, so it only needs the way in.
export function Tabs({ current }: { current: "map" | "watch" | "explore" | "writeup" | null }) {
  return (
    <nav className={ui.tabs} aria-label="Pages">
      {TABS.map(({ id, href, label, Icon }) => (
        <Link key={id} href={href} className={ui.tab} aria-current={id === current ? "page" : undefined}>
          {id === current && <Icon aria-hidden />}
          {label}
        </Link>
      ))}
    </nav>
  );
}
