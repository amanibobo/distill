import { EB_Garamond } from "next/font/google";
import type { ReactNode } from "react";
import "./home.css";

const garamond = EB_Garamond({ subsets: ["latin"], variable: "--font-garamond", style: ["normal", "italic"], display: "swap" });

export default function HomeLayout({ children }: { children: ReactNode }) {
  return <div className={`home ${garamond.variable}`}>{children}</div>;
}
