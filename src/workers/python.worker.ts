/// <reference lib="webworker" />
// Runs candidate Python in the browser with Pyodide, for hosts that have no server-side sandbox.
// The code runs inside this worker, isolated from the page and from the server; the page stops the
// worker if a run exceeds its time limit.
import { HARNESS } from "@/lib/harness";

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

interface Pyodide {
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void; delete(name: string): void };
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
}

let pyodide: Promise<Pyodide> | null = null;

function load() {
  pyodide ??= (async () => {
    // Loaded from the CDN at runtime; webpackIgnore keeps the bundler from trying to resolve the URL.
    const mod = (await import(/* webpackIgnore: true */ `${PYODIDE_URL}pyodide.mjs`)) as { loadPyodide(o: { indexURL: string }): Promise<Pyodide> };
    return mod.loadPyodide({ indexURL: PYODIDE_URL });
  })();
  return pyodide;
}

self.onmessage = async (e: MessageEvent<{ type: "load" } | { type: "run"; id: number; payload: string }>) => {
  const msg = e.data;
  try {
    const py = await load();
    if (msg.type === "load") return self.postMessage({ type: "ready" });
    let stdout = "";
    py.setStdout({ batched: (s) => (stdout += s + "\n") });
    py.setStderr({ batched: (s) => (stdout += s + "\n") });
    py.globals.set("VOXORA_INPUT", msg.payload);
    self.postMessage({ type: "started", id: msg.id });
    await py.runPythonAsync(HARNESS);
    py.globals.delete("VOXORA_INPUT");
    self.postMessage({ type: "result", id: msg.id, stdout });
  } catch (err) {
    self.postMessage({ type: "error", id: "id" in msg ? msg.id : undefined, error: (err as Error).message });
  }
};
