"use client";
// Saved sessions live only in this browser's localStorage. Nothing is saved unless the user opts in.
import type { SavedSession } from "./types";

const KEY = "voxora.sessions.v1";
/** Key used before the product was renamed; sessions saved there are moved over on first read. */
const LEGACY_KEY = "speakode.sessions.v1";

export function listSessions(): SavedSession[] {
  try {
    let raw = localStorage.getItem(KEY);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!raw && legacy) {
      localStorage.setItem(KEY, legacy);
      localStorage.removeItem(LEGACY_KEY);
      raw = legacy;
    }
    const all = raw ? (JSON.parse(raw) as SavedSession[]) : [];
    return all.sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}

export function saveSession(s: SavedSession): boolean {
  try {
    const rest = listSessions().filter((x) => x.id !== s.id);
    localStorage.setItem(KEY, JSON.stringify([s, ...rest].slice(0, 50)));
    return true;
  } catch {
    return false;
  }
}

export function deleteSession(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(listSessions().filter((x) => x.id !== id)));
  } catch {}
}

export function deleteAllSessions() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
