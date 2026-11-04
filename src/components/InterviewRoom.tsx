"use client";
import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Problem } from "@/lib/problems";
import type { CodeEvent, RunResult, SessionContext, Turn } from "@/lib/types";
import { summarizeChange } from "@/lib/codeSummary";
import { useVoice } from "@/lib/useVoice";
import { fmtClock } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { runInBrowser } from "@/lib/browserRunner";
import type { Trigger } from "@/lib/prompts";
import type { SessionConfig } from "./Setup";
import { Prose } from "./Prose";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconBulb, IconChat, IconCheck, IconChevronDown, IconClock, IconCode, IconDoc, IconFlag, IconMic, IconPause, IconPlay, IconSend, IconX } from "./Icons";

export interface InterviewResult {
  turns: Turn[];
  codeEvents: CodeEvent[];
  runs: RunResult[];
  finalCode: string;
  hintsUsed: number;
  elapsed: number;
  startedAt: number;
}

export interface RoomVoice {
  speak: (text: string) => void;
  stop: () => void;
  speaking: boolean;
  /** True while the natural voice model is still loading (lines wait for it). */
  loading: boolean;
  /** Registers a listener for when the interviewer starts/stops talking (used to mute the mic). */
  onSpeakingChange: (fn: ((speaking: boolean) => void) | null) => void;
}

type Tab = "problem" | "code" | "chat";

const uid = () => crypto.randomUUID();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CODE_SETTLE_MS = 3000; // editor idle time before a change is summarized
const CODE_QUIET_MS = 6000; // further quiet time before the interviewer may react to it
const SPEECH_GRACE_MS = 1200; // pause after an utterance before the interviewer may speak
const IDLE_MS = 90_000;

export function InterviewRoom({ problem, config, voice: tts, onFinish }: { problem: Problem; config: SessionConfig; voice: RoomVoice; onFinish: (r: InterviewResult) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [codeEvents, setCodeEvents] = useState<CodeEvent[]>([]);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [code, setCode] = useState(problem.starterCode);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [running, setRunning] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [tab, setTab] = useState<Tab>("problem");
  const [showProblem, setShowProblem] = useState(false);
  const [outputOpen, setOutputOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const theme = useTheme();

  // Refs mirror state so async callbacks always see the latest session.
  const turnsRef = useRef<Turn[]>([]);
  const codeEventsRef = useRef<CodeEvent[]>([]);
  const runsRef = useRef<RunResult[]>([]);
  const codeRef = useRef(problem.starterCode);
  const snapshotRef = useRef(problem.starterCode);
  const hintsRef = useRef(0);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);
  const endedRef = useRef(false);
  const inFlightRef = useRef(false);
  const queuedRef = useRef<Trigger | null>(null);
  const lastActivityRef = useRef(Date.now());
  const lastIdleRef = useRef(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const startedAt = useRef(Date.now());
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const resumeVoice = useRef(false);
  const tabRef = useRef<Tab>("problem");
  tabRef.current = tab;

  const pushTurn = useCallback((t: Omit<Turn, "id" | "t">) => {
    const turn: Turn = { ...t, id: uid(), t: elapsedRef.current };
    turnsRef.current = [...turnsRef.current, turn];
    setTurns(turnsRef.current);
    if (turn.role === "interviewer" && tabRef.current !== "chat") setUnread((n) => n + 1);
    return turn;
  }, []);

  const context = useCallback(
    (): SessionContext => ({
      problemId: problem.id,
      engine: config.engine,
      elapsed: elapsedRef.current,
      turns: turnsRef.current,
      codeEvents: codeEventsRef.current.map(({ snapshot: _s, ...e }) => e),
      runs: runsRef.current,
      code: codeRef.current,
      hintsUsed: hintsRef.current,
    }),
    [problem.id, config.engine],
  );

  const awaitingAnswer = () => {
    const last = turnsRef.current[turnsRef.current.length - 1];
    return !!last && last.role === "interviewer" && last.kind === "question";
  };

  // ---- Voice input (Whisper) ----------------------------------------------------------------
  const micRef = useRef<ReturnType<typeof useVoice> | null>(null);

  const deliver = useCallback(
    async (text: string, kind: Turn["kind"], extra: Partial<Turn> = {}) => {
      // Never talk over the candidate: wait for their current utterance to finish.
      const waitStart = Date.now();
      while (micRef.current?.speakingRef.current && Date.now() - waitStart < 20_000) await sleep(250);
      if (endedRef.current) return;
      pushTurn({ role: "interviewer", text, kind, ...extra });
      tts.speak(text);
    },
    [pushTurn, tts],
  );

  const consult = useCallback(
    async (trigger: Trigger) => {
      if (pausedRef.current || endedRef.current) return;
      if (inFlightRef.current) {
        // Candidate input outranks background triggers.
        if (!queuedRef.current || trigger.startsWith("candidate")) queuedRef.current = trigger;
        return;
      }
      if (!trigger.startsWith("candidate") && awaitingAnswer()) return; // one question at a time

      inFlightRef.current = true;
      const candidateTurnsBefore = turnsRef.current.filter((t) => t.role === "candidate").length;
      // Only show "thinking" when we're likely to reply; background checks stay invisible.
      const showThinking = trigger.startsWith("candidate");
      if (showThinking) setThinking(true);
      let move: { action: string; message: string; focus?: string; note?: string } | null = null;
      try {
        const res = await fetch("/api/interviewer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ctx: context(), trigger }),
        });
        move = await res.json();
      } catch {
        setNote("Couldn't reach the session service. Your work is safe; the interviewer will try again.");
      } finally {
        inFlightRef.current = false;
        setThinking(false);
      }
      if (move?.note) setNote(move.note);
      const candidateSpokeSince = turnsRef.current.filter((t) => t.role === "candidate").length > candidateTurnsBefore;
      if (move && move.action !== "silent" && move.message && !pausedRef.current) {
        if (candidateSpokeSince) {
          // The reply is already stale; reconsider with what the candidate just said.
          queuedRef.current = "candidate_spoke";
        } else {
          const kind = move.action === "ask" ? "question" : move.action === "answer" ? "answer" : "comment";
          await deliver(move.message, kind, { focus: move.focus });
        }
      }
      const next = queuedRef.current;
      queuedRef.current = null;
      if (next) consult(next);
    },
    [context, deliver],
  );

  const onUtterance = useCallback(
    (text: string) => {
      if (pausedRef.current || endedRef.current) return;
      pushTurn({ role: "candidate", text, source: "voice" });
      lastActivityRef.current = Date.now();
      clearTimeout(timers.current.speech);
      timers.current.speech = setTimeout(() => {
        if (!micRef.current?.speakingRef.current) consult("candidate_spoke");
      }, SPEECH_GRACE_MS);
    },
    [pushTurn, consult],
  );
  const mic = useVoice(onUtterance);
  micRef.current = mic;

  // Mute the mic while the interviewer talks so their voice isn't transcribed as the candidate's.
  useEffect(() => {
    tts.onSpeakingChange((speaking) => {
      if (speaking) micRef.current?.setMuted(true);
      else setTimeout(() => micRef.current?.setMuted(false), 300);
    });
    return () => tts.onSpeakingChange(null);
  }, [tts]);

  useEffect(() => {
    if (mic.speaking) lastActivityRef.current = Date.now();
  }, [mic.speaking]);

  // ---- Lifecycle ----------------------------------------------------------------------------
  useEffect(() => {
    if (turnsRef.current.length) return;
    const intro = config.voice
      ? "Hi, thanks for joining. Take a moment to read the problem, then tap the mic and talk me through how you'd approach it before you start coding. Feel free to ask me anything about the problem."
      : "Hi, thanks for joining. Take a moment to read the problem, then type out how you'd approach it before you start coding. Feel free to ask me anything about the problem.";
    pushTurn({ role: "interviewer", text: intro, kind: "intro" });
    tts.speak(intro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      if (pausedRef.current || endedRef.current) return;
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      const now = Date.now();
      if (now - lastActivityRef.current > IDLE_MS && now - lastIdleRef.current > IDLE_MS && !micRef.current?.speakingRef.current) {
        lastIdleRef.current = now;
        consult("idle");
      }
    }, 1000);
    const pending = timers.current;
    return () => {
      clearInterval(tick);
      Object.values(pending).forEach(clearTimeout);
    };
  }, [consult]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, thinking]);

  useEffect(() => {
    if (tab === "chat") setUnread(0);
  }, [tab]);

  // ---- Code tracking ------------------------------------------------------------------------
  const onCodeChange = (value: string | undefined) => {
    const next = value ?? "";
    codeRef.current = next;
    setCode(next);
    lastActivityRef.current = Date.now();
    clearTimeout(timers.current.settle);
    timers.current.settle = setTimeout(() => {
      const change = summarizeChange(snapshotRef.current, codeRef.current, problem.functionName);
      if (!change.meaningful) return;
      const ev: CodeEvent = { id: uid(), t: elapsedRef.current, summary: change.summary, added: change.added, removed: change.removed, features: change.features, snapshot: codeRef.current };
      snapshotRef.current = codeRef.current;
      codeEventsRef.current = [...codeEventsRef.current, ev];
      setCodeEvents(codeEventsRef.current);
      clearTimeout(timers.current.quiet);
      timers.current.quiet = setTimeout(() => {
        const quiet = Date.now() - lastActivityRef.current >= CODE_QUIET_MS - 500;
        if (quiet && !micRef.current?.speakingRef.current) consult("code_change");
      }, CODE_QUIET_MS);
    }, CODE_SETTLE_MS);
  };

  // ---- Actions ------------------------------------------------------------------------------
  const runCode = async () => {
    setRunning(true);
    setOutputOpen(true);
    lastActivityRef.current = Date.now();
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId: problem.id, code: codeRef.current }),
      });
      let data = await res.json();
      let sandbox: RunResult["sandbox"] = data.sandbox;
      if (data.unavailable) {
        // No server sandbox on this host (e.g. serverless): run the tests in this browser instead.
        const local = await runInBrowser(problem, codeRef.current);
        data = { ...local, passed: local.cases.filter((c) => c.passed).length, total: problem.tests.length };
        sandbox = "browser";
      }
      const run: RunResult = { id: uid(), t: elapsedRef.current, ok: data.ok, passed: data.passed ?? 0, total: data.total ?? problem.tests.length, cases: data.cases ?? [], error: data.error, stdout: data.stdout, sandbox };
      runsRef.current = [...runsRef.current, run];
      setRuns(runsRef.current);
      if (run.cases.length) setTimeout(() => consult("run"), 2500);
    } finally {
      setRunning(false);
    }
  };

  const sendText = () => {
    const text = draft.trim();
    if (!text || paused) return;
    setDraft("");
    pushTurn({ role: "candidate", text, source: "text" });
    lastActivityRef.current = Date.now();
    consult("candidate_typed");
  };

  const askHint = async () => {
    const level = (hintsRef.current + 1) as 1 | 2 | 3;
    if (level > 3) return;
    setHintLoading(true);
    setThinking(true);
    try {
      const res = await fetch("/api/hint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ctx: context(), level }),
      });
      const data = await res.json();
      if (data.note) setNote(data.note);
      hintsRef.current = level;
      setHintsUsed(level);
      setThinking(false);
      await deliver(data.message, "hint", { hintLevel: level, focus: "hint" });
    } finally {
      setHintLoading(false);
      setThinking(false);
    }
  };

  const togglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (next) {
      resumeVoice.current = mic.status === "listening";
      mic.stop();
      tts.stop();
    } else {
      lastActivityRef.current = Date.now();
      if (resumeVoice.current) mic.start();
    }
  };

  const finish = () => {
    setConfirmEnd(false);
    endedRef.current = true;
    mic.stop();
    tts.stop();
    Object.values(timers.current).forEach(clearTimeout);
    onFinish({
      turns: turnsRef.current,
      codeEvents: codeEventsRef.current,
      runs: runsRef.current,
      finalCode: codeRef.current,
      hintsUsed: hintsRef.current,
      elapsed: elapsedRef.current,
      startedAt: startedAt.current,
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    turnsRef.current = turnsRef.current.map((t) => (t.id === editing.id ? { ...t, text: editing.text.trim() || t.text, edited: true } : t));
    setTurns(turnsRef.current);
    setEditing(null);
  };

  const lastRun = runs[runs.length - 1];
  const allPass = !!lastRun && lastRun.cases.length > 0 && lastRun.passed === lastRun.total;
  const engineLabel = config.engine === "local" ? "Local Llama" : config.engine === "hosted" ? "Hosted Llama" : "Built-in coach";
  const presence = tts.speaking ? "speaking" : thinking ? "thinking" : "";
  const presenceText = paused
    ? "Paused"
    : tts.speaking
      ? "Speaking"
      : tts.loading
        ? "Preparing voice…"
      : thinking
        ? "Thinking…"
        : mic.speaking
          ? "Listening to you"
          : awaitingAnswerState(turns)
            ? "Waiting for your answer"
            : "Listening";
  const micLabel =
    mic.status === "loading"
      ? `Loading speech model${mic.progress ? ` · ${mic.progress}%` : "…"}`
      : mic.status === "listening"
        ? mic.speaking
          ? "Hearing you…"
          : mic.pending
            ? "Transcribing…"
            : "Listening. Just talk."
        : "Tap to talk";

  return (
    <div className="room">
      {/* Top bar: always shows the timer, Pause and End so they're reachable at every width. */}
      <div className="room-bar">
        <div className="room-title">
          <button className="btn sm ghost icon problem-toggle" onClick={() => setShowProblem((v) => !v)} aria-expanded={showProblem} aria-label="Show problem">
            <IconDoc />
          </button>
          <h1>{problem.title}</h1>
          <span className={`pill ${problem.difficulty.toLowerCase()} hide-sm`}>{problem.difficulty}</span>
        </div>
        <div className="room-actions">
          <span className={`timer ${paused ? "paused" : ""}`} aria-label={`Elapsed time ${fmtClock(elapsed)}`}>
            <IconClock size={14} /> {fmtClock(elapsed)}
          </span>
          <button className="btn sm" onClick={togglePause} aria-label={paused ? "Resume interview" : "Pause interview"}>
            {paused ? <IconPlay size={14} /> : <IconPause size={14} />}
            <span className="hide-sm">{paused ? "Resume" : "Pause"}</span>
          </button>
          <button className="btn sm danger" onClick={() => setConfirmEnd(true)} aria-label="End interview">
            <IconFlag size={14} /> <span>End</span>
            <span className="hide-sm">&nbsp;interview</span>
          </button>
        </div>
      </div>

      <div className="room-tabs" role="tablist" aria-label="Interview panels">
        {(
          [
            ["problem", "Problem", <IconDoc key="i" size={15} />],
            ["code", "Code", <IconCode key="i" size={15} />],
            ["chat", "Interviewer", <IconChat key="i" size={15} />],
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {icon} {label}
            {id === "chat" && unread > 0 && tab !== "chat" && <span className="badge">{unread}</span>}
          </button>
        ))}
      </div>

      <div className="room-body">
        <div className={`room-grid ${showProblem ? "show-problem" : ""}`}>
          {/* Problem */}
          <section className={`pane problem ${tab === "problem" ? "active" : ""}`} aria-label="Problem">
            <div className="pane-head">
              <h2>Problem</h2>
              <button className="btn sm ghost icon problem-toggle" onClick={() => setShowProblem(false)} aria-label="Close problem">
                <IconX />
              </button>
            </div>
            <div className="pane-body stack" style={{ gap: 14 }}>
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
              <div className="small">
                <strong>Code milestones</strong>
                {codeEvents.length ? (
                  <ul className="milestones">
                    {codeEvents.slice(-6).map((e) => (
                      <li key={e.id}>
                        <span className="t">{fmtClock(e.t)}</span>
                        <span>{e.summary}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="subtle" style={{ marginTop: 6 }}>
                    Meaningful code changes will appear here.
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Editor */}
          <section className={`pane ${tab === "code" ? "active" : ""}`} aria-label="Code editor">
            <div className="pane-head">
              <div className="row" style={{ gap: 8 }}>
                <IconCode color="var(--text-3)" />
                <span className="mono small muted">solution.py</span>
              </div>
              <button className="btn sm primary" onClick={runCode} disabled={running || paused}>
                {running ? <span className="spinner" /> : <IconPlay size={13} />}
                {running ? "Running…" : "Run tests"}
              </button>
            </div>
            <div className="editor-wrap">
              <Editor
                height="100%"
                defaultLanguage="python"
                theme={theme === "light" ? "light" : "vs-dark"}
                value={code}
                onChange={onCodeChange}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  tabSize: 4,
                  automaticLayout: true,
                  readOnly: paused,
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                  wordWrap: "on",
                  smoothScrolling: true,
                  cursorSmoothCaretAnimation: "on",
                  renderLineHighlight: "gutter",
                }}
              />
            </div>
            <div className={`output ${outputOpen ? "" : "collapsed"}`}>
              <button className="output-head" onClick={() => setOutputOpen((v) => !v)} aria-expanded={outputOpen}>
                <span className="summary">
                  {!lastRun ? (
                    <span className="subtle">Test results</span>
                  ) : lastRun.cases.length ? (
                    <>
                      <span style={{ color: allPass ? "var(--good)" : "var(--warn)" }}>
                        {lastRun.passed}/{lastRun.total} passed
                      </span>
                      <span className={`pass-bar ${allPass ? "" : "partial"}`} key={lastRun.id}>
                        <span style={{ width: `${(lastRun.passed / lastRun.total) * 100}%` }} />
                      </span>
                    </>
                  ) : (
                    <span style={{ color: "var(--bad)" }}>Run failed</span>
                  )}
                </span>
                <span className="row small subtle" style={{ gap: 8 }}>
                  {lastRun && <span className="hide-sm">{lastRun.sandbox === "docker" ? "Sandboxed" : lastRun.sandbox === "browser" ? "Ran in your browser" : "Not isolated"}</span>}
                  <IconChevronDown className="chev" style={{ transform: outputOpen ? undefined : "rotate(180deg)" }} />
                </span>
              </button>
              {outputOpen && (
                <div className="output-body" key={lastRun?.id}>
                  {!lastRun && <p className="subtle">Run the sample tests to check your code.</p>}
                  {lastRun?.error && <pre className="err">{lastRun.error}</pre>}
                  {lastRun?.cases.map((c, i) => (
                    <div key={c.index} className="case" style={{ "--i": i } as React.CSSProperties}>
                      <span className={c.passed ? "ok" : "fail"}>{c.passed ? <IconCheck size={14} /> : <IconX size={14} />}</span>
                      <span className="line">
                        ({c.input}) → {c.expected}
                        {!c.passed && (c.error ? <pre className="err">{c.error}</pre> : <span className="fail">, got {c.actual}</span>)}
                      </span>
                    </div>
                  ))}
                  {lastRun?.stdout && (
                    <>
                      <div className="subtle" style={{ marginTop: 8 }}>
                        stdout
                      </div>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{lastRun.stdout}</pre>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Interviewer */}
          <section className={`pane ${tab === "chat" ? "active" : ""}`} aria-label="Interviewer">
            <div className="pane-head">
              <div className="presence">
                <span className={`orb ${presence}`} aria-hidden="true" />
                <div>
                  <div className="who">Interviewer</div>
                  <div className="state" aria-live="polite">
                    {presenceText}
                  </div>
                </div>
              </div>
              <span className="pill accent">{engineLabel}</span>
            </div>
            <div className="pane-body">
              <div className="transcript" aria-live="polite" aria-relevant="additions">
                {turns.map((t) => (
                  <div key={t.id} className={`turn ${t.role} ${t.kind === "hint" ? "hint" : ""}`}>
                    <div className="meta">
                      <span>{t.role === "interviewer" ? (t.kind === "hint" ? `Hint ${t.hintLevel} of 3` : "Interviewer") : "You"}</span>
                      <span>· {fmtClock(t.t)}</span>
                      {t.source === "voice" && <span>· voice</span>}
                      {t.edited && <span>· edited</span>}
                      {t.role === "candidate" && editing?.id !== t.id && (
                        <button className="edit" onClick={() => setEditing({ id: t.id, text: t.text })} aria-label="Edit this message to fix a transcription error">
                          edit
                        </button>
                      )}
                    </div>
                    {editing?.id === t.id ? (
                      <div className="stack" style={{ gap: 6 }}>
                        <textarea rows={3} value={editing.text} onChange={(e) => setEditing({ id: t.id, text: e.target.value })} autoFocus aria-label="Edit message" />
                        <div className="row">
                          <button className="btn sm primary" onClick={saveEdit}>
                            Save
                          </button>
                          <button className="btn sm ghost" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      t.text
                    )}
                  </div>
                ))}
                {thinking && (
                  <div className="typing" aria-label="Interviewer is thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                <div ref={transcriptEnd} />
              </div>
            </div>
            <div className="composer">
              {note && (
                <div className="notice dismissible small" onClick={() => setNote(null)} role="status" title="Dismiss">
                  {note}
                </div>
              )}
              {mic.error && <div className="notice small">{mic.error}</div>}
              {config.voice && (
                <div className="mic-row">
                  <button
                    className={`mic-btn ${mic.status === "listening" ? "live" : ""} ${mic.speaking ? "hearing" : ""}`}
                    onClick={mic.status === "listening" ? mic.stop : mic.start}
                    disabled={mic.status === "loading" || paused}
                    aria-pressed={mic.status === "listening"}
                    aria-label={mic.status === "listening" ? "Stop microphone" : "Start microphone"}
                  >
                    {mic.status === "loading" ? <span className="spinner" /> : <IconMic size={20} />}
                  </button>
                  <div className="mic-status">
                    <strong>{micLabel}</strong>
                    <span className="row" style={{ gap: 8 }}>
                      <span className={`bars ${mic.speaking ? "on" : ""}`} aria-hidden="true">
                        <span />
                        <span />
                        <span />
                        <span />
                      </span>
                      <span className="small subtle">{mic.status === "listening" ? "Pause to let the interviewer reply" : "Or type below"}</span>
                    </span>
                  </div>
                </div>
              )}
              <div className="composer-row">
                <textarea
                  rows={1}
                  placeholder={config.voice ? "Type a message…" : "Talk through your thinking…"}
                  value={draft}
                  disabled={paused}
                  aria-label="Message to the interviewer"
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(140, e.target.scrollHeight)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendText();
                      (e.target as HTMLTextAreaElement).style.height = "auto";
                    }
                  }}
                />
                <button className="btn primary icon" onClick={sendText} disabled={!draft.trim() || paused} aria-label="Send message">
                  <IconSend />
                </button>
              </div>
              <div className="spread">
                <button className="btn sm ghost" onClick={askHint} disabled={hintsUsed >= 3 || hintLoading || paused}>
                  <IconBulb size={15} color="var(--warn)" />
                  {hintsUsed >= 3 ? "No hints left" : `Hint ${hintsUsed + 1} of 3`}
                  <span className="hint-pips" aria-hidden="true">
                    {[1, 2, 3].map((n) => (
                      <i key={n} className={n <= hintsUsed ? "used" : ""} />
                    ))}
                  </span>
                </button>
                <span className="small subtle hide-sm">Shift+Enter for new line</span>
              </div>
            </div>
          </section>
        </div>

        {paused && (
          <div className="paused-overlay">
            <div className="card stack">
              <h2 style={{ fontSize: 20 }}>Interview paused</h2>
              <p className="muted small">The timer, microphone, and interviewer are stopped. Take your time.</p>
              <button className="btn primary" onClick={togglePause}>
                <IconPlay size={14} /> Resume
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmEnd}
        title="End the interview?"
        body="You'll get your scorecard right away. You can't return to this session afterwards."
        confirmLabel="End and see scorecard"
        cancelLabel="Keep going"
        danger
        onConfirm={finish}
        onCancel={() => setConfirmEnd(false)}
      />
    </div>
  );
}

function awaitingAnswerState(turns: Turn[]) {
  const last = turns[turns.length - 1];
  return !!last && last.role === "interviewer" && last.kind === "question";
}
