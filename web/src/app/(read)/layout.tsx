import localFont from "next/font/local";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo";
import { Nav } from "./nav";
import "./read.css";

const hand = localFont({ src: "../fonts/Virgil-Regular.woff2", variable: "--font-hand", display: "swap" });

export default function ReadLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`read ${hand.variable}`}>
      <header className="read-head">
        <Link href="/" className="wordmark">
          <LogoMark className="logo" />
          Distill
        </Link>
        <Nav />
      </header>
      <main className="read-main">{children}</main>
      <footer className="read-foot">
        <span>Distill, NASA Space Apps 2026</span>
        <span>NISAR data from the ASF DAAC</span>
      </footer>
    </div>
  );
}
