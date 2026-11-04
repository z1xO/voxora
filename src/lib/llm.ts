import "server-only";
import type { Engine, HealthStatus } from "./types";

const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";
// Warm-up and chat must use the same context size, or Ollama reloads the model.
const NUM_CTX = 8192;
const HOSTED_URL = (process.env.HOSTED_LLM_BASE_URL || "").replace(/\/$/, "");
const HOSTED_KEY = process.env.HOSTED_LLM_API_KEY || "";
const HOSTED_MODEL = process.env.HOSTED_LLM_MODEL || "llama-3.1-8b-instant";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function llmHealth(): Promise<Omit<HealthStatus, "sandbox">> {
  let local: HealthStatus["local"];
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500), cache: "no-store" });
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    const has = names.some((n) => n === OLLAMA_MODEL || n === `${OLLAMA_MODEL}:latest` || n.split(":")[0] === OLLAMA_MODEL);
    local = has
      ? { available: true, model: OLLAMA_MODEL, detail: `Ollama is running with ${OLLAMA_MODEL}.` }
      : { available: false, model: OLLAMA_MODEL, detail: `Ollama is running but ${OLLAMA_MODEL} is not pulled. Run: ollama pull ${OLLAMA_MODEL}` };
  } catch {
    local = { available: false, model: OLLAMA_MODEL, detail: `Ollama is not reachable at ${OLLAMA_URL}. Install it from ollama.com, then run: ollama pull ${OLLAMA_MODEL}` };
  }
  const hosted: HealthStatus["hosted"] =
    HOSTED_URL && HOSTED_KEY
      ? { available: true, model: HOSTED_MODEL, detail: `Hosted endpoint at ${new URL(HOSTED_URL).host}.` }
      : { available: false, model: HOSTED_MODEL, detail: "No hosted endpoint configured (set HOSTED_LLM_BASE_URL and HOSTED_LLM_API_KEY)." };
  return { local, hosted };
}

/** Loads the local model into memory ahead of the interview so the first question isn't delayed by a cold start. */
export async function warmLocalModel() {
  await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, keep_alive: "30m", options: { num_ctx: NUM_CTX } }),
    signal: AbortSignal.timeout(180_000),
  });
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Model did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/** Calls the interviewer model and parses a JSON object from its reply. Throws on any failure so callers can fall back. */
export async function chatJson<T>(engine: Engine, messages: ChatMessage[], opts: { temperature?: number; timeoutMs?: number; maxTokens?: number } = {}): Promise<T> {
  const temperature = opts.temperature ?? 0.4;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 45_000);
  if (engine === "local") {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        format: "json",
        keep_alive: "30m",
        options: { temperature, num_predict: opts.maxTokens ?? 400, num_ctx: NUM_CTX },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return extractJson(data.message?.content ?? "") as T;
  }
  if (engine === "hosted") {
    if (!HOSTED_URL || !HOSTED_KEY) throw new Error("Hosted endpoint not configured");
    const res = await fetch(`${HOSTED_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${HOSTED_KEY}` },
      body: JSON.stringify({
        model: HOSTED_MODEL,
        messages,
        temperature,
        max_tokens: opts.maxTokens ?? 400,
        response_format: { type: "json_object" },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Hosted endpoint error ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return extractJson(data.choices?.[0]?.message?.content ?? "") as T;
  }
  throw new Error("Offline engine has no model");
}
