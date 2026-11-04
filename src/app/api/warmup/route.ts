import { NextResponse } from "next/server";
import { warmLocalModel } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST() {
  try {
    await warmLocalModel();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
