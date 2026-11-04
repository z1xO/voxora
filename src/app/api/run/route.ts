import { NextResponse } from "next/server";
import { getProblem } from "@/lib/problems";
import { runSampleTests } from "@/lib/runner";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { problemId, code } = (await req.json()) as { problemId?: string; code?: string };
  const problem = problemId ? getProblem(problemId) : undefined;
  if (!problem || typeof code !== "string") {
    return NextResponse.json({ error: "problemId and code are required" }, { status: 400 });
  }
  const outcome = await runSampleTests(problem, code);
  const passed = outcome.cases.filter((c) => c.passed).length;
  return NextResponse.json({ ...outcome, passed, total: problem.tests.length });
}
