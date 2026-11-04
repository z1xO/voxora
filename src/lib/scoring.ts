import type { Category, CategoryScore, Evidence, SessionContext } from "./types";
import { CATEGORIES } from "./types";
import { describeRun } from "./signals";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[“”"'‘’`]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s.,;:!?-]+|[\s.,;:!?-]+$/g, "")
    .trim();

/** Which kinds of evidence can support each category. Communication and complexity are about what the
 * candidate said, so code or test output can't stand in for them. */
export const ALLOWED_EVIDENCE: Record<Category, Evidence["type"][]> = {
  problemSolving: ["transcript", "code", "run"],
  communication: ["transcript"],
  complexity: ["transcript"],
  edgeCases: ["transcript", "code"],
};

/** Below this many candidate words, there's too little speech to judge communication at all. */
const MIN_WORDS_FOR_COMMUNICATION = 15;

/** Keeps only evidence that actually appears in the session: candidate speech, code, or run logs. */
export function verifyEvidence(ctx: SessionContext, evidence: Evidence[], snapshots: string[] = [], allowed: Evidence["type"][] = ["transcript", "code", "run"]) {
  const corpora: Record<Evidence["type"], string> = {
    transcript: norm(ctx.turns.filter((t) => t.role === "candidate").map((t) => t.text).join(" \n ")),
    code: norm([ctx.code, ...snapshots].join("\n")),
    run: norm(ctx.runs.map((r, i) => describeRun(r, i + 1)).join("\n")),
  };
  const kept: Evidence[] = [];
  let dropped = 0;
  for (const e of evidence) {
    const q = norm(e?.quote ?? "");
    if (q.length < 6) {
      dropped++;
      continue;
    }
    const type = allowed.find((k) => corpora[k].includes(q));
    if (type) kept.push({ type, quote: e.quote.trim() });
    else dropped++;
  }
  return { kept: kept.slice(0, 2), dropped };
}

interface RawCategory {
  score?: unknown;
  rationale?: unknown;
  evidence?: unknown;
}

/** Validates a model's scorecard: scores without verifiable evidence become "insufficient evidence". */
export function validateModelScores(ctx: SessionContext, raw: { categories?: Record<string, RawCategory> }) {
  let dropped = 0;
  const categories: CategoryScore[] = CATEGORIES.map((category: Category) => {
    const r = raw.categories?.[category] ?? {};
    const ev = Array.isArray(r.evidence) ? (r.evidence as Evidence[]) : [];
    const v = verifyEvidence(ctx, ev, [], ALLOWED_EVIDENCE[category]);
    dropped += v.dropped;
    let score = typeof r.score === "number" && r.score >= 1 && r.score <= 5 ? Math.round(r.score) : null;
    let rationale = typeof r.rationale === "string" ? r.rationale.trim() : "";
    const candidateWords = ctx.turns.filter((t) => t.role === "candidate").reduce((n, t) => n + t.text.split(/\s+/).filter(Boolean).length, 0);
    if (category === "communication" && candidateWords < MIN_WORDS_FOR_COMMUNICATION) {
      return { category, score: null, rationale: "You didn't say enough during the session to judge communication. Narrate your thinking as you go.", evidence: [] };
    }
    if (score !== null && v.kept.length === 0) {
      score = null;
      rationale = `${rationale ? `${rationale} ` : ""}(The model's supporting quotes couldn't be found in your session, so this was marked insufficient evidence rather than guessed.)`;
    }
    if (!rationale) rationale = score === null ? "The session didn't cover this enough to score it." : "";
    return { category, score, rationale, evidence: score === null ? [] : v.kept };
  });
  return { categories, dropped };
}
