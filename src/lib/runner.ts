import "server-only";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Problem } from "./problems";
import type { CaseResult, HealthStatus } from "./types";
import { HARNESS, PER_TEST_TIMEOUT_S, harnessPayload, parseHarnessOutput } from "./harness";

const IMAGE = process.env.SANDBOX_IMAGE || "python:3.11-alpine";
// Container start-up allowance on top of the per-test limits.
const STARTUP_ALLOWANCE_MS = 6_000;
const MAX_CODE_BYTES = 20_000;
const MAX_OUTPUT_BYTES = 64_000;



export interface RunOutcome {
  ok: boolean;
  cases: CaseResult[];
  error?: string;
  stdout?: string;
  sandbox: "docker" | "local-unsandboxed";
  /** No server sandbox here (e.g. a serverless host): the browser should run the tests itself. */
  unavailable?: boolean;
}

let dockerCache: { at: number; mode: HealthStatus["sandbox"] } | null = null;

export function sandboxStatus(): HealthStatus["sandbox"] {
  // A healthy sandbox is re-checked every 30s; a failed check only briefly, so a slow or just-started
  // Docker doesn't disable code execution for long.
  const ttl = dockerCache?.mode.mode === "docker" ? 30_000 : 3_000;
  if (dockerCache && Date.now() - dockerCache.at < ttl) return dockerCache.mode;
  let mode: HealthStatus["sandbox"];
  const info = spawnSync("docker", ["image", "inspect", IMAGE, "--format", "ok"], { encoding: "utf8", timeout: 8000 });
  if (info.status === 0) {
    mode = { mode: "docker", detail: `Isolated Docker container (${IMAGE}), no network, 128 MB RAM, 0.5 CPU.` };
  } else {
    const timedOut = (info.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
    const daemonDown = /daemon|pipe|connect/i.test(info.stderr || "") || info.error;
    const why = timedOut
      ? "Docker is not responding yet"
      : daemonDown
        ? "Docker is not running"
        : `Sandbox image ${IMAGE} is missing (run: npm run sandbox:pull)`;
    mode =
      // SPEAKODE_ALLOW_UNSANDBOXED is the pre-rename name, still accepted.
      (process.env.VOXORA_ALLOW_UNSANDBOXED ?? process.env.SPEAKODE_ALLOW_UNSANDBOXED) === "1"
        ? { mode: "local-unsandboxed", detail: `${why}. Using a local Python subprocess with a timeout — development only, not isolated.` }
        : { mode: "unavailable", detail: `${why}. Code execution is disabled until the sandbox is available.` };
  }
  dockerCache = { at: Date.now(), mode };
  return mode;
}

function execute(cmd: string, args: string[], stdin: string, opts: { timeoutMs: number; cwd?: string; env?: NodeJS.ProcessEnv; onTimeout?: () => void }) {
  return new Promise<{ stdout: string; stderr: string; timedOut: boolean; code: number | null }>((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      opts.onTimeout?.();
      child.kill("SIGKILL");
    }, opts.timeoutMs);
    child.stdout.on("data", (d) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += d;
    });
    child.stderr.on("data", (d) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += d;
    });
    child.on("error", (e) => {
      stderr += String(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, timedOut, code });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

export async function runSampleTests(problem: Problem, code: string): Promise<RunOutcome> {
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) {
    return { ok: false, cases: [], error: "Code is too large to run.", sandbox: "docker" };
  }
  const status = sandboxStatus();
  if (status.mode === "unavailable") {
    return { ok: false, cases: [], error: status.detail, sandbox: "docker", unavailable: true };
  }
  const payload = harnessPayload(code, problem.functionName, problem.tests, problem.compare);

  const timeoutMs = problem.tests.length * PER_TEST_TIMEOUT_S * 1000 + STARTUP_ALLOWANCE_MS;
  let res;
  if (status.mode === "docker") {
    const name = `voxora-run-${randomUUID().slice(0, 12)}`;
    res = await execute(
      "docker",
      [
        "run", "--rm", "-i", "--name", name, "--pull", "never",
        "--network", "none",
        "--memory", "128m", "--memory-swap", "128m",
        "--cpus", "0.5", "--pids-limit", "64",
        "--read-only", "--tmpfs", "/tmp:size=16m",
        "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--user", "65534:65534",
        IMAGE, "python", "-I", "-c", HARNESS,
      ],
      payload,
      { timeoutMs, onTimeout: () => spawn("docker", ["kill", name], { windowsHide: true }) },
    );
  } else {
    const dir = mkdtempSync(join(tmpdir(), "voxora-"));
    try {
      const python = process.platform === "win32" ? "python" : "python3";
      res = await execute(python, ["-I", "-c", HARNESS], payload, {
        timeoutMs,
        cwd: dir,
        env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, PYTHONIOENCODING: "utf-8" } as unknown as NodeJS.ProcessEnv,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  if (res.timedOut) {
    return { ok: false, cases: [], error: `Execution stopped after ${timeoutMs / 1000}s. Check for an infinite loop or a very slow step.`, sandbox: status.mode };
  }
  const parsed = parseHarnessOutput(res.stdout);
  if (!parsed) {
    const tail = (res.stderr || res.stdout).trim().split("\n").slice(-6).join("\n");
    const oom = res.code === 137 ? "The program was stopped (memory limit exceeded)." : "";
    return { ok: false, cases: [], error: oom || tail || "The sandbox returned no result.", sandbox: status.mode };
  }
  return {
    ok: parsed.ok,
    cases: parsed.cases,
    error: parsed.error ?? undefined,
    stdout: parsed.stdout || undefined,
    sandbox: status.mode,
  };
}
