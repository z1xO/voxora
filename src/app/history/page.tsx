"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ScorecardView } from "@/components/ScorecardView";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { IconArrowRight, IconChevronDown, IconTrash } from "@/components/Icons";
import { deleteAllSessions, deleteSession, listSessions } from "@/lib/storage";
import { fmtClock } from "@/lib/format";
import { CATEGORY_LABELS, type SavedSession } from "@/lib/types";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SavedSession[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => setSessions(listSessions()), []);

  const remove = (id: string) => {
    deleteSession(id);
    setSessions(listSessions());
    if (open === id) setOpen(null);
  };

  return (
    <main className="container page">
      <div className="review-head rise">
        <div className="stack" style={{ gap: 6 }}>
          <span className="eyebrow">Your practice</span>
          <h1>Saved sessions</h1>
          <p className="small muted">Stored only in this browser. Audio is never saved.</p>
        </div>
        {!!sessions?.length && (
          <button className="btn sm danger" onClick={() => setConfirmAll(true)}>
            <IconTrash size={14} /> Delete all
          </button>
        )}
      </div>

      {sessions && !sessions.length && (
        <div className="empty-state rise">
          <p>No saved sessions yet. Turn on &quot;Save this session&quot; before an interview, or press &quot;Save to this browser&quot; on a scorecard.</p>
          <Link className="btn sm primary" href="/">
            Pick a problem <IconArrowRight size={14} />
          </Link>
        </div>
      )}

      <div className="stack" style={{ gap: 12 }}>
        {sessions?.map((s, i) => (
          <div key={s.id} className="stack rise" style={{ "--i": i, gap: 12 } as React.CSSProperties}>
            <div className="card history-item">
              <div className="stack" style={{ gap: 4 }}>
                <strong>{s.problemTitle}</strong>
                <span className="small subtle">
                  {new Date(s.startedAt).toLocaleString()} · {fmtClock(s.durationSec)} · {s.hintsUsed} hint{s.hintsUsed === 1 ? "" : "s"}
                </span>
                <span className="mini-scores" aria-label="Scores">
                  {s.scorecard.categories.map((c) => (
                    <span key={c.category} title={CATEGORY_LABELS[c.category]}>
                      {c.score ?? "–"}
                    </span>
                  ))}
                </span>
              </div>
              <div className="row">
                <button className="btn sm" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                  {open === s.id ? "Hide" : "View scorecard"}
                  <IconChevronDown size={14} style={{ transform: open === s.id ? "rotate(180deg)" : undefined, transition: "transform 200ms" }} />
                </button>
                <button className="btn sm danger icon" onClick={() => remove(s.id)} aria-label={`Delete ${s.problemTitle} session`}>
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
            {open === s.id && <ScorecardView session={s} />}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmAll}
        title="Delete every saved session?"
        body="This removes all transcripts and scorecards from this browser. It can't be undone."
        confirmLabel="Delete all"
        danger
        onConfirm={() => {
          deleteAllSessions();
          setSessions([]);
          setConfirmAll(false);
        }}
        onCancel={() => setConfirmAll(false)}
      />
    </main>
  );
}
