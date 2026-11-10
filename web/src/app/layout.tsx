import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Distill",
  description: "A searchable, self-explaining map of how Earth's surface is changing, from NISAR radar.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={GeistMono.variable}>
      <body>{children}</body>
    </html>
  );
}
