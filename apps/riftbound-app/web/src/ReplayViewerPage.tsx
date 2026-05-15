import { useCallback, useEffect, useRef, useState } from "react";
import { type ReplayResponse, getReplay } from "./lib/profile-api";

/**
 * ReplayViewerPage — Slice 7 (RiftAtlas parity).
 *
 * Replays the move log captured at game-end. Today the viewer is a
 * step-through over the move list — it does NOT rehydrate full engine board
 * state (that requires snapshot-at-each-step storage which we deferred to
 * the engine layer). It still lets a user:
 *   - See every move in order with player + moveId labels
 *   - Walk forward / back step by step
 *   - Auto-play at 1s per move with pause / rewind
 *
 * The replay is rendered as a styled timeline so it reads well even without
 * a full board rehydration. Slice 7.x can add an engine "rebuild from log"
 * helper that replays the moves into a fresh `EngineSession` and renders
 * the resulting view inline.
 */
export function ReplayViewerPage({
  gameId,
  onBack,
}: {
  gameId: string;
  onBack: () => void;
}) {
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getReplay(gameId);
        if (cancelled) {return;}
        setReplay(r);
        setStep(0);
      } catch (error) {
        if (cancelled) {return;}
        setError(error instanceof Error ? error.message : String(error));
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    if (!playing || !replay) {return;}
    timer.current = setInterval(() => {
      setStep((s) => {
        const next = s + 1;
        if (next >= replay.moveLog.length) {
          setPlaying(false);
          return replay.moveLog.length;
        }
        return next;
      });
    }, 1000);
    return () => {
      if (timer.current) {clearInterval(timer.current); timer.current = null;}
    };
  }, [playing, replay]);

  const onPlayPause = useCallback(() => {
    setPlaying((p) => !p);
  }, []);
  const onStepFwd = useCallback(() => {
    if (!replay) {return;}
    setStep((s) => Math.min(s + 1, replay.moveLog.length));
  }, [replay]);
  const onStepBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);
  const onRewind = useCallback(() => {
    setStep(0);
    setPlaying(false);
  }, []);

  if (error) {
    return (
      <div className="replay-page" data-testid="replay-page">
        <button type="button" onClick={onBack}>← Back</button>
        <p className="replay-error" data-testid="replay-error">{error}</p>
      </div>
    );
  }
  if (!replay) {
    return (
      <div className="replay-page" data-testid="replay-page">
        <p>Loading replay…</p>
      </div>
    );
  }

  const total = replay.moveLog.length;
  const currentMove = step > 0 ? replay.moveLog[step - 1] : null;

  return (
    <div className="replay-page" data-testid="replay-page">
      <header className="replay-header">
        <button type="button" onClick={onBack} data-testid="replay-back">
          ← Back to profile
        </button>
        <h1>Replay</h1>
        <div className="replay-meta">
          <span>{total} moves</span>
          <span>·</span>
          <span>
            Winner: {replay.winnerUserId ?? (replay.result === "draw" ? "Draw" : "—")}
          </span>
          <span>·</span>
          <span>{new Date(replay.endedAt).toLocaleString()}</span>
        </div>
      </header>

      <section className="replay-controls" data-testid="replay-controls">
        <button type="button" onClick={onRewind} data-testid="replay-rewind">
          ⏪ Rewind
        </button>
        <button type="button" onClick={onStepBack} data-testid="replay-step-back" disabled={step === 0}>
          ◀ Back
        </button>
        <button type="button" onClick={onPlayPause} data-testid="replay-play-pause">
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          type="button"
          onClick={onStepFwd}
          data-testid="replay-step-fwd"
          disabled={step >= total}
        >
          Step ▶
        </button>
        <span className="replay-progress" data-testid="replay-progress">
          {step} / {total}
        </span>
      </section>

      <section className="replay-current">
        <h2>Current step</h2>
        {currentMove ? (
          <div className="replay-step-card" data-testid="replay-step-card">
            <span className="replay-step-seq">#{currentMove.seq}</span>
            <span className="replay-step-player">{currentMove.playerId}</span>
            <span className="replay-step-move">{currentMove.moveId}</span>
            {currentMove.params.cardId
              ? (
                <span className="replay-step-card-id">
                  card: {String(currentMove.params.cardId)}
                </span>
                )
              : null}
            {currentMove.undone
              ? <span className="replay-step-undone">(undone)</span>
              : null}
            {!currentMove.success
              ? <span className="replay-step-failed">FAILED: {currentMove.error}</span>
              : null}
          </div>
        ) : (
          <p data-testid="replay-step-empty">Pre-game (step 0)</p>
        )}
      </section>

      <section className="replay-timeline" data-testid="replay-timeline">
        <h2>Timeline</h2>
        <ol className="replay-timeline-list">
          {replay.moveLog.map((m, i) => (
            <li
              key={m.seq}
              className={`replay-timeline-row ${i < step ? "past" : (i === step ? "current" : "future")} ${m.undone ? "undone" : ""}`}
              data-testid={`replay-timeline-${m.seq}`}
            >
              <span className="replay-timeline-seq">#{m.seq}</span>
              <span className="replay-timeline-player">{m.playerId}</span>
              <span className="replay-timeline-move">{m.moveId}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
