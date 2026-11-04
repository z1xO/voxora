// Decides WHEN the interviewer speaks and about WHAT, deterministically. A real interviewer mostly
// listens: they answer questions, briefly acknowledge answers, and otherwise speak only at a few
// natural checkpoints. The model only phrases the move chosen here; it never decides to chime in.
import type { Problem } from "./problems";
import type { SessionContext, Turn } from "./types";
import type { Signals } from "./signals";
import type { Trigger } from "./prompts";
import { asksForSolution } from "./guard";
import { detectFeatures } from "./codeSummary";

export type Checkpoint = "approach" | "go_ahead" | "complexity" | "optimize" | "edge_cases" | "debug" | "wrap_up" | "check_in";

export type Decision =
  | { mode: "respond"; request: "solution" | "question" }
  | { mode: "ack"; allowFollowUp: boolean }
  | { mode: "checkpoint"; checkpoint: Checkpoint; template: string; expectsQuestion: boolean }
  | { mode: "quiet"; reason: string };

/** Minimum seconds between unprompted interviewer remarks. */
export const MIN_GAP_S = 60;
const CHECK_IN_GAP_S = 180;

const INTERROGATIVE = /^(can|could|should|is|are|does|do|will|would|am|may|what|how|why|when|where|which)\b/i;

export function isDirectQuestion(text: string): boolean {
  const t = text.trim();
  if (/\?\s*$/.test(t)) return true;
  // Speech transcripts often drop the question mark; accept short utterances that open like a question.
  return INTERROGATIVE.test(t) && t.split(/\s+/).length <= 18 && /\b(you|i|we|the|it|this|there|input|array|string)\b/i.test(t);
}

function lastIndexWhere<T>(xs: T[], f: (x: T) => boolean) {
  for (let i = xs.length - 1; i >= 0; i--) if (f(xs[i])) return i;
  return -1;
}

export function isBruteForce(p: Problem, code: string) {
  return detectFeatures(code, p.functionName).includes("nested loops") && !/n\^?2|n²/.test(p.optimal.time);
}

export function decide(p: Problem, ctx: SessionContext, s: Signals, trigger: Trigger): Decision {
  const turns = ctx.turns;
  const last = turns[turns.length - 1];
  const candidateJustSpoke = trigger.startsWith("candidate") && last?.role === "candidate";

  // 1. The candidate asked us something: always respond.
  if (candidateJustSpoke && asksForSolution(last.text)) return { mode: "respond", request: "solution" };
  if (candidateJustSpoke && isDirectQuestion(last.text)) return { mode: "respond", request: "question" };

  const lastInterviewerIdx = lastIndexWhere(turns, (t) => t.role === "interviewer");
  const lastInterviewer: Turn | undefined = turns[lastInterviewerIdx];
  const candidateTurnsSince = turns.slice(lastInterviewerIdx + 1).filter((t) => t.role === "candidate").length;

  // 2. The candidate just answered our question: acknowledge it (one short follow-up at most).
  if (candidateJustSpoke && lastInterviewer && (lastInterviewer.kind === "question" || lastInterviewer.kind === "hint") && candidateTurnsSince === 1) {
    return { mode: "ack", allowFollowUp: lastInterviewer.kind === "question" && lastInterviewer.focus !== "follow_up" };
  }

  // Never stack a new question on one that hasn't been answered.
  if (lastInterviewer?.kind === "question" && candidateTurnsSince === 0) return { mode: "quiet", reason: "awaiting answer" };

  const asked = new Set(turns.filter((t) => t.role === "interviewer" && t.focus).map((t) => t.focus));

  // Once the candidate has laid out a plan before coding, a quick go-ahead is natural even right after the greeting.
  if (!asked.has("go_ahead") && candidateJustSpoke && s.approachBeforeCode && ctx.codeEvents.length === 0 && s.candidateWords >= 30) {
    return { mode: "checkpoint", checkpoint: "go_ahead", template: "That sounds reasonable. Go ahead and code it up, and keep talking me through it as you go.", expectsQuestion: false };
  }

  const sinceInterviewer = ctx.elapsed - (lastInterviewer?.t ?? 0);
  if (sinceInterviewer < MIN_GAP_S) return { mode: "quiet", reason: "too soon" };
  const lastRun = s.lastRun;
  const allPass = !!lastRun && lastRun.total > 0 && lastRun.passed === lastRun.total;
  const complexityCovered = s.complexityStatements.length > 0 || asked.has("complexity");
  const edgeCovered = s.coveredEdgeCases.length > 0 || s.edgeStatements.length > 0 || asked.has("edge_cases");

  const checkpoint = (checkpoint: Checkpoint, template: string, expectsQuestion = true): Decision => ({ mode: "checkpoint", checkpoint, template, expectsQuestion });

  // 3. Natural checkpoints, in the order an interview usually flows. Each is used once.
  if (!asked.has("approach") && ctx.codeEvents.length > 0 && !s.approachBeforeCode && s.candidateWords < 30 && ctx.elapsed > 45) {
    return checkpoint("approach", "Before you go further, can you walk me through the approach you're taking?");
  }
  if (!asked.has("debug") && trigger === "idle" && lastRun && !allPass && ctx.elapsed - lastRun.t > 60) {
    const fail = lastRun.cases.find((c) => !c.passed);
    if (fail) return checkpoint("debug", `Let's look at the failing case with input ${fail.input}. What do you expect your code to do there?`);
  }
  if (allPass && !complexityCovered) {
    return checkpoint("complexity", "Nice, the samples pass. What are the time and space complexity of your solution?");
  }
  if (allPass && complexityCovered && !asked.has("optimize") && isBruteForce(p, ctx.code)) {
    return checkpoint("optimize", "Okay. Do you think you could do better than that? What's the bottleneck?");
  }
  if (allPass && complexityCovered && !edgeCovered) {
    const edge = p.edgeCases.find((e) => !s.coveredEdgeCases.some((c) => c.startsWith(e.label))) ?? p.edgeCases[0];
    return checkpoint("edge_cases", edge.question);
  }
  if (allPass && complexityCovered && edgeCovered && !asked.has("wrap_up") && !isBruteForce(p, ctx.code)) {
    return checkpoint("wrap_up", "Nice work. If you had more time, is there anything you'd test or change?");
  }
  // After the wrap-up question the interview is effectively over; let the candidate finish in peace.
  if (trigger === "idle" && !asked.has("wrap_up")) {
    const lastCheckIn = [...turns].reverse().find((t) => t.focus === "check_in");
    if (!lastCheckIn || ctx.elapsed - lastCheckIn.t > CHECK_IN_GAP_S) {
      return checkpoint("check_in", "How's it going? Talk me through where you are right now.");
    }
  }
  return { mode: "quiet", reason: "no checkpoint reached" };
}

const ACKS = ["Okay, that makes sense.", "Got it, thanks.", "Sounds good. Keep going.", "Okay, good.", "Alright, makes sense."];

/** Picks an acknowledgement deterministically so repeated sessions don't feel random but don't repeat back-to-back. */
export function ackTemplate(ctx: SessionContext) {
  const n = ctx.turns.filter((t) => t.role === "interviewer").length;
  return ACKS[n % ACKS.length];
}
