"use client";
// Runs a state update inside the browser's View Transitions API when available, so changed elements
// (cards, selection thumbs, theme colors) animate smoothly. Falls back to a plain update elsewhere
// and whenever the user prefers reduced motion.
import { flushSync } from "react-dom";

type DocWithVT = Document & { startViewTransition?: (cb: () => void) => unknown };

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function supportsViewTransitions() {
  return typeof document !== "undefined" && typeof (document as DocWithVT).startViewTransition === "function";
}

export function withViewTransition(update: () => void) {
  if (!supportsViewTransitions() || prefersReducedMotion()) return update();
  (document as DocWithVT).startViewTransition!(() => flushSync(update));
}
