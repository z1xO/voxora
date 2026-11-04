// Last line of defence against the interviewer giving away the solution. Model output that fails
// these checks is replaced by an authored, safe alternative.
import type { Problem } from "./problems";

export function cleanSpoken(text: string): string {
  return text
    .replace(/[*_#>`]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

const SOLUTION_REQUEST_RE = [
  // Phrased as a request aimed at the interviewer, so "I'll write the code now" doesn't match.
  /\b(give|tell|show|send|share)\s+me\b.{0,30}\b(answer|solution|code)\b/i,
  /\b(can|could|would|will)\s+you\b.{0,40}\b(write|give|show|tell|provide|share|type)\b.{0,30}\b(answer|solution|code)\b/i,
  /\b(please|just)\s+(write|give|show|tell|provide)\b.{0,30}\b(answer|solution|code)\b/i,
  /\bwhat('?s| is)\s+the\s+(answer|solution)\b/i,
  /\b(just|can you|could you|please)\b.{0,30}\b(solve|code|do)\s+it\b/i,
  /\bi\s+give\s+up\b/i,
];

/** True when the candidate is asking the interviewer to hand over the solution. */
export function asksForSolution(text: string): boolean {
  return SOLUTION_REQUEST_RE.some((re) => re.test(text));
}

const DECLINE_RE =
  /\b(can'?t|cannot|won'?t|will not|not going to|rather not|hold off|instead|not able|on your own|yourself)\b|\b(want|like|love|prefer) (to )?(see|hear) (how )?you\b/i;

/** True when a reply to a solution request acknowledges it and declines. */
export function declinesRequest(message: string): boolean {
  return DECLINE_RE.test(message);
}

export function leaksSolution(message: string, problem: Problem, candidateCorpus: string, allowConcept = false): string | null {
  if (/```/.test(message)) return "code block";
  const codeLike = message
    .split(/\n|;\s/)
    .filter((l) => /^\s*(def |for .+ in |while .+:|return |class |\w+\s*=\s*[^=]|\w+\.append\()/.test(l)).length;
  if (codeLike >= 2) return "code lines";
  if (new RegExp(`def\\s+${problem.functionName}`).test(message)) return "function definition";
  if (!allowConcept) {
    const lower = message.toLowerCase();
    const said = candidateCorpus.toLowerCase();
    const term = problem.giveaways.find((g) => lower.includes(g) && !said.includes(g));
    if (term) return `named the technique ("${term}") before the candidate did`;
  }
  return null;
}
