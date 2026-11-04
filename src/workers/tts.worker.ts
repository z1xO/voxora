/// <reference lib="webworker" />
// Neural text-to-speech for the interviewer, running locally with Kokoro-82M (kokoro-js + ONNX/WASM).
// Text is split into sentences and each one is synthesized and sent back as soon as it's ready,
// so playback starts after the first sentence instead of the whole reply.
import { KokoroTTS } from "kokoro-js";
import { env } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// Load the model from this app's own server first (public/models, filled by `npm run models:fetch`).
// Browsers often refuse to cache the ~330 MB GPU model, so without this it re-downloads on every visit.
// If the local files aren't there, transformers.js falls back to downloading from Hugging Face.
env.allowLocalModels = true;
env.localModelPath = "/models/";
env.allowRemoteModels = true;

let tts: KokoroTTS | null = null;
let loading: Promise<void> | null = null;
let current = 0;

let device: "webgpu" | "wasm" = "wasm";

const progress_callback = (p: { status: string; progress?: number }) => {
  if (p.status === "progress" && typeof p.progress === "number") self.postMessage({ type: "progress", progress: p.progress });
};

async function hasWebGpu() {
  try {
    const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/** Removes this model's entries from the browser cache (a download interrupted mid-way can leave a truncated file there). */
async function clearModelCache() {
  try {
    const cache = await caches.open("transformers-cache");
    for (const req of await cache.keys()) if (req.url.includes(MODEL_ID)) await cache.delete(req);
  } catch {}
}

/** Loads the model; if it fails, assumes a corrupted cached copy, clears it, and tries once more. */
async function loadWithRepair(dtype: "fp32" | "q8", dev: "webgpu" | "wasm") {
  try {
    return await KokoroTTS.from_pretrained(MODEL_ID, { dtype, device: dev, progress_callback });
  } catch {
    await clearModelCache();
    return await KokoroTTS.from_pretrained(MODEL_ID, { dtype, device: dev, progress_callback });
  }
}

async function load() {
  if (tts) return;
  loading ??= (async () => {
    // On the GPU, synthesis runs many times faster than real time; on the CPU it can fall behind,
    // which leaves audible gaps between sentences. Prefer WebGPU and fall back to WASM.
    if (await hasWebGpu()) {
      try {
        tts = await loadWithRepair("fp32", "webgpu");
        device = "webgpu";
      } catch {
        tts = null;
      }
    }
    tts ??= await loadWithRepair("q8", "wasm");
    // Synthesize once so the first real line doesn't pay the warm-up cost.
    await tts.generate("Okay.", { voice: "af_heart" });
  })();
  try {
    await loading;
  } catch (e) {
    loading = null; // allow a retry on the next request
    throw e;
  }
}

function sentences(text: string): string[] {
  const parts = (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  // A long opening sentence delays the first sound; split it at its first comma so playback starts sooner.
  const first = parts[0];
  const comma = first?.indexOf(", ") ?? -1;
  if (first && first.split(/\s+/).length > 10 && comma > 8) parts.splice(0, 1, first.slice(0, comma + 1), first.slice(comma + 2));
  return parts;
}

type Msg = { type: "load" } | { type: "speak"; id: number; text: string; voice: string; speed?: number } | { type: "cancel" };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load();
      self.postMessage({ type: "ready", device });
    } else if (msg.type === "cancel") {
      current = -1;
    } else if (msg.type === "speak") {
      current = msg.id;
      await load();
      for (const sentence of sentences(msg.text)) {
        if (current !== msg.id) return; // superseded or cancelled
        const out = await tts!.generate(sentence, { voice: msg.voice as never, speed: msg.speed ?? 1 });
        if (current !== msg.id) return;
        const audio = out.audio as Float32Array;
        self.postMessage({ type: "chunk", id: msg.id, audio, sampleRate: out.sampling_rate }, [audio.buffer]);
      }
      self.postMessage({ type: "done", id: msg.id });
    }
  } catch (err) {
    self.postMessage({ type: "error", id: "id" in msg ? msg.id : undefined, error: (err as Error).message });
  }
};
