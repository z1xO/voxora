"use client";
// Dark / Light theme. The choice is stored per browser and applied before first paint (see THEME_SCRIPT).
import { useEffect, useState } from "react";
import { THEME_KEY } from "./themeScript";

export type Theme = "dark" | "light";

export function currentTheme(): Theme {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

/** The active theme, kept in sync with <html data-theme> (for things CSS can't reach, like the code editor). */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    setTheme(currentTheme());
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
