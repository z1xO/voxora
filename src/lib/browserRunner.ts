"use client";
// Runs a problem's sample tests in the browser (Pyodide in a worker) when the server has no sandbox.
// The time limit only starts once Python has loaded; a run that exceeds it stops the worker outright.
import type { Problem } from "./problems";
import type { CaseResult } from "./types";
import { PER_TEST_TIMEOUT_S, harnessPayload, parseHarnessOutput } from "./harness";

const STARTUP_ALLOWANCE_MS = 1_500;

export interface BrowserRunOutcome {
  ok: boolean;
  cases: CaseResult[];
  error?: string;
  stdout?: string;
}

let worker: Worker | null = null;
let nextId = 0;

function getWorker() {
  worker ??= new Worker(new URL("../workers/python.worker.ts", import.meta.url), { type: "module" });
  return worker;
}

/** Starts downloading Python early (about 10 MB the first time, then cached by the browser). */
export function preloadBrowserPython() {
  getWorker().postMessage({ type: "load" });
}

export function runInBrowser(problem: Problem, code: string): Promise<BrowserRunOutcome> {
  const w = getWorker();
  const id = ++nextId;
  const limitMs = problem.tests.length * PER_TEST_TIMEOUT_S * 1000 + STARTUP_ALLOWANCE_MS;
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (r: BrowserRunOutcome) => {
      if (timer) clearTimeout(timer);
      w.removeEventListener("message", onMessage);
      resolve(r);
    };
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === "started") {
        timer = setTimeout(() => {
          // Infinite loop or very slow code: the only way to stop it is to discard the worker.
          w.terminate();
          worker = null;
          done({ ok: false, cases: [], error: `Execution stopped after ${limitMs / 1000}s. Check for an infinite loop or a very slow step.` });
        }, limitMs);
      } else if (m.type === "result") {
        const parsed = parseHarnessOutput(m.stdout);
        done(parsed ? { ok: parsed.ok, cases: parsed.cases, error: parsed.error ?? undefined, stdout: parsed.stdout || undefined } : { ok: false, cases: [], error: (m.stdout || "No result").trim().split("\n").slice(-6).join("\n") });
      } else if (m.type === "error") {
        done({ ok: false, cases: [], error: `Couldn't run Python in the browser: ${m.error}` });
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ type: "run", id, payload: harnessPayload(code, problem.functionName, problem.tests, problem.compare) });
  });
}
