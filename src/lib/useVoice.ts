"use client";
// Microphone capture with a simple energy-based voice activity detector. Each utterance (speech
// followed by a pause) is resampled to 16 kHz and handed to the Whisper worker. Raw audio is
// discarded right after transcription and is never stored or uploaded.
import { useCallback, useEffect, useRef, useState } from "react";

export const WHISPER_MODEL = "Xenova/whisper-base.en";

export type VoiceStatus = "off" | "loading" | "listening" | "error";

const TARGET_RATE = 16_000;
const SILENCE_MS = 900;
const MIN_SPEECH_MS = 350;
const MAX_UTTERANCE_MS = 20_000;
const PREROLL_MS = 300;

function resample(chunks: Float32Array[], fromRate: number): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    input.set(c, o);
    o += c.length;
  }
  if (fromRate === TARGET_RATE) return input;
  const ratio = fromRate / TARGET_RATE;
  const out = new Float32Array(Math.floor(total / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, total - 1);
    out[i] = input[i0] + (input[i1] - input[i0]) * (x - i0);
  }
  return out;
}

export function useVoice(onUtterance: (text: string) => void) {
  const [status, setStatus] = useState<VoiceStatus>("off");
  const [speaking, setSpeaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const speakingRef = useRef(false);
  const onUtteranceRef = useRef(onUtterance);
  const idRef = useRef(0);
  onUtteranceRef.current = onUtterance;

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const w = new Worker(new URL("../workers/whisper.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") setProgress(Math.round(m.progress));
      else if (m.type === "ready") {
        readyRef.current = true;
        setProgress(100);
      } else if (m.type === "result") {
        setPending((n) => Math.max(0, n - 1));
        if (m.text) onUtteranceRef.current(m.text);
      } else if (m.type === "error") {
        setPending((n) => Math.max(0, n - 1));
        setError(`Transcription failed: ${m.error}`);
      }
    };
    workerRef.current = w;
    return w;
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    speakingRef.current = false;
    setSpeaking(false);
    setStatus("off");
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("loading");
    try {
      const worker = ensureWorker();
      if (!readyRef.current) {
        await new Promise<void>((resolve, reject) => {
          const handler = (e: MessageEvent) => {
            if (e.data.type === "ready") {
              worker.removeEventListener("message", handler);
              resolve();
            } else if (e.data.type === "error" && e.data.id === undefined) {
              worker.removeEventListener("message", handler);
              reject(new Error(e.data.error));
            }
          };
          worker.addEventListener("message", handler);
          worker.postMessage({ type: "load", model: WHISPER_MODEL });
        });
      }

      // Microphone permission is requested only here, after the user chose to start voice.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      const frameMs = (2048 / ctx.sampleRate) * 1000;

      let noiseFloor = 0.005;
      let loudFrames = 0;
      let silentMs = 0;
      let speechMs = 0;
      let chunks: Float32Array[] = [];
      const preroll: Float32Array[] = [];

      const flush = () => {
        if (speechMs >= MIN_SPEECH_MS) {
          const audio = resample(chunks, ctx.sampleRate);
          setPending((n) => n + 1);
          workerRef.current?.postMessage({ type: "transcribe", id: ++idRef.current, audio }, [audio.buffer]);
        }
        chunks = [];
        speechMs = 0;
        silentMs = 0;
        speakingRef.current = false;
        setSpeaking(false);
      };

      proc.onaudioprocess = (ev) => {
        const frame = new Float32Array(ev.inputBuffer.getChannelData(0));
        if (mutedRef.current) {
          if (speakingRef.current) flush();
          return;
        }
        let sum = 0;
        for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
        const rms = Math.sqrt(sum / frame.length);
        const threshold = Math.max(0.012, noiseFloor * 3);

        if (!speakingRef.current) {
          noiseFloor = noiseFloor * 0.95 + rms * 0.05;
          preroll.push(frame);
          while (preroll.length * frameMs > PREROLL_MS) preroll.shift();
          loudFrames = rms > threshold ? loudFrames + 1 : 0;
          if (loudFrames >= 2) {
            speakingRef.current = true;
            setSpeaking(true);
            chunks = [...preroll];
            preroll.length = 0;
            speechMs = frameMs * 2;
          }
          return;
        }
        chunks.push(frame);
        if (rms > threshold) {
          speechMs += frameMs;
          silentMs = 0;
        } else {
          silentMs += frameMs;
        }
        if (silentMs >= SILENCE_MS || chunks.length * frameMs >= MAX_UTTERANCE_MS) flush();
      };

      source.connect(proc);
      proc.connect(ctx.destination);
      setStatus("listening");
    } catch (e) {
      const err = e as Error;
      const msg =
        err.name === "NotAllowedError"
          ? "Microphone access was blocked. You can keep going by typing."
          : err.name === "NotFoundError"
            ? "No microphone found. You can keep going by typing."
            : `Voice unavailable: ${err.message}`;
      setError(msg);
      stop();
      setStatus("error");
    }
  }, [ensureWorker, stop]);

  /** Mute capture while the interviewer's voice plays, so it isn't transcribed as the candidate. */
  const setMuted = useCallback((m: boolean) => {
    mutedRef.current = m;
  }, []);

  useEffect(
    () => () => {
      stop();
      workerRef.current?.terminate();
      workerRef.current = null;
      readyRef.current = false;
    },
    [stop],
  );

  return { status, speaking, speakingRef, progress, pending, error, start, stop, setMuted };
}
