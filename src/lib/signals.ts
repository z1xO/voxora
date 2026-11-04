// Deterministic, explainable signals extracted from a session. Both the interviewer (to decide what
// to probe next) and the grader (to ground scores in evidence) use these.
import type { Problem } from "./problems";
import type { RunResult, Turn } from "./types";

const COMPLEXITY_RE =
  /\bo\s*\(\s*[^)]{1,20}\)|big[- ]?o|\blinear\b|\bquadratic\b|\blogarithmic\b|\blog\s*n\b|\bn\s*log\s*n\b|\bn\s*squared\b|\bn\^?2\b|constant (time|space)|time complexity|space complexity|\bextra space\b|\bmemory\b/i;
const EDGE_GENERIC_RE =
  /\bempty\b|edge case|corner case|\bnone\b|\bnull\b|single element|one element|\bduplicate|\bnegative|\bzero\b|\boverflow\b|\blarge input|\bboundary\b|what if/i;
const APPROACH_RE =
  /\b(approach|idea|plan|brute force|first i('| wi)ll|i('m| am) going to|i would|we could|i could|my thought|iterate|loop through|keep track|store|sort|check)\b/i;

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface Signals {
  candidateWords: number;
  candidateTurns: number;
  complexityStatements: string[];
  edgeStatements: string[];
  coveredEdgeCases: string[];
  approachBeforeCode: boolean;
  questionsAsked: number;
  questionsAnswered: number;
  complexityAsked: boolean;
  edgeAsked: boolean;
  mentionsOptimalTime: boolean;
  lastRun?: RunResult;
  bestPassRate: number;
}

export function computeSignals(problem: Problem, turns: Turn[], runs: RunResult[], firstCodeAt: number | null, code = ""): Signals {
  const candidate = turns.filter((t) => t.role === "candidate");
  const allText = candidate.map((t) => t.text).join(" ");
  const allSentences = candidate.flatMap((t) => sentences(t.text));
  const complexityStatements = allSentences.filter((s) => COMPLEXITY_RE.test(s));
  const lowerAll = allText.toLowerCase();
  const lowerCode = code.toLowerCase();

  const coveredEdgeCases = problem.edgeCases
    .filter((e) => e.keywords.some((k) => lowerAll.includes(k.toLowerCase())))
    .map((e) => e.label);
  const edgeStatements = allSentences.filter(
    (s) => EDGE_GENERIC_RE.test(s) || problem.edgeCases.some((e) => e.keywords.some((k) => s.toLowerCase().includes(k.toLowerCase()))),
  );
  // An explicit guard in code also counts as considering the empty-input case.
  if (/if\s+not\s+\w+\s*:|len\(\w+\)\s*(==|<=|<)\s*[01]/.test(lowerCode) && !coveredEdgeCases.some((l) => /empty/i.test(l))) {
    const empty = problem.edgeCases.find((e) => /empty/i.test(e.label));
    if (empty) coveredEdgeCases.push(`${empty.label} (handled in code)`);
  }

  const beforeCode = firstCodeAt === null ? candidate : candidate.filter((t) => t.t <= firstCodeAt);
  const wordsBeforeCode = beforeCode.reduce((n, t) => n + t.text.split(/\s+/).length, 0);
  const approachBeforeCode = wordsBeforeCode >= 20 && beforeCode.some((t) => APPROACH_RE.test(t.text));

  let questionsAsked = 0;
  let questionsAnswered = 0;
  turns.forEach((t, i) => {
    if (t.role === "interviewer" && t.kind === "question") {
      questionsAsked++;
      const next = turns.slice(i + 1).find((x) => x.role === "candidate" || x.kind === "question");
      if (next && next.role === "candidate") questionsAnswered++;
    }
  });
  const interviewerText = turns.filter((t) => t.role === "interviewer").map((t) => t.text).join(" ");

  return {
    candidateWords: allText.split(/\s+/).filter(Boolean).length,
    candidateTurns: candidate.length,
    complexityStatements,
    edgeStatements,
    coveredEdgeCases,
    approachBeforeCode,
    questionsAsked,
    questionsAnswered,
    complexityAsked: COMPLEXITY_RE.test(interviewerText),
    edgeAsked: problem.edgeCases.some((e) => interviewerText.includes(e.question)) || EDGE_GENERIC_RE.test(interviewerText),
    mentionsOptimalTime: problem.optimal.timeKeywords.some((k) => lowerAll.includes(k)),
    lastRun: runs[runs.length - 1],
    bestPassRate: runs.reduce((m, r) => Math.max(m, r.total ? r.passed / r.total : 0), 0),
  };
}

export function describeRun(r: RunResult, n: number): string {
  if (!r.ok && !r.cases.length) return `Run ${n}: did not complete (${(r.error ?? "error").split("\n").pop()})`;
  const failed = r.cases.filter((c) => !c.passed).map((c) => `(${c.input}) -> expected ${c.expected}, got ${c.error ? "error" : c.actual}`);
  return `Run ${n}: ${r.passed}/${r.total} sample tests passed${failed.length ? `; failing: ${failed.slice(0, 2).join("; ")}` : ""}`;
}
