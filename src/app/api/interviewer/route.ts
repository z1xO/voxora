import { NextResponse } from "next/server";
import { chatJson } from "@/lib/llm";
import { computeSignals } from "@/lib/signals";
import type { Trigger } from "@/lib/prompts";
import { INTERVIEWER_SYSTEM, interviewerMovePrompt } from "@/lib/interviewerPrompt";
import { fallbackMove, SILENT, type InterviewerMove } from "@/lib/fallbackCoach";
import { cleanSpoken, declinesRequest, leaksSolution } from "@/lib/guard";
import { decide } from "@/lib/pacing";
import { candidateCorpus, firstCodeAt, readContext } from "@/lib/sessionContext";

export const runtime = "nodejs";

const TRIGGERS: Trigger[] = ["candidate_spoke", "candidate_typed", "code_change", "run", "idle"];

/** Keeps the first question and any statements, dropping extra questions. */
function oneQuestion(message: string) {
  let kept = false;
  return (message.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((x) => x.trim())
    .filter((x) => !x.endsWith("?") || (!kept && (kept = true)))
    .join(" ");
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = readContext(body);
  const trigger = TRIGGERS.includes(body?.trigger) ? (body.trigger as Trigger) : "candidate_spoke";
  if (!parsed) return NextResponse.json({ error: "invalid session context" }, { status: 400 });
  const { ctx, problem } = parsed;
  const signals = computeSignals(problem, ctx.turns, ctx.runs, firstCodeAt(ctx), ctx.code);

  // Pacing decides whether and why to speak; the model only phrases the move.
  const decision = decide(problem, ctx, signals, trigger);
  if (decision.mode === "quiet") return NextResponse.json({ ...SILENT, engine: ctx.engine, reason: decision.reason });
  const fallback = fallbackMove(problem, ctx, signals, decision);
  if (ctx.engine === "offline") return NextResponse.json({ ...fallback, engine: "offline" });

  let move: InterviewerMove = fallback;
  let note: string | undefined;
  try {
    const raw = await chatJson<{ message?: string }>(ctx.engine, [
      { role: "system", content: INTERVIEWER_SYSTEM },
      { role: "user", content: interviewerMovePrompt(problem, ctx, signals, decision) },
    ]);
    const message = oneQuestion(cleanSpoken(String(raw.message ?? "")));
    const hasQuestion = message.includes("?");
    const words = message.split(/\s+/).length;
    const leak = message ? leaksSolution(message, problem, candidateCorpus(ctx)) : "was empty";

    let rejected: string | null = leak;
    if (!rejected && decision.mode === "respond" && decision.request === "solution" && !declinesRequest(message)) rejected = "didn't respond to the request";
    if (!rejected && decision.mode === "ack" && hasQuestion && !decision.allowFollowUp) rejected = "asked another question";
    if (!rejected && decision.mode === "ack" && !hasQuestion && words > 25) rejected = "was too long for an acknowledgement";
    if (!rejected && decision.mode === "checkpoint" && decision.expectsQuestion !== hasQuestion) rejected = "didn't match the intended move";

    if (rejected) {
      if (leak) note = `Replaced a model reply that ${leak}.`;
    } else if (decision.mode === "ack") {
      move = hasQuestion ? { action: "ask", message, focus: "follow_up" } : { action: "acknowledge", message, focus: "ack" };
    } else {
      move = { ...fallback, message };
    }
  } catch (e) {
    note = `Model unavailable (${(e as Error).message}); used the built-in coach.`;
  }
  return NextResponse.json({ ...move, engine: ctx.engine, note });
}
