"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/map", label: "Open the map" },
  { href: "/process", label: "Process" },
  { href: "/writeup", label: "Writeup" },
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Pages" className="nav">
      {LINKS.map((l, i) => (
        <span key={l.href} className="nav-item">
          {i > 0 && <span aria-hidden>&middot;</span>}
          <Link href={l.href} aria-current={path === l.href ? "page" : undefined} className={l.href === "/map" ? "nav-primary" : undefined}>
            {l.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
