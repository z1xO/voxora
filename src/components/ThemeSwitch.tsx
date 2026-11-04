"use client";
import { saveTheme, useTheme, type Theme } from "@/lib/theme";
import { prefersReducedMotion, supportsViewTransitions, withViewTransition } from "@/lib/viewTransition";

/** Accessible Dark/Light switch. The knob position is driven by CSS from <html data-theme>, so it's right on first paint. */
export function ThemeSwitch() {
  const theme = useTheme();

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    const apply = () => {
      if (next === "light") document.documentElement.dataset.theme = "light";
      else delete document.documentElement.dataset.theme;
    };
    saveTheme(next);
    if (supportsViewTransitions() || prefersReducedMotion()) return withViewTransition(apply);
    // No view transitions: let colors glide with a temporary transition class instead.
    const root = document.documentElement;
    root.classList.add("theme-anim");
    apply();
    setTimeout(() => root.classList.remove("theme-anim"), 450);
  };

  return (
    <button type="button" role="switch" aria-checked={theme === "light"} aria-label="Light mode" className="theme-switch" onClick={toggle} title={`Switch to ${theme === "light" ? "Dark" : "Light"} mode`}>
      <span className="ts-label ts-dark" aria-hidden="true">
        Dark
      </span>
      <span className="track" aria-hidden="true">
        <span className="knob" />
      </span>
      <span className="ts-label ts-light" aria-hidden="true">
        Light
      </span>
    </button>
  );
}
