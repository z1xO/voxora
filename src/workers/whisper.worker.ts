/// <reference lib="webworker" />
// Speech-to-text runs entirely in the browser with Whisper (transformers.js + ONNX/WASM).
// Audio never leaves this worker; only the model weights are downloaded once and cached.
import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loading: Promise<void> | null = null;

// Whisper tends to "hear" these in silence or noise; drop them rather than show them as speech.
const HALLUCINATION = /^\s*(\[.*\]|\(.*\)|thank you\.?|thanks for watching.*|you\.?|bye\.?|\.+)\s*$/i;

async function load(model: string) {
  if (asr) return;
  loading ??= (async () => {
    // Cast avoids TypeScript's "union too complex" error on pipeline()'s overloads.
    const create = pipeline as unknown as (task: string, model: string, opts: object) => Promise<AutomaticSpeechRecognitionPipeline>;
    asr = await create("automatic-speech-recognition", model, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p: { status: string; progress?: number; file?: string }) => {
        if (p.status === "progress" && typeof p.progress === "number") {
          self.postMessage({ type: "progress", progress: p.progress, file: p.file });
        }
      },
    });
  })();
  await loading;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: "load"; model: string } | { type: "transcribe"; id: number; audio: Float32Array };
  try {
    if (msg.type === "load") {
      await load(msg.model);
      self.postMessage({ type: "ready" });
    } else if (msg.type === "transcribe") {
      if (!asr) throw new Error("Model not loaded");
      const out = (await asr(msg.audio, { chunk_length_s: 30 })) as { text: string };
      const text = (out.text ?? "").trim();
      self.postMessage({ type: "result", id: msg.id, text: HALLUCINATION.test(text) ? "" : text });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: "id" in msg ? msg.id : undefined, error: (err as Error).message });
  }
};
