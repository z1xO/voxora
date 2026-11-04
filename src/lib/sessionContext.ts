import { getProblem, type Problem } from "./problems";
import type { Engine, SessionContext } from "./types";

/** Parses and bounds the session payload sent by the browser. */
export function readContext(body: unknown): { ctx: SessionContext; problem: Problem } | null {
  const ctx = (body as { ctx?: SessionContext })?.ctx;
  if (!ctx || typeof ctx.problemId !== "string") return null;
  const problem = getProblem(ctx.problemId);
  if (!problem) return null;
  const engine: Engine = ctx.engine === "local" || ctx.engine === "hosted" ? ctx.engine : "offline";
  return {
    problem,
    ctx: {
      problemId: ctx.problemId,
      engine,
      elapsed: Number(ctx.elapsed) || 0,
      turns: Array.isArray(ctx.turns) ? ctx.turns.slice(-200).map((t) => ({ ...t, text: String(t.text ?? "").slice(0, 2000) })) : [],
      codeEvents: Array.isArray(ctx.codeEvents) ? ctx.codeEvents.slice(-40) : [],
      runs: Array.isArray(ctx.runs) ? ctx.runs.slice(-20) : [],
      code: String(ctx.code ?? "").slice(0, 20_000),
      hintsUsed: Math.max(0, Math.min(3, Number(ctx.hintsUsed) || 0)),
    },
  };
}

export const firstCodeAt = (ctx: SessionContext) => (ctx.codeEvents.length ? ctx.codeEvents[0].t : null);

export const candidateCorpus = (ctx: SessionContext) =>
  ctx.turns.filter((t) => t.role === "candidate").map((t) => t.text).join(" ") + "\n" + ctx.code;
