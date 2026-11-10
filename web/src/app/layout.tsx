import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { EB_Garamond } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const garamond = EB_Garamond({ subsets: ["latin"], variable: "--font-garamond", display: "swap" });

export const metadata: Metadata = {
  title: "Distill",
  description: "A searchable, self-explaining map of how Earth's surface is changing, from NISAR radar.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${garamond.variable}`}>
      <body>{children}</body>
    </html>
  );
}
