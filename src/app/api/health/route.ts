import { NextResponse } from "next/server";
import { llmHealth } from "@/lib/llm";
import { sandboxStatus } from "@/lib/runner";
import type { HealthStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const llm = await llmHealth();
  const body: HealthStatus = { ...llm, sandbox: sandboxStatus() };
  return NextResponse.json(body);
}
