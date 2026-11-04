// Rule-based interviewer and grader. Used when no model is reachable, and as the safe replacement
// whenever model output fails validation. Deliberately conservative: it only speaks with a reason.
import type { Problem } from "./problems";
import type { CategoryScore, SessionContext } from "./types";
import { describeRun, type Signals } from "./signals";
import { ackTemplate, isBruteForce, type Decision } from "./pacing";

export interface InterviewerMove {
  action: "ask" | "answer" | "acknowledge" | "silent";
  message: string;
  focus: string;
}

export const SILENT: InterviewerMove = { action: "silent", message: "", focus: "none" };

/** Turns a pacing decision into what the built-in coach says. Also the safe fallback for model replies. */
export function fallbackMove(p: Problem, ctx: SessionContext, s: Signals, decision: Decision): InterviewerMove {
  switch (decision.mode) {
    case "quiet":
      return SILENT;
    case "ack":
      return { action: "acknowledge", message: ackTemplate(ctx), focus: "ack" };
    case "checkpoint":
      return { action: decision.expectsQuestion ? "ask" : "acknowledge", message: decision.template, focus: decision.checkpoint };
    case "respond":
      if (decision.request === "solution") {
        const step = isBruteForce(p, ctx.code)
          ? "Look at your nested loop: what work is it repeating for every element?"
          : s.lastRun && s.lastRun.passed < s.lastRun.total
            ? "Pick the failing test and walk me through what your code does on it, line by line."
            : ctx.codeEvents.length
              ? "Walk me through what your code does right now on the first example."
              : "What would the simplest brute-force version look like, even if it's slow?";
        const hint = ctx.hintsUsed < 3 ? " If you're stuck, you can also ask for a hint." : "";
        return {
          action: "answer",
          message: `I hear you, and I won't write the solution for you, because what I want to see is how you get there. Let's take one small step. ${step}${hint}`,
          focus: "answer",
        };
      }
      return {
        action: "answer",
        message: `Good question. Everything you need is in the constraints: ${p.constraints.map((c) => c.replace(/\.$/, "")).join("; ")}. Make a reasonable assumption, say it out loud, and keep going.`,
        focus: "answer",
      };
  }
}

const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

function longestBy<T>(xs: T[], f: (x: T) => number) {
  return xs.reduce<T | undefined>((best, x) => (best === undefined || f(x) > f(best) ? x : best), undefined);
}

function shortQuote(s: string, max = 160) {
  return s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, "");
}

export function fallbackScores(p: Problem, ctx: SessionContext, s: Signals): { categories: CategoryScore[]; strengths: string[]; actions: string[] } {
  const candidateSentences = ctx.turns.filter((t) => t.role === "candidate").map((t) => t.text);
  const runLines = ctx.runs.map((r, i) => describeRun(r, i + 1));

  // Problem-solving
  const ps: CategoryScore = { category: "problemSolving", score: null, rationale: "", evidence: [] };
  if (ctx.runs.length) {
    const best = s.bestPassRate;
    // A brute-force nested loop is progress, but not the expected solution when a faster bound exists.
    const nestedLine = ctx.code
      .split("\n")
      .find((l, i, all) => /^\s+(for|while)\b/.test(l) && all.slice(0, i).some((x) => /^\s*(for|while)\b/.test(x)));
    const bruteForce = isBruteForce(p, ctx.code);
    ps.score = clamp(1 + best * 3 + (s.approachBeforeCode ? 1 : 0) - ctx.hintsUsed * 0.5 - (bruteForce ? 1 : 0));
    const bestIdx = ctx.runs.findIndex((r) => r.total && r.passed / r.total === best);
    ps.evidence.push({ type: "run", quote: runLines[bestIdx >= 0 ? bestIdx : runLines.length - 1] });
    if (bruteForce && nestedLine) ps.evidence.push({ type: "code", quote: nestedLine.trim() });
    ps.rationale = `Your best run passed ${Math.round(best * 100)}% of the sample tests${ctx.hintsUsed ? ` after ${ctx.hintsUsed} hint${ctx.hintsUsed > 1 ? "s" : ""}` : " without hints"}.${bruteForce ? ` Your final code uses nested loops; the expected solution runs in ${p.optimal.time}.` : ""}`;
  } else {
    ps.rationale = "You never ran the code, so there's no evidence of whether the approach works. Run the sample tests before finishing.";
  }

  // Communication
  const cm: CategoryScore = { category: "communication", score: null, rationale: "", evidence: [] };
  if (s.candidateWords >= 40) {
    const reasoning = candidateSentences.filter((x) => /\b(because|so that|since|which means|first|then|the reason)\b/i.test(x));
    const answerRate = s.questionsAsked ? s.questionsAnswered / s.questionsAsked : 1;
    cm.score = clamp(2 + (s.approachBeforeCode ? 1 : 0) + (reasoning.length >= 2 ? 1 : 0) + (answerRate >= 0.7 ? 1 : 0));
    const ex = longestBy(reasoning.length ? reasoning : candidateSentences, (x) => x.length);
    if (ex) cm.evidence.push({ type: "transcript", quote: shortQuote(ex) });
    cm.rationale = [
      s.approachBeforeCode ? "You explained your plan before coding." : "You started coding before explaining your plan.",
      reasoning.length >= 2 ? "You gave reasons for your choices." : "Say why, not just what, as you go.",
      s.questionsAsked ? `You answered ${s.questionsAnswered} of ${s.questionsAsked} interviewer questions.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    cm.rationale = "There wasn't enough spoken or typed explanation to judge communication. Aim to narrate your thinking throughout.";
  }

  // Complexity
  const cx: CategoryScore = { category: "complexity", score: null, rationale: "", evidence: [] };
  if (s.complexityStatements.length) {
    cx.score = s.mentionsOptimalTime ? 4 : 3;
    if (s.complexityStatements.some((x) => /space|memory/i.test(x)) && s.mentionsOptimalTime) cx.score = 5;
    cx.evidence.push({ type: "transcript", quote: shortQuote(s.complexityStatements[0]) });
    cx.rationale = s.mentionsOptimalTime
      ? `You identified the expected ${p.optimal.time} time bound${cx.score === 5 ? " and discussed space" : ""}.`
      : `You discussed cost, but didn't land on the expected ${p.optimal.time} bound. Double-check by counting work per element.`;
  } else if (s.complexityAsked) {
    cx.score = 1;
    const q = ctx.turns.find((t) => t.role === "interviewer" && /complexity/i.test(t.text));
    const reply = q ? ctx.turns.slice(ctx.turns.indexOf(q) + 1).find((t) => t.role === "candidate") : undefined;
    if (reply) cx.evidence.push({ type: "transcript", quote: shortQuote(reply.text) });
    cx.rationale = "When asked about complexity, you didn't give a time or space bound.";
    if (!reply) cx.score = null;
  } else {
    cx.rationale = "Complexity never came up, so this can't be scored. State time and space cost before you finish.";
  }

  // Edge cases
  const ed: CategoryScore = { category: "edgeCases", score: null, rationale: "", evidence: [] };
  const guard = ctx.code.split("\n").find((l) => /if\s+not\s+\w+\s*:|len\(\w+\)\s*(==|<=|<)\s*[01]/.test(l));
  if (s.edgeStatements.length || guard) {
    ed.score = clamp(2 + Math.min(2, s.coveredEdgeCases.length) + (guard ? 1 : 0));
    if (s.edgeStatements[0]) ed.evidence.push({ type: "transcript", quote: shortQuote(s.edgeStatements[0]) });
    if (guard) ed.evidence.push({ type: "code", quote: guard.trim() });
    ed.rationale = s.coveredEdgeCases.length
      ? `You covered: ${s.coveredEdgeCases.join(", ")}.`
      : "You mentioned boundary conditions, but not the ones that matter most for this problem.";
  } else {
    ed.rationale = "Edge cases didn't come up. Name at least two boundary inputs and trace them before finishing.";
  }

  const categories = [ps, cm, cx, ed];
  const strengths: string[] = [];
  if (s.approachBeforeCode) strengths.push("You explained your approach before writing code, which gives an interviewer something to engage with.");
  if (s.bestPassRate === 1) strengths.push("You reached a solution that passes every sample test.");
  if (s.mentionsOptimalTime) strengths.push(`You reasoned your way to the ${p.optimal.time} time bound.`);
  if (s.coveredEdgeCases.length >= 2) strengths.push(`You considered several boundary cases (${s.coveredEdgeCases.slice(0, 2).join(", ")}).`);
  if (ctx.hintsUsed === 0 && ctx.runs.length) strengths.push("You worked through the problem without asking for hints.");
  if (s.questionsAsked && s.questionsAnswered === s.questionsAsked) strengths.push("You answered every follow-up question directly.");
  if (ctx.runs.length > 1) strengths.push("You iterated, running your code more than once to check your work.");
  while (strengths.length < 2) strengths.push(strengths.length ? "You stayed with the problem through the whole session." : "You showed up and practiced under interview conditions, which is the hardest part.");

  const actions: string[] = [];
  if (!s.approachBeforeCode) actions.push("Before typing, spend 60 seconds saying your plan aloud: the idea, the data structure, and why.");
  if (!s.complexityStatements.length) actions.push("Finish every problem by stating time and space complexity, and justify each in one sentence.");
  if (s.coveredEdgeCases.length < 2) actions.push(`List boundary inputs before running tests. For this problem: ${p.edgeCases.slice(0, 2).map((e) => e.label.toLowerCase()).join(" and ")}.`);
  if (!ctx.runs.length || s.bestPassRate < 1) actions.push("Trace one failing input by hand, line by line, before changing code.");
  if (ctx.hintsUsed >= 2) actions.push("When stuck, try a brute-force version first and say what makes it slow before asking for a hint.");
  if (!actions.length) actions.push(`Try a harder problem in the ${p.topic.toLowerCase()} topic, or redo this one aiming to finish faster.`);

  return { categories, strengths: strengths.slice(0, 2), actions: actions.slice(0, 3) };
}
