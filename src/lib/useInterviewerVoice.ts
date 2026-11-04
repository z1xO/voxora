"use client";
// The interviewer's voice. "neural" uses Kokoro running locally in a worker; "system" uses the best
// voice the OS/browser offers (preferring natural/neural voices); "off" stays silent.
// A line is never left silent: if natural audio hasn't started in time, or synthesis fails, that
// line is spoken with the system voice instead.
import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceMode = "neural" | "system" | "off";

export const NEURAL_VOICES = [
  { id: "af_heart", label: "Heart", detail: "US English, warm" },
  { id: "am_michael", label: "Michael", detail: "US English, calm" },
  { id: "bf_emma", label: "Emma", detail: "UK English, clear" },
  { id: "bm_george", label: "George", detail: "UK English, steady" },
] as const;

export type VoiceLoad = "idle" | "loading" | "ready" | "error";

/** Once the natural voice is ready: how long to wait for a line's first audio before using the system voice. */
const FIRST_AUDIO_TIMEOUT_MS = 6000;
/** While the natural voice is still loading, lines wait for it (rather than sounding robotic) up to this long. */
const LOAD_WAIT_MS = 120_000;

/** Picks the most natural-sounding English system voice available. */
export function bestSystemVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural/i.test(v.name) ? 100 : 0) + (/online/i.test(v.name) ? 40 : 0) + (/google/i.test(v.name) ? 30 : 0) + (/^en-us/i.test(v.lang) ? 10 : 0) + (v.localService ? 0 : 5);
  return voices.sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function useInterviewerVoice(opts: { mode: VoiceMode; voice: string; onSpeakingChange?: (speaking: boolean) => void }) {
  const [load, setLoad] = useState<VoiceLoad>("idle");
  const [progress, setProgress] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [device, setDevice] = useState<"webgpu" | "wasm" | null>(null);
  const [fellBack, setFellBack] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextStartRef = useRef(0);
  const idRef = useRef(0);
  const doneRef = useRef(false);
  const lineRef = useRef<{ id: number; text: string; gotAudio: boolean } | null>(null);
  const firstAudioTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<VoiceLoad>("idle");
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const setLoadState = useCallback((v: VoiceLoad) => {
    loadRef.current = v;
    setLoad(v);
  }, []);

  const setSpeakingState = useCallback((v: boolean) => {
    setSpeaking(v);
    optsRef.current.onSpeakingChange?.(v);
  }, []);

  const speakSystem = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return setSpeakingState(false);
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = bestSystemVoice();
      if (v) u.voice = v;
      u.onstart = () => setSpeakingState(true);
      u.onend = u.onerror = () => setSpeakingState(false);
      window.speechSynthesis.speak(u);
    },
    [setSpeakingState],
  );

  /** Abandons natural synthesis for the current line and says it with the system voice. */
  const fallBackForLine = useCallback(() => {
    const line = lineRef.current;
    if (!line || line.gotAudio) return;
    idRef.current++; // ignore any late chunks for this line
    workerRef.current?.postMessage({ type: "cancel" });
    lineRef.current = null;
    speakSystem(line.text);
  }, [speakSystem]);

  const maybeFinished = useCallback(() => {
    if (doneRef.current && sourcesRef.current.length === 0) setSpeakingState(false);
  }, [setSpeakingState]);

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const w = new Worker(new URL("../workers/tts.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") setProgress(Math.round(m.progress));
      else if (m.type === "ready") {
        setLoadState("ready");
        if (m.device) setDevice(m.device);
        // A line was waiting on the model: it's about to be synthesized, so switch to the short timeout.
        const line = lineRef.current;
        if (line && !line.gotAudio) {
          setSpeakingState(true);
          if (firstAudioTimer.current) clearTimeout(firstAudioTimer.current);
          firstAudioTimer.current = setTimeout(fallBackForLine, FIRST_AUDIO_TIMEOUT_MS);
        }
      } else if (m.type === "chunk" && m.id === idRef.current) {
        setLoadState("ready");
        const line = lineRef.current;
        if (line && line.id === m.id) line.gotAudio = true;
        if (firstAudioTimer.current) clearTimeout(firstAudioTimer.current);
        const ctx = (ctxRef.current ??= new AudioContext());
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const buffer = ctx.createBuffer(1, m.audio.length, m.sampleRate);
        buffer.copyToChannel(m.audio, 0);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        const startAt = Math.max(ctx.currentTime + 0.05, nextStartRef.current);
        src.start(startAt);
        nextStartRef.current = startAt + buffer.duration + 0.12; // a short breath between sentences
        sourcesRef.current.push(src);
        if (sourcesRef.current.length === 1) setSpeakingState(true);
        let finished = false;
        const end = () => {
          if (finished) return;
          finished = true;
          sourcesRef.current = sourcesRef.current.filter((s) => s !== src);
          maybeFinished();
        };
        src.onended = end;
        // If the browser blocks audio (suspended context), onended never fires; fall back to wall-clock time
        // so the interviewer never stays "speaking" (and the mic muted) forever.
        setTimeout(end, (startAt - ctx.currentTime + buffer.duration) * 1000 + 1500);
      } else if (m.type === "done" && m.id === idRef.current) {
        doneRef.current = true;
        maybeFinished();
      } else if (m.type === "error") {
        console.warn(`Natural voice error, using the system voice instead: ${m.error}`);
        if (m.id === undefined) setLoadState("error");
        if (m.id === undefined || m.id === idRef.current) {
          setFellBack(true);
          if (firstAudioTimer.current) clearTimeout(firstAudioTimer.current);
          fallBackForLine();
          if (!lineRef.current) setSpeakingState(false);
        }
      }
    };
    workerRef.current = w;
    return w;
  }, [fallBackForLine, maybeFinished, setLoadState, setSpeakingState]);

  /** Start downloading/compiling the neural voice early so the first line isn't delayed. */
  const preload = useCallback(() => {
    if (optsRef.current.mode !== "neural" || loadRef.current !== "idle") return;
    setLoadState("loading");
    ensureWorker().postMessage({ type: "load" });
  }, [ensureWorker, setLoadState]);

  const stop = useCallback(() => {
    idRef.current++;
    lineRef.current = null;
    if (firstAudioTimer.current) clearTimeout(firstAudioTimer.current);
    workerRef.current?.postMessage({ type: "cancel" });
    sourcesRef.current.forEach((s) => {
      s.onended = null;
      try {
        s.stop();
      } catch {}
    });
    sourcesRef.current = [];
    nextStartRef.current = 0;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setSpeakingState(false);
  }, [setSpeakingState]);

  /** Speaks a line. `voiceOverride` lets a preview use a voice before the selection state has updated. */
  const speak = useCallback(
    (text: string, voiceOverride?: string) => {
      const { mode, voice } = optsRef.current;
      stop();
      if (mode === "off" || !text.trim()) return;
      if (mode === "system" || loadRef.current === "error") return speakSystem(text);
      // Create/resume the audio context now, ideally inside the click that triggered this.
      const ctx = (ctxRef.current ??= new AudioContext());
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      doneRef.current = false;
      if (loadRef.current === "idle") setLoadState("loading");
      const id = idRef.current;
      lineRef.current = { id, text, gotAudio: false };
      if (loadRef.current === "ready") {
        setSpeakingState(true); // show "speaking" (and mute the mic) while the first sentence is synthesized
        firstAudioTimer.current = setTimeout(fallBackForLine, FIRST_AUDIO_TIMEOUT_MS);
      } else {
        // Still loading: wait for the natural voice instead of falling back to the robotic one.
        // The mic stays live meanwhile; the "ready" handler starts the normal timeout.
        firstAudioTimer.current = setTimeout(fallBackForLine, LOAD_WAIT_MS);
      }
      ensureWorker().postMessage({ type: "speak", id, text, voice: voiceOverride ?? voice, speed: 1 });
    },
    [ensureWorker, fallBackForLine, setLoadState, setSpeakingState, speakSystem, stop],
  );

  useEffect(() => {
    // Voices load asynchronously in some browsers; touching the list early makes them available sooner.
    if (typeof window !== "undefined") window.speechSynthesis?.getVoices();
    return () => {
      stop();
      workerRef.current?.terminate();
      workerRef.current = null;
      loadRef.current = "idle";
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, [stop]);

  return { speak, stop, preload, speaking, load, progress, device, fellBack };
}
