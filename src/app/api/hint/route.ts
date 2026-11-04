import { NextResponse } from "next/server";
import { chatJson } from "@/lib/llm";
import { computeSignals } from "@/lib/signals";
import { HINT_SYSTEM, hintUser } from "@/lib/prompts";
import { cleanSpoken, leaksSolution } from "@/lib/guard";
import { candidateCorpus, firstCodeAt, readContext } from "@/lib/sessionContext";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = readContext(body);
  if (!parsed) return NextResponse.json({ error: "invalid session context" }, { status: 400 });
  const { ctx, problem } = parsed;
  const level = Math.min(3, Math.max(1, Number(body?.level) || 1)) as 1 | 2 | 3;
  const reference = problem.hints[level - 1];

  if (ctx.engine === "offline") return NextResponse.json({ level, message: reference, engine: "offline" });

  try {
    const signals = computeSignals(problem, ctx.turns, ctx.runs, firstCodeAt(ctx), ctx.code);
    const raw = await chatJson<{ message?: string }>(ctx.engine, [
      { role: "system", content: HINT_SYSTEM },
      { role: "user", content: hintUser(problem, ctx, signals, level) },
    ]);
    const message = cleanSpoken(String(raw.message ?? ""));
    // Level 3 may name the concept; levels 1-2 must not get ahead of the candidate.
    const leak = message ? leaksSolution(message, problem, candidateCorpus(ctx), level === 3) : "was empty";
    if (leak) return NextResponse.json({ level, message: reference, engine: ctx.engine, note: `Used the reference hint (model reply ${leak}).` });
    return NextResponse.json({ level, message, engine: ctx.engine });
  } catch (e) {
    return NextResponse.json({ level, message: reference, engine: ctx.engine, note: `Model unavailable (${(e as Error).message}); used the reference hint.` });
  }
}
