"use client";

import { Moon, Sun } from "lucide-react";
import { setTheme, useTheme } from "@/lib/theme";

export function ThemeToggle({ className, label = false }: { className?: string; label?: boolean }) {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={className}
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      data-tip={`${next === "dark" ? "Dark" : "Light"} mode`}
      suppressHydrationWarning
    >
      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      {label && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
