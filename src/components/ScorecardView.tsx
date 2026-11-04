"use client";
import type { SavedSession } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { fmtClock } from "@/lib/format";
import { IconCheck, IconChevronDown, IconSpark } from "./Icons";

const ENGINE_LABEL = { local: "Local Llama", hosted: "Hosted Llama", offline: "Built-in rubric" } as const;

function highlight(text: string, quotes: string[]) {
  const lower = text.toLowerCase();
  const hit = quotes.map((q) => ({ q, i: lower.indexOf(q.toLowerCase()) })).find((x) => x.i >= 0);
  if (!hit) return text;
  return (
    <>
      {text.slice(0, hit.i)}
      <mark>{text.slice(hit.i, hit.i + hit.q.length)}</mark>
      {text.slice(hit.i + hit.q.length)}
    </>
  );
}

const css = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function ScorecardView({ session }: { session: SavedSession }) {
  const { scorecard: card } = session;
  const scored = card.categories.filter((c) => c.score !== null);
  const backed = scored.filter((c) => c.evidence.length > 0).length;
  const quotes = card.categories.flatMap((c) => c.evidence.filter((e) => e.type === "transcript").map((e) => e.quote));
  const highlights = session.turns.filter((t) => t.role === "candidate" && quotes.some((q) => t.text.toLowerCase().includes(q.toLowerCase())));
  const lastRun = session.runs[session.runs.length - 1];
  const milestones = [
    ...session.codeEvents.map((e) => ({ t: e.t, text: e.summary, key: e.id })),
    ...session.runs.map((r) => ({ t: r.t, text: r.cases.length ? `Ran sample tests: ${r.passed}/${r.total} passed` : "Run failed to complete", key: r.id })),
  ].sort((a, b) => a.t - b.t);

  const stats = [
    { v: fmtClock(session.durationSec), k: "Duration" },
    { v: lastRun ? `${lastRun.passed}/${lastRun.total}` : "—", k: "Sample tests, last run" },
    { v: `${session.hintsUsed}/3`, k: "Hints used" },
    { v: `${backed}/${scored.length}`, k: "Scores backed by evidence" },
    { v: ENGINE_LABEL[card.engine], k: "Graded by", small: true },
  ];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="stats">
        {stats.map((s, i) => (
          <div key={s.k} className="card stat rise" style={css(i)}>
            <div className="v" style={s.small ? { fontSize: 16, paddingTop: 4 } : undefined}>
              {s.v}
            </div>
            <div className="k">{s.k}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {card.categories.map((c, i) => (
          <section key={c.category} className="card stack rise" style={{ ...css(i + 2), gap: 10 }} aria-labelledby={`cat-${c.category}`}>
            <div className="spread">
              <h2 id={`cat-${c.category}`} style={{ fontSize: 16 }}>
                {CATEGORY_LABELS[c.category]}
              </h2>
              {c.score === null && <span className="insufficient">Insufficient evidence</span>}
            </div>
            {c.score !== null && (
              <div className="score-line" aria-label={`${c.score} out of 5`}>
                <div className="score-track">
                  <span style={{ ...css(i), width: `${(c.score / 5) * 100}%` }} />
                </div>
                <span className="score-num">{c.score}/5</span>
              </div>
            )}
            <p className="small muted">{c.rationale}</p>
            {c.evidence.map((e, j) => (
              <div key={j} className={`evidence ${e.type}`}>
                <div className="tag">{e.type === "transcript" ? "You said" : e.type === "code" ? "Your code" : "Test run"}</div>
                <q>{e.quote}</q>
              </div>
            ))}
          </section>
        ))}
      </div>
      {card.evidenceDropped > 0 && (
        <p className="small subtle">
          {card.evidenceDropped} supporting quote{card.evidenceDropped > 1 ? "s" : ""} offered by the model couldn&apos;t be found in your session and
          {card.evidenceDropped > 1 ? " were" : " was"} discarded.
        </p>
      )}

      <div className="grid-2">
        <section className="card rise" style={css(6)}>
          <h2 className="section-title">Strengths</h2>
          <ul className="privacy-list" style={{ fontSize: 14 }}>
            {card.strengths.map((s) => (
              <li key={s}>
                <IconCheck size={15} color="var(--good)" /> <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card rise" style={css(7)}>
          <h2 className="section-title">Practice plan</h2>
          <ul className="privacy-list" style={{ fontSize: 14 }}>
            {card.actions.map((s) => (
              <li key={s}>
                <IconSpark size={15} /> <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid-2">
        <section className="card rise" style={css(8)}>
          <h2 className="section-title">Transcript highlights</h2>
          <div className="timeline">
            {highlights.length ? (
              highlights.map((t) => (
                <div key={t.id} className="item">
                  <span className="t">{fmtClock(t.t)}</span>
                  <span>{highlight(t.text, quotes)}</span>
                </div>
              ))
            ) : (
              <span className="small subtle">No transcript evidence was cited.</span>
            )}
          </div>
        </section>
        <section className="card rise" style={css(9)}>
          <h2 className="section-title">Code milestones</h2>
          <div className="timeline">
            {milestones.map((m) => (
              <div key={m.key} className="item">
                <span className="t">{fmtClock(m.t)}</span>
                <span>{m.text}</span>
              </div>
            ))}
            {!milestones.length && <span className="small subtle">No code changes recorded.</span>}
          </div>
        </section>
      </div>

      <details className="card">
        <summary>
          Full transcript and final code <IconChevronDown className="chev" />
        </summary>
        <div className="timeline" style={{ marginTop: 14 }}>
          {session.turns.map((t) => (
            <div key={t.id} className="item">
              <span className="t">{fmtClock(t.t)}</span>
              <span>
                <strong>{t.role === "candidate" ? "You" : t.kind === "hint" ? `Hint ${t.hintLevel}` : "Interviewer"}:</strong> {t.text}
              </span>
            </div>
          ))}
        </div>
        <pre className="example" style={{ marginTop: 14 }}>
          {session.finalCode}
        </pre>
      </details>
    </div>
  );
}
