export type Role = "candidate" | "interviewer";

export interface Turn {
  id: string;
  role: Role;
  text: string;
  /** Seconds since the interview started (excluding paused time). */
  t: number;
  kind?: "question" | "hint" | "answer" | "comment" | "intro";
  hintLevel?: 1 | 2 | 3;
  /** What an interviewer remark was about (a pacing checkpoint, "follow_up", "answer", ...). */
  focus?: string;
  source?: "voice" | "text";
  edited?: boolean;
}

export interface CodeEvent {
  id: string;
  t: number;
  summary: string;
  added: number;
  removed: number;
  features: string[];
  snapshot: string;
}

export interface CaseResult {
  index: number;
  input: string;
  expected: string;
  actual?: string;
  passed: boolean;
  error?: string;
  ms?: number;
}

export interface RunResult {
  id: string;
  t: number;
  ok: boolean;
  passed: number;
  total: number;
  cases: CaseResult[];
  error?: string;
  stdout?: string;
  sandbox: "docker" | "local-unsandboxed" | "browser";
}

/** Where the interviewer model runs. "offline" is the built-in rule-based coach. */
export type Engine = "local" | "hosted" | "offline";

export type Category = "problemSolving" | "communication" | "complexity" | "edgeCases";

export const CATEGORY_LABELS: Record<Category, string> = {
  problemSolving: "Problem-solving",
  communication: "Communication",
  complexity: "Complexity analysis",
  edgeCases: "Edge cases",
};

export const CATEGORIES: Category[] = ["problemSolving", "communication", "complexity", "edgeCases"];

export interface Evidence {
  type: "transcript" | "code" | "run";
  quote: string;
}

export interface CategoryScore {
  category: Category;
  /** 1–5, or null for "insufficient evidence". */
  score: number | null;
  rationale: string;
  evidence: Evidence[];
}

export interface Scorecard {
  categories: CategoryScore[];
  strengths: string[];
  actions: string[];
  engine: Engine;
  generatedAt: number;
  /** Evidence quotes the model offered that could not be found in the session and were discarded. */
  evidenceDropped: number;
}

/** Everything the session service needs to reason about the interview so far. */
export interface SessionContext {
  problemId: string;
  engine: Engine;
  elapsed: number;
  turns: Turn[];
  codeEvents: Omit<CodeEvent, "snapshot">[];
  runs: RunResult[];
  code: string;
  hintsUsed: number;
}

export interface SavedSession {
  id: string;
  problemId: string;
  problemTitle: string;
  startedAt: number;
  durationSec: number;
  engine: Engine;
  turns: Turn[];
  codeEvents: Omit<CodeEvent, "snapshot">[];
  runs: RunResult[];
  finalCode: string;
  hintsUsed: number;
  scorecard: Scorecard;
}

export interface HealthStatus {
  local: { available: boolean; model: string; detail: string };
  hosted: { available: boolean; model: string; detail: string };
  sandbox: { mode: "docker" | "local-unsandboxed" | "unavailable"; detail: string };
}
