import type { Problem } from "./problems";
import type { SessionContext } from "./types";
import { describeRun, type Signals } from "./signals";

export type Trigger = "candidate_spoke" | "candidate_typed" | "code_change" | "run" | "idle";

const fmtTime = (s: number) => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, "0")}s`;

function numbered(code: string, max = 80) {
  const lines = code.split("\n");
  const shown = lines.slice(0, max).map((l, i) => `${String(i + 1).padStart(3)}| ${l}`);
  if (lines.length > max) shown.push(`... (${lines.length - max} more lines)`);
  return shown.join("\n");
}

function problemBlock(p: Problem) {
  return [
    `PROBLEM: ${p.title} (${p.difficulty}, Python, function ${p.functionName})`,
    p.prompt.replace(/`/g, ""),
    `Examples: ${p.examples.map((e) => `${e.input} -> ${e.output}`).join(" | ")}`,
    `Constraints: ${p.constraints.join("; ")}`,
  ].join("\n");
}

export function sessionBlock(p: Problem, ctx: SessionContext, s: Signals, recentTurns = 14) {
  const convo = ctx.turns
    .slice(-recentTurns)
    .map((t) => `[${fmtTime(t.t)}] ${t.role === "candidate" ? "CANDIDATE" : "INTERVIEWER"}${t.kind === "hint" ? ` (hint ${t.hintLevel})` : ""}: ${t.text}`)
    .join("\n");
  const changes = ctx.codeEvents
    .slice(-5)
    .map((e) => `[${fmtTime(e.t)}] ${e.summary}`)
    .join("\n");
  const coverage = [
    `approach explained before coding: ${s.approachBeforeCode ? "yes" : "not yet"}`,
    `complexity discussed: ${s.complexityStatements.length ? "yes" : "not yet"}`,
    `edge cases discussed: ${s.coveredEdgeCases.length ? s.coveredEdgeCases.join(", ") : "not yet"}`,
    `sample tests: ${s.lastRun ? describeRun(s.lastRun, ctx.runs.length) : "never run"}`,
    `hints used: ${ctx.hintsUsed}/3`,
  ].join("\n");
  return [
    problemBlock(p),
    `\nELAPSED: ${fmtTime(ctx.elapsed)}`,
    `\nCOVERAGE SO FAR:\n${coverage}`,
    `\nRECENT MEANINGFUL CODE CHANGES:\n${changes || "(none yet)"}`,
    `\nCURRENT CODE:\n${numbered(ctx.code)}`,
    `\nRECENT CONVERSATION:\n${convo || "(nothing said yet)"}`,
  ].join("\n");
}

export const HINT_SYSTEM = `You are the interviewer in a coding interview. The candidate asked for a hint. Hints come in three levels: 1 = gentle nudge, 2 = directional clue, 3 = specific concept hint.
Rules:
- Give exactly the requested level. Use the reference hint as a ceiling: be NO more specific than it.
- Tailor it to where the candidate is right now (their words and current code). If their code is already on a good path, point at the next gap instead.
- One or two spoken sentences. No code, no pseudocode, no step-by-step algorithm, no markdown.
Reply with JSON only: {"message": "..."}`;

export function hintUser(p: Problem, ctx: SessionContext, s: Signals, level: 1 | 2 | 3) {
  return `${sessionBlock(p, ctx, s, 10)}\n\nREQUESTED HINT LEVEL: ${level}\nREFERENCE HINT (ceiling): ${p.hints[level - 1]}\nJSON only.`;
}

export const GRADER_SYSTEM = `You grade a practice coding interview. Scores must come from observable evidence in the session, never from an overall impression.

Categories (score 1-5 each):
- problemSolving: approach, decomposition, and progress toward a correct solution. Use test results and code. Heavy hint use lowers it.
- communication: clarity and structure of the candidate's explanations (stating a plan, explaining why, answering the interviewer's questions directly). NEVER consider accent, grammar, filler words, transcription errors, or speaking speed. Judge communication separately from correctness.
- complexity: ability to reason about time and space cost. Correct, justified Big-O for their own code scores high.
- edgeCases: identifying and handling boundary conditions (empty input, duplicates, etc.) in speech or code.

Anchors: 1 = little or incorrect, 2 = weak/partial, 3 = adequate with gaps, 4 = solid, 5 = excellent and unprompted.

Evidence rules (strict):
- Every non-null score needs 1-2 evidence items. Each quote must be copied VERBATIM from a CANDIDATE line in the transcript (type "transcript"), from a line of the final code (type "code"), or from a run summary line (type "run"). Never quote the interviewer. Keep quotes short (under 25 words).
- If the session contains no evidence for a category, set "score": null and explain in the rationale what was missing. Do not guess.
- Rationale: 1-2 sentences, addressed to the candidate ("You...").

Also give exactly 2 strengths (each grounded in something they did) and 1-3 practice actions that are specific and doable next session.

Reply with JSON only:
{"categories": {"problemSolving": {"score": 1-5 | null, "rationale": "...", "evidence": [{"type": "transcript"|"code"|"run", "quote": "..."}]}, "communication": {...}, "complexity": {...}, "edgeCases": {...}}, "strengths": ["...", "..."], "actions": ["..."]}`;

export function graderUser(p: Problem, ctx: SessionContext, s: Signals) {
  const transcript = ctx.turns
    .map((t) => `[${fmtTime(t.t)}] ${t.role === "candidate" ? "CANDIDATE" : "INTERVIEWER"}${t.kind === "hint" ? ` (hint level ${t.hintLevel})` : ""}: ${t.text}`)
    .join("\n");
  const runs = ctx.runs.map((r, i) => describeRun(r, i + 1)).join("\n");
  return [
    problemBlock(p),
    `Optimal reference: ${p.optimal.time} time, ${p.optimal.space} space.`,
    `\nSESSION LENGTH: ${fmtTime(ctx.elapsed)}. HINTS USED: ${ctx.hintsUsed}/3.`,
    `\nDETECTED SIGNALS (for orientation; verify against the transcript):`,
    `- candidate words spoken/typed: ${s.candidateWords}`,
    `- explained approach before coding: ${s.approachBeforeCode}`,
    `- interviewer questions answered: ${s.questionsAnswered}/${s.questionsAsked}`,
    `- complexity statements: ${s.complexityStatements.length}`,
    `- edge cases covered: ${s.coveredEdgeCases.join(", ") || "none"}`,
    `\nRUN SUMMARIES:\n${runs || "(code was never run)"}`,
    `\nCODE MILESTONES:\n${ctx.codeEvents.map((e) => `[${fmtTime(e.t)}] ${e.summary}`).join("\n") || "(none)"}`,
    `\nFINAL CODE:\n${ctx.code}`,
    `\nTRANSCRIPT:\n${transcript || "(empty)"}`,
    `\nGrade now. JSON only.`,
  ].join("\n");
}
