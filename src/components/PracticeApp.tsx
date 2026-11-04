"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { getProblem } from "@/lib/problems";
import { deleteSession, saveSession } from "@/lib/storage";
import { useInterviewerVoice, type VoiceMode } from "@/lib/useInterviewerVoice";
import type { SavedSession, Scorecard, SessionContext } from "@/lib/types";
import { Setup, type SessionConfig } from "./Setup";
import { ScorecardView } from "./ScorecardView";
import type { InterviewResult, RoomVoice } from "./InterviewRoom";
import { IconArrowRight, IconCheck, IconTrash } from "./Icons";

// Monaco and the audio pipeline are browser-only.
const InterviewRoom = dynamic(() => import("./InterviewRoom").then((m) => m.InterviewRoom), {
  ssr: false,
  loading: () => (
    <div className="container page">
      <div className="skeleton" style={{ height: "60vh" }} />
    </div>
  ),
});

type Stage = { name: "setup" } | { name: "interview"; config: SessionConfig } | { name: "review"; config: SessionConfig; session: SavedSession | null; error?: string };

const PREVIEW_LINE = "Hi, I'm your interviewer today. Whenever you're ready, walk me through how you'd approach this problem.";

export function PracticeApp({ problemId }: { problemId: string }) {
  const problem = getProblem(problemId);
  const [stage, setStage] = useState<Stage>({ name: "setup" });
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("neural");
  const [voiceId, setVoiceId] = useState("af_heart");

  // One voice engine for the whole practice flow, so the model loaded for the preview is reused in the interview.
  const speakingListener = useRef<((speaking: boolean) => void) | null>(null);
  const tts = useInterviewerVoice({ mode: voiceMode, voice: voiceId, onSpeakingChange: (s) => speakingListener.current?.(s) });

  const onSpeakingChange = useCallback((fn: ((speaking: boolean) => void) | null) => {
    speakingListener.current = fn;
  }, []);
  const { speak, stop, speaking } = tts;
  const voiceLoading = voiceMode === "neural" && tts.load === "loading";
  const roomVoice: RoomVoice = useMemo(
    () => ({ speak, stop, speaking, loading: voiceLoading, onSpeakingChange }),
    [speak, stop, speaking, voiceLoading, onSpeakingChange],
  );

  if (!problem) {
    return (
      <main className="container page stack">
        <h1>That problem doesn&apos;t exist.</h1>
        <Link href="/">Back to problems</Link>
      </main>
    );
  }

  const finish = async (config: SessionConfig, r: InterviewResult) => {
    setStage({ name: "review", config, session: null });
    const ctx: SessionContext = {
      problemId: problem.id,
      engine: config.engine,
      elapsed: r.elapsed,
      turns: r.turns,
      codeEvents: r.codeEvents.map(({ snapshot: _s, ...e }) => e),
      runs: r.runs,
      code: r.finalCode,
      hintsUsed: r.hintsUsed,
    };
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctx, snapshots: r.codeEvents.map((e) => e.snapshot) }),
      });
      if (!res.ok) throw new Error(`Scoring failed (${res.status})`);
      const scorecard = (await res.json()) as Scorecard;
      const session: SavedSession = {
        id: crypto.randomUUID(),
        problemId: problem.id,
        problemTitle: problem.title,
        startedAt: r.startedAt,
        durationSec: r.elapsed,
        engine: config.engine,
        turns: r.turns,
        codeEvents: ctx.codeEvents,
        runs: r.runs,
        finalCode: r.finalCode,
        hintsUsed: r.hintsUsed,
        scorecard,
      };
      if (config.save) setSaved(saveSession(session));
      setStage({ name: "review", config, session });
    } catch (e) {
      setStage({ name: "review", config, session: null, error: (e as Error).message });
    }
  };

  if (stage.name === "setup") {
    return (
      <Setup
        problem={problem}
        voice={{
          mode: voiceMode,
          voiceId,
          setMode: setVoiceMode,
          setVoiceId,
          preview: (id) => speak(PREVIEW_LINE, id),
          stopPreview: stop,
          preload: tts.preload,
          device: tts.device,
          speaking,
          load: tts.load,
          progress: tts.progress,
          fellBack: tts.fellBack,
        }}
        onStart={(config) => {
          stop();
          setStage({ name: "interview", config });
        }}
      />
    );
  }

  if (stage.name === "interview") {
    return <InterviewRoom key={attempt} problem={problem} config={stage.config} voice={roomVoice} onFinish={(r) => finish(stage.config, r)} />;
  }

  const { session, error } = stage;
  return (
    <main className="container page view-enter">
      <div className="review-head rise">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Scorecard · {problem.title}</span>
          <h1>How the interview went</h1>
        </div>
        {session && (
          <div className="row wrap">
            {saved ? (
              <>
                <span className="small muted row" style={{ gap: 6 }}>
                  <IconCheck size={14} color="var(--good)" /> Saved in this browser
                </span>
                <button
                  className="btn sm danger"
                  onClick={() => {
                    deleteSession(session.id);
                    setSaved(false);
                  }}
                >
                  <IconTrash size={14} /> Delete
                </button>
              </>
            ) : (
              <button className="btn sm" onClick={() => setSaved(saveSession(session))}>
                Save to this browser
              </button>
            )}
            <button
              className="btn sm"
              onClick={() => {
                setSaved(false);
                setAttempt((a) => a + 1);
                setStage({ name: "setup" });
              }}
            >
              Practice again
            </button>
            <Link className="btn sm primary" href="/">
              Another problem <IconArrowRight size={14} />
            </Link>
          </div>
        )}
      </div>
      {!session && !error && (
        <div className="stack" aria-live="polite">
          <p className="muted row" style={{ gap: 10 }}>
            <span className="spinner" /> Reviewing your session and checking every score against your transcript and code…
          </p>
          <div className="stats">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 76 }} />
            ))}
          </div>
          <div className="grid-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 180 }} />
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="notice">
          {error}.{" "}
          <button className="btn sm" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
      {session && <ScorecardView session={session} />}
    </main>
  );
}
