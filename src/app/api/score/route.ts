import { NextResponse } from "next/server";
import { chatJson } from "@/lib/llm";
import { computeSignals } from "@/lib/signals";
import { GRADER_SYSTEM, graderUser } from "@/lib/prompts";
import { fallbackScores } from "@/lib/fallbackCoach";
import { ALLOWED_EVIDENCE, validateModelScores, verifyEvidence } from "@/lib/scoring";
import { firstCodeAt, readContext } from "@/lib/sessionContext";
import type { Scorecard } from "@/lib/types";

export const runtime = "nodejs";

const DELIVERY_RE = /\baccent|filler|\bum+\b|\buh+\b|grammar|speaking (speed|pace)|spoke (too )?(fast|slow)|pronunciation/i;

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = readContext(body);
  if (!parsed) return NextResponse.json({ error: "invalid session context" }, { status: 400 });
  const { ctx, problem } = parsed;
  const snapshots: string[] = Array.isArray(body?.snapshots) ? body.snapshots.map(String).slice(-20) : [];
  const signals = computeSignals(problem, ctx.turns, ctx.runs, firstCodeAt(ctx), ctx.code);
  const fallback = fallbackScores(problem, ctx, signals);

  const fromFallback = (note?: string): Scorecard & { note?: string } => {
    let dropped = 0;
    const categories = fallback.categories.map((c) => {
      const v = verifyEvidence(ctx, c.evidence, snapshots, ALLOWED_EVIDENCE[c.category]);
      dropped += v.dropped;
      return v.kept.length || c.score === null ? { ...c, evidence: v.kept } : { ...c, score: null, evidence: [] };
    });
    return { categories, strengths: fallback.strengths, actions: fallback.actions, engine: ctx.engine, generatedAt: Date.now(), evidenceDropped: dropped, note };
  };

  if (ctx.engine === "offline") return NextResponse.json(fromFallback());

  try {
    const raw = await chatJson<{ categories?: Record<string, unknown>; strengths?: unknown; actions?: unknown }>(
      ctx.engine,
      [
        { role: "system", content: GRADER_SYSTEM },
        { role: "user", content: graderUser(problem, ctx, signals) },
      ],
      { temperature: 0.2, maxTokens: 1400, timeoutMs: 150_000 },
    );
    const { categories, dropped } = validateModelScores(ctx, raw as never);
    // Communication must never be judged on delivery; use the rule-based read if the model did.
    const ci = categories.findIndex((c) => c.category === "communication");
    if (DELIVERY_RE.test(categories[ci].rationale)) categories[ci] = fallback.categories[1];

    const strings = (x: unknown) =>
      Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()) : [];
    const strengths = strings(raw.strengths).slice(0, 2);
    const actions = strings(raw.actions).slice(0, 3);
    const card: Scorecard = {
      categories,
      strengths: strengths.length === 2 ? strengths : fallback.strengths,
      actions: actions.length ? actions : fallback.actions,
      engine: ctx.engine,
      generatedAt: Date.now(),
      evidenceDropped: dropped,
    };
    return NextResponse.json(card);
  } catch (e) {
    return NextResponse.json(fromFallback(`Model unavailable (${(e as Error).message}); scored with the built-in rubric.`));
  }
}
