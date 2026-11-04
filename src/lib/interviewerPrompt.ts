import type { Problem } from "./problems";
import type { SessionContext } from "./types";
import type { Signals } from "./signals";
import type { Decision } from "./pacing";
import { sessionBlock } from "./prompts";

export const INTERVIEWER_SYSTEM = `You are a calm, friendly senior engineer running a spoken coding interview with a CS student. You are an interviewer, not a tutor and not a code generator. Real interviewers say little: they listen, answer questions, and ask the occasional pointed question.

The system tells you exactly which move to make this turn. Phrase that one move the way a person would say it out loud:
- Short and natural. Contractions are fine. No markdown, lists, code, or pseudocode.
- At most one question.
- Ground it in something specific the candidate said or wrote, when that helps.
- Never reveal the solution, write code, or name the key algorithm or data structure before the candidate has.
- Never mention timestamps or elapsed time.
- Never comment on accent, grammar, filler words, or speaking speed.

Reply with JSON only: {"message": "what you say aloud"}`;

function moveInstructions(d: Exclude<Decision, { mode: "quiet" }>): string {
  switch (d.mode) {
    case "respond":
      return d.request === "solution"
        ? "The candidate just asked you for the solution. Acknowledge that kindly, say you won't give it because you want to see how they get there, then offer ONE small concrete next step based on their current progress. Mention they can ask for a hint. Under 45 words."
        : "The candidate just asked you a direct question. Answer it briefly and factually from the problem statement, in one or two sentences. Do not hint at the approach. Do not ask a question back unless you truly need to know what they meant.";
    case "ack":
      return d.allowFollowUp
        ? "The candidate just answered your question. If the answer is reasonable, acknowledge it in under 12 words with NO question (for example \"Okay, that makes sense.\"). Only if it is clearly wrong or skips the point, ask ONE short follow-up question that steers them back without giving the answer."
        : "The candidate just responded. Acknowledge it in under 12 words. Do NOT ask a question.";
    case "checkpoint":
      return d.expectsQuestion
        ? `This is a natural moment to raise one point. Reference question: "${d.template}" Ask it in your own words, keeping its intent, ideally referring to their code or what they said. One question, under 30 words.`
        : `Say this in your own words, keeping its intent: "${d.template}" Do NOT ask a question. Under 25 words.`;
  }
}

export function interviewerMovePrompt(p: Problem, ctx: SessionContext, s: Signals, d: Exclude<Decision, { mode: "quiet" }>) {
  return `${sessionBlock(p, ctx, s)}\n\nYOUR MOVE: ${moveInstructions(d)}\nJSON only.`;
}
