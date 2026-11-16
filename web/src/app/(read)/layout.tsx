import localFont from "next/font/local";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Nav } from "./nav";
import "./read.css";

const hand = localFont({ src: "../fonts/Virgil-Regular.woff2", variable: "--font-hand", display: "swap" });

export default function ReadLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`read ${hand.variable}`}>
      <header className="read-head">
        <div className="read-top">
          <Link href="/" className="wordmark">
            <LogoMark className="logo" />
            Distill
          </Link>
          <ThemeToggle className="theme-btn" />
        </div>
        <Nav />
      </header>
      <main className="read-main">{children}</main>
      <footer className="read-foot">
        <span>Distill, 2026</span>
        <span>NISAR data from the ASF DAAC</span>
      </footer>
    </div>
  );
}
