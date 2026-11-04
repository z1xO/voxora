// Shared by the Docker runner (server) and the in-browser Pyodide runner.
import type { CaseResult } from "./types";

export const PER_TEST_TIMEOUT_S = 2;
export const RESULT_MARKER = "__VOXORA__";

// Runs inside the sandbox (Docker, or Pyodide in the browser): loads the candidate's code, calls the
// function on each sample test, and prints one marked JSON line. Candidate stdout is captured and truncated.
export const HARNESS = String.raw`
import json, sys, io, copy, time, contextlib, traceback
try:
    import signal
    HAS_ALARM = hasattr(signal, "SIGALRM") and hasattr(signal, "alarm")
except Exception:
    HAS_ALARM = False

# Docker passes the payload on stdin; the browser runner sets VOXORA_INPUT instead. There, per-test
# alarms aren't available, so the page enforces the time limit by stopping the worker.
try:
    _raw = VOXORA_INPUT
    HAS_ALARM = False
except NameError:
    _raw = sys.stdin.read()
data = json.loads(_raw)
out = {"ok": True, "cases": [], "error": None, "stdout": ""}
buf = io.StringIO()

class TimeLimit(Exception):
    pass

def on_alarm(signum, frame):
    raise TimeLimit("Time limit exceeded (%ss)" % data["perTest"])

if HAS_ALARM:
    signal.signal(signal.SIGALRM, on_alarm)

# The container has no network; fail fast instead of hanging in a DNS lookup the alarm can't interrupt.
import socket
def no_network(*args, **kwargs):
    raise OSError("Network access is disabled in the sandbox.")
socket.getaddrinfo = no_network
socket.create_connection = no_network

def short_tb():
    lines = traceback.format_exc().strip().splitlines()
    keep = [l for l in lines if "solution.py" in l or not l.startswith("  File")]
    return "\n".join(keep[-6:])

ns = {"__name__": "solution"}
try:
    with contextlib.redirect_stdout(buf):
        exec(compile(data["code"], "solution.py", "exec"), ns)
except Exception:
    out["ok"] = False
    out["error"] = short_tb()

fn = None
if out["ok"]:
    name = data["fn"]
    if callable(ns.get(name)):
        fn = ns[name]
    elif isinstance(ns.get("Solution"), type) and hasattr(ns["Solution"], name):
        fn = getattr(ns["Solution"](), name)
    else:
        out["ok"] = False
        out["error"] = "Could not find a function named %s()." % name

def normalize(v, mode):
    if mode == "sorted" and isinstance(v, (list, tuple)):
        try:
            return sorted(v)
        except Exception:
            return list(v)
    if isinstance(v, tuple):
        return list(v)
    return v

if fn is not None:
    for i, t in enumerate(data["tests"]):
        args = copy.deepcopy(t["args"])
        shown = ", ".join(repr(a) for a in t["args"])
        case = {"index": i, "input": shown, "expected": repr(t["expected"]), "passed": False}
        start = time.perf_counter()
        try:
            if HAS_ALARM:
                signal.alarm(data["perTest"])
            with contextlib.redirect_stdout(buf):
                result = fn(*args)
            if HAS_ALARM:
                signal.alarm(0)
            case["actual"] = repr(result)
            case["passed"] = normalize(result, data["compare"]) == normalize(t["expected"], data["compare"])
        except BaseException as e:
            if HAS_ALARM:
                signal.alarm(0)
            case["error"] = str(e) if isinstance(e, TimeLimit) else short_tb()
        case["ms"] = round((time.perf_counter() - start) * 1000, 2)
        out["cases"].append(case)

out["stdout"] = buf.getvalue()[-4000:]
sys.__stdout__.write("\n__VOXORA__" + json.dumps(out) + "\n")
`;

export interface HarnessOutput {
  ok: boolean;
  cases: CaseResult[];
  error: string | null;
  stdout: string;
}

/** Extracts the harness's JSON result from everything the program printed, or null if it never got there. */
export function parseHarnessOutput(stdout: string): HarnessOutput | null {
  const at = stdout.lastIndexOf(RESULT_MARKER);
  if (at === -1) return null;
  return JSON.parse(stdout.slice(at + RESULT_MARKER.length).split("\n")[0]) as HarnessOutput;
}

/** The JSON payload the harness expects. */
export function harnessPayload(code: string, fn: string, tests: unknown, compare: string) {
  return JSON.stringify({ code, fn, tests, compare, perTest: PER_TEST_TIMEOUT_S });
}
