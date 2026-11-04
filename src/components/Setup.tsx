"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Problem } from "@/lib/problems";
import type { Engine, HealthStatus } from "@/lib/types";
import { NEURAL_VOICES, type VoiceMode } from "@/lib/useInterviewerVoice";
import { Prose } from "./Prose";
import { preloadBrowserPython } from "@/lib/browserRunner";
import { withViewTransition } from "@/lib/viewTransition";
import { IconArrowLeft, IconArrowRight, IconCheck, IconPause, IconShield, IconSpeaker } from "./Icons";

export interface SessionConfig {
  engine: Engine;
  voice: boolean;
  voiceMode: VoiceMode;
  voiceId: string;
  save: boolean;
}

export interface VoiceControls {
  mode: VoiceMode;
  voiceId: string;
  setMode: (m: VoiceMode) => void;
  setVoiceId: (v: string) => void;
  preview: (voiceId?: string) => void;
  stopPreview: () => void;
  preload: () => void;
  device: "webgpu" | "wasm" | null;
  speaking: boolean;
  load: "idle" | "loading" | "ready" | "error";
  progress: number;
  fellBack: boolean;
}

export function Setup({ problem, voice, onStart }: { problem: Problem; voice: VoiceControls; onStart: (c: SessionConfig) => void }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [speak, setSpeak] = useState(true);
  const [save, setSave] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: HealthStatus) => {
        setHealth(h);
        // No server sandbox: start fetching browser Python now so the first Run is quick.
        if (h.sandbox.mode === "unavailable") preloadBrowserPython();
        setEngine((cur) => cur ?? (h.local.available ? "local" : h.hosted.available ? "hosted" : "offline"));
      })
      .catch(() => setEngine("offline"));
  }, []);

  // Start loading the local model while the candidate reads the problem.
  useEffect(() => {
    if (engine === "local") fetch("/api/warmup", { method: "POST" }).catch(() => {});
  }, [engine]);

  // Likewise for the neural voice.
  const { mode: voiceMode, preload } = voice;
  useEffect(() => {
    if (voiceMode === "neural") preload();
  }, [voiceMode, preload]);

  const engines: { id: Engine; title: string; available: boolean; detail: string }[] = [
    { id: "local", title: "Local Llama", available: !!health?.local.available, detail: health?.local.detail ?? "Checking…" },
    { id: "hosted", title: "Hosted Llama", available: !!health?.hosted.available, detail: health?.hosted.detail ?? "Checking…" },
    { id: "offline", title: "Built-in coach", available: true, detail: "Rule-based interviewer and rubric. Runs anywhere; questions are less tailored." },
  ];

  const dataFlow =
    engine === "hosted"
      ? "Your transcript text, code, and code summaries go to the hosted model endpoint. Audio is never sent."
      : engine === "local"
        ? "Your transcript, code, and code summaries stay on this machine and go only to Ollama."
        : "Nothing leaves this machine.";

  const voiceStatus =
    voice.mode !== "neural"
      ? null
      : voice.fellBack
        ? "Natural voice couldn't load here, so the system voice will be used."
        : voice.load === "loading"
          ? `Loading natural voice${voice.progress ? ` · ${voice.progress}%` : "…"}`
          : voice.load === "ready"
            ? `Natural voice ready · running on ${voice.device === "webgpu" ? "your GPU" : "the CPU"}`
            : null;

  return (
    <main className="container page view-enter">
      <Link href="/" className="back-link">
        <IconArrowLeft /> All problems
      </Link>
      <div className="setup">
        <section className="card stack rise" aria-labelledby="problem-title" style={{ gap: 14 }}>
          <div className="spread" style={{ alignItems: "flex-start" }}>
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">{problem.topic}</span>
              <h1 id="problem-title" style={{ fontSize: 26 }}>
                {problem.title}
              </h1>
            </div>
            <span className={`pill ${problem.difficulty.toLowerCase()}`}>{problem.difficulty}</span>
          </div>
          <Prose text={problem.prompt} />
          {problem.examples.map((e, i) => (
            <div key={i} className="example">
              Input: {e.input}
              {"\n"}Output: {e.output}
              {e.explanation ? `\n# ${e.explanation}` : ""}
            </div>
          ))}
          <div className="small muted">
            <strong style={{ color: "var(--text)" }}>Constraints</strong>
            <ul className="tight">
              {problem.constraints.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div className="notice info">
            Talk through your thinking as you code. Like a real interviewer, Voxora mostly listens: it answers your questions, checks in at
            natural moments, and never hands you the solution. You can ask for up to three hints.
          </div>
        </section>

        <section className="stack" style={{ gap: 16 }}>
          <div className="card rise" style={{ "--i": 1 } as React.CSSProperties}>
            <h2 className="section-title">Interviewer</h2>
            <div className="stack" style={{ gap: 8 }} role="radiogroup" aria-label="Interviewer processing">
              {engines.map((e) => (
                <label key={e.id} className={`option ${engine === e.id ? "selected" : ""} ${!e.available ? "disabled" : ""}`}>
                  <input type="radio" name="engine" disabled={!e.available} checked={engine === e.id} onChange={() => setEngine(e.id)} />
                  <span>
                    <span className="title">
                      <span className={`dot ${e.available ? "ok" : health ? "bad" : ""}`} /> {e.title}
                    </span>
                    <span className="detail">{e.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="card rise" style={{ "--i": 2 } as React.CSSProperties}>
            <h2 className="section-title">Interviewer voice</h2>
            <div className="segmented has-thumb" role="group" aria-label="Voice type" style={{ marginBottom: 12 }}>
              {(
                [
                  ["neural", "Natural"],
                  ["system", "System"],
                  ["off", "Off"],
                ] as const
              ).map(([m, label]) => (
                <button key={m} aria-pressed={voice.mode === m} onClick={() => voice.mode !== m && withViewTransition(() => voice.setMode(m))}>
                  {voice.mode === m && <span className="thumb" style={{ viewTransitionName: "voice-mode-thumb" }} aria-hidden="true" />}
                  {label}
                </button>
              ))}
            </div>
            {voice.mode === "neural" && (
              <div className="voice-grid" role="group" aria-label="Natural voice">
                {NEURAL_VOICES.map((v) => (
                  <button
                    key={v.id}
                    className="voice-chip"
                    aria-pressed={voice.voiceId === v.id}
                    onClick={() => {
                      // Picking a voice plays a short sample in that voice right away.
                      voice.setVoiceId(v.id);
                      voice.preview(v.id);
                    }}
                  >
                    <span>
                      <span className="name">{v.label}</span>
                      <br />
                      <span className="sub">{v.detail}</span>
                    </span>
                    {voice.voiceId === v.id && <IconCheck color="var(--accent)" />}
                  </button>
                ))}
              </div>
            )}
            <p className="small muted" style={{ marginTop: 10 }}>
              {voice.mode === "neural"
                ? "A human-sounding neural voice (Kokoro) generated on your device. First use downloads it once (about 330 MB with a GPU, 90 MB without). Click a voice to hear it."
                : voice.mode === "system"
                  ? "Uses your browser's best built-in voice. Instant, but more robotic."
                  : "The interviewer's messages appear as text only."}
            </p>
            {voice.mode !== "off" && (
              <div className="row wrap" style={{ marginTop: 12 }}>
                <button className="btn sm" onClick={() => (voice.speaking ? voice.stopPreview() : voice.preview())}>
                  {voice.speaking ? <IconPause size={14} /> : <IconSpeaker />} {voice.speaking ? "Stop" : "Preview voice"}
                </button>
                {voiceStatus && (
                  <span className="small subtle" aria-live="polite">
                    {voiceStatus}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="card rise" style={{ "--i": 3 } as React.CSSProperties}>
            <h2 className="section-title">Your input &amp; privacy</h2>
            <div className="stack" style={{ gap: 8 }}>
              <label className={`option ${speak ? "selected" : ""}`}>
                <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
                <span>
                  <span className="title">Speak my answers</span>
                  <span className="detail">Whisper transcribes on your device. The mic is requested only when you press the mic button.</span>
                </span>
              </label>
              <label className={`option ${save ? "selected" : ""}`}>
                <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
                <span>
                  <span className="title">Save this session in my browser</span>
                  <span className="detail">Transcript and scorecard only. Delete it any time from Saved sessions.</span>
                </span>
              </label>
            </div>
            <ul className="privacy-list" style={{ marginTop: 14 }}>
              <li>
                <IconShield size={14} /> Raw audio is discarded right after each phrase is transcribed.
              </li>
              <li>
                <IconShield size={14} /> {dataFlow}
              </li>
              <li>
                <IconShield size={14} /> {!health
                  ? "Checking the code sandbox…"
                  : health.sandbox.mode === "unavailable"
                    ? "Code runs in your browser (Python via Pyodide), isolated from the server. The first run downloads Python (about 10 MB)."
                    : `Code runs in: ${health.sandbox.detail}`}
              </li>
            </ul>
            {health?.sandbox.mode === "local-unsandboxed" && (
              <div className="notice" style={{ marginTop: 12 }}>
                Code execution isn&apos;t isolated in this setup. Start Docker for real sandboxing.
              </div>
            )}
          </div>

          <div className="start-bar">
            <button
              className="btn primary lg"
              style={{ width: "100%" }}
              disabled={!engine}
              onClick={() => engine && onStart({ engine, voice: speak, voiceMode: voice.mode, voiceId: voice.voiceId, save })}
            >
              Start interview <IconArrowRight />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
