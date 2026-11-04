"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PROBLEMS } from "@/lib/problems";
import { IconArrowRight, IconChat, IconCode, IconMic, IconWave } from "@/components/Icons";
import { supportsViewTransitions, withViewTransition } from "@/lib/viewTransition";

const topics = ["All", ...Array.from(new Set(PROBLEMS.map((p) => p.topic)))];
const difficulties = ["Any", "Easy", "Medium"] as const;

/** Builds the low-contrast character field behind the hero. Deterministic, so server and client render the same text. */
function asciiField(rows = 44, cols = 320) {
  const glyphs = " .:+xX0S8#$";
  const noise = (r: number, c: number) => {
    const v = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      // Soft bands plus per-cell noise give clustered, uneven density; denser near the top.
      const wave = Math.sin(c * 0.045 + r * 0.32) + 0.8 * Math.sin(c * 0.013 - r * 0.19) + 0.5 * Math.sin((c + r * 4) * 0.021);
      const v = 0.4 + wave * 0.18 + (noise(r, c) - 0.5) * 0.55 + (1 - r / rows) * 0.4;
      line += v < 0.38 ? " " : glyphs[Math.min(glyphs.length - 1, Math.floor((v - 0.38) * 14))];
    }
    lines.push(line);
  }
  return lines.join("\n");
}
const ASCII = asciiField();

const css = (vars: Record<string, string | number>) => vars as React.CSSProperties;

export default function Home() {
  const [topic, setTopic] = useState("All");
  const [difficulty, setDifficulty] = useState<(typeof difficulties)[number]>("Any");
  const shown = PROBLEMS.filter((p) => (topic === "All" || p.topic === topic) && (difficulty === "Any" || p.difficulty === difficulty));
  const filtered = topic !== "All" || difficulty !== "Any";
  // Cards stagger in on first load only; after that, filtering animates through view transitions
  // (or a short fade where the browser doesn't support them).
  const [intro, setIntro] = useState(true);
  const [vt, setVt] = useState(false);
  useEffect(() => {
    setVt(supportsViewTransitions());
    const t = setTimeout(() => setIntro(false), 900);
    return () => clearTimeout(t);
  }, []);
  const pickTopic = (t: string) => t !== topic && withViewTransition(() => setTopic(t));
  const pickDifficulty = (d: (typeof difficulties)[number]) => d !== difficulty && withViewTransition(() => setDifficulty(d));

  return (
    <main>
      <section className="landing-hero" aria-labelledby="hero-title">
        <pre className="ascii-field" aria-hidden="true" suppressHydrationWarning>
          {ASCII}
        </pre>

        <div className="container hero-center">
          <span className="label-pill rise">Mock interview coach</span>
          <h1 id="hero-title" className="hero-title rise" style={css({ "--i": 1 })}>
            <span className="line">
              Think out loud.{" "}
              <span className="icon-tile" style={css({ "--tilt": "-6deg" })} aria-hidden="true">
                <IconMic />
              </span>
            </span>
            <span className="line">
              Code{" "}
              <span className="icon-tile" style={css({ "--tilt": "5deg" })} aria-hidden="true">
                <IconCode />
              </span>{" "}
              through.
            </span>
          </h1>
          <p className="hero-sub rise" style={css({ "--i": 2 })}>
            Voxora listens while you solve a coding problem out loud, asks what a real interviewer would ask, and shows you exactly how your
            thinking came across.
          </p>
          <div className="hero-ctas rise" style={css({ "--i": 3 })}>
            <a className="btn outline" href="#problems">
              Browse problems <IconArrowRight size={15} />
            </a>
            <Link className="btn light" href="/practice/two-sum">
              Start with Two Sum
            </Link>
          </div>
        </div>

        {/* Illustrative preview of an interview in progress. */}
        <div className="container preview-wrap rise" style={css({ "--i": 4 })}>
          <div className="preview" role="img" aria-label="Example: a live interview with transcript, test results, and a complexity score">
            <span className="trace l" />
            <span className="node l">
              <IconChat size={13} />
            </span>
            <span className="trace r" />
            <span className="node r">
              <IconWave size={13} />
            </span>

            <div className="term-card">
              <div className="head">
                <span className="row" style={{ gap: 8 }}>
                  <span className="live-dot" /> SESSION-2F7A live
                </span>
              </div>
              <div className="kv">
                <span>problem</span>
                <span>two-sum</span>
              </div>
              <div className="kv">
                <span>elapsed</span>
                <span>06:42</span>
              </div>
              <div className="kv">
                <span>hints</span>
                <span>1 of 3</span>
              </div>
            </div>

            <div className="term-window">
              <div className="bar">
                <span className="lights">
                  <i />
                  <i />
                  <i />
                </span>
                <span>voxora · two-sum</span>
                <span>14 turns</span>
              </div>
              <div className="term-row">
                <span />
                <span className="who">YOU</span>
                <span className="msg">I&apos;ll keep a dictionary of values I&apos;ve seen so far.</span>
              </div>
              <div className="term-row">
                <span />
                <span className="who">INT</span>
                <span className="msg">What&apos;s the time complexity of that?</span>
              </div>
              <div className="term-row">
                <span />
                <span className="who">YOU</span>
                <span className="msg">O(n) time, one pass, and O(n) space.</span>
              </div>
              <div className="term-row">
                <span className="ok-dot" />
                <span className="who">RUN</span>
                <span className="msg">4/4 sample tests passed · sandboxed · 38ms</span>
              </div>
              <div className="term-row">
                <span />
                <span className="who">INT</span>
                <span className="msg">
                  What happens with [3, 3] and target 6?
                  <span className="caret" />
                </span>
              </div>
            </div>

            <div className="term-card side-r">
              <div className="head">
                <span>Complexity analysis</span>
                <span>4/5</span>
              </div>
              <div className="term-bar">
                <span />
              </div>
              <div style={{ color: "var(--text-2)" }}>You justified O(n) time and O(n) space before running the tests.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="problems" className="container problems-section" aria-labelledby="problems-title">
        <div className="section-head">
          <div>
            <span className="eyebrow">Problems</span>
            <h2 id="problems-title">Pick a problem to practice</h2>
          </div>
          <p className="results-count" aria-live="polite">
            {shown.length} {shown.length === 1 ? "problem" : "problems"}
            {filtered ? " match your filters" : ""}
          </p>
        </div>

        <div className="toolbar" role="group" aria-label="Filter problems">
          <div className="filter-group">
            <span className="filter-label" id="topic-label">
              Topic
            </span>
            <div className="chips has-thumb" role="group" aria-labelledby="topic-label">
              {topics.map((t) => (
                <button key={t} className="chip" aria-pressed={topic === t} onClick={() => pickTopic(t)}>
                  {topic === t && <span className="thumb" style={{ viewTransitionName: "topic-thumb" }} aria-hidden="true" />}
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label" id="difficulty-label">
              Difficulty
            </span>
            <div className="segmented has-thumb" role="group" aria-labelledby="difficulty-label">
              {difficulties.map((d) => (
                <button key={d} aria-pressed={difficulty === d} onClick={() => pickDifficulty(d)}>
                  {difficulty === d && <span className="thumb" style={{ viewTransitionName: "difficulty-thumb" }} aria-hidden="true" />}
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ul className="problem-grid">
          {shown.map((p, i) => (
            // A stable key and view-transition name let each card glide to its new spot when filters change.
            <li key={p.id} className={intro ? "rise" : vt ? undefined : "card-in"} style={{ ...css({ "--i": i }), viewTransitionName: `card-${p.id}` }}>
              <Link href={`/practice/${p.id}`} className="problem-card" aria-label={`${p.title}, ${p.difficulty}, ${p.topic}`}>
                <div className="spread" style={{ alignItems: "flex-start" }}>
                  <h3>{p.title}</h3>
                  <span className={`pill ${p.difficulty.toLowerCase()}`}>{p.difficulty}</span>
                </div>
                <p className="desc">{p.prompt.split("\n")[0].replace(/[`*]/g, "")}</p>
                <div className="meta">
                  <div className="row" style={{ gap: 8 }}>
                    <span className="pill">{p.topic}</span>
                    <span className="lang">
                      <IconCode size={13} /> Python
                    </span>
                  </div>
                  <IconArrowRight className="go" />
                </div>
              </Link>
            </li>
          ))}
          {!shown.length && (
            <li className="empty-state">
              <p>No problems match those filters.</p>
              <button
                className="btn sm"
                onClick={() =>
                  withViewTransition(() => {
                    setTopic("All");
                    setDifficulty("Any");
                  })
                }
              >
                Clear filters
              </button>
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
