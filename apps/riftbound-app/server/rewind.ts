/**
 * Rewind (undo/redo) for a game session — the ONE path shared by the game
 * WebSocket (`{type:"undo"|"redo"}`) and the sandbox REST hooks
 * (`POST /api/game/:id/undo|redo`).
 *
 * Semantics (see DESIGN.md "Rewind"):
 *  - `engine.undo()` rewinds one player-facing ACTION: the move plus the
 *    automatic procedures the driver fired after it (one undo group), and
 *    restores the complete position (state, zones, flow phase/turn, RNG
 *    cursor, trackers, game-over latch, registry copy layers).
 *  - Goldfish sandbox: the Goldfish seat's own actions are skipped over — a
 *    Rewind takes back the HUMAN's last action (and every Goldfish action that
 *    followed it); Redo re-applies them the same way. Nothing re-arms the
 *    Goldfish, so the position never "runs away" after a rewind.
 *  - vs-Claude sandbox: one action per Rewind (the AI's included); the AI seat
 *    is re-armed after a debounce and any decision it was computing on the
 *    pre-rewind position is discarded (`rewindEpoch(session)`).
 *  - The match log stays consistent by construction: move narration is derived
 *    from the engine's APPLIED replay prefix, side lines ("Turn passed to …",
 *    AI rationale) are anchored to the replay entry they follow and disappear
 *    with it, and every rewind appends the "Rewound their last action."
 *    sentinel (anchored at the new tail, unique key) the client reacts to.
 *  - `session.seq` stays monotonic (a rewind is a new frame, not an old one).
 */

import { makeLogEntry } from "../src/narrator";
import { scheduleOpponent } from "./ai-opponent";
import { anchorKeyAfterLastMove, buildAvailableMoves, buildGameSnapshot } from "./snapshot";
import type { GameSession } from "./state";

/** Log line the client treats as the rewind sentinel (public/js/gameplay/render/log.js). */
export const REWIND_LOG_SENTINEL = "Rewound their last action.";
export const REDO_LOG_LINE = "Move redone.";

/**
 * Rewind generation per session: bumped by every undo/redo. An AI decision
 * computed under an older epoch is stale and gets discarded (ai-opponent.ts).
 */
const epochs = new WeakMap<GameSession, number>();

export function rewindEpoch(session: GameSession): number {
  return epochs.get(session) ?? 0;
}

export interface RewindResult {
  ok: boolean;
  error?: string;
  /** Undo groups rewound / re-applied by this call (Goldfish actions included). */
  steps: number;
}

type Entry = ReturnType<GameSession["engine"]["getReplayHistory"]>[number];

/**
 * Seat an action is attributed to for the Goldfish skip: its initiator, except
 * that a pass the Goldfish driver made ON THE HUMAN'S BEHALF (turn.ts
 * sandboxAutoPlay, `params.sandboxAuto`) counts as the Goldfish's.
 */
function actorOf(entry: Entry | undefined, goldfish: string | undefined): string | undefined {
  if (!entry) {
    return undefined;
  }
  const params = entry.context?.params as { sandboxAuto?: boolean } | undefined;
  if (goldfish && params?.sandboxAuto === true) {
    return goldfish;
  }
  return entry.context?.playerId as string | undefined;
}

/** Seat that initiated the action ending at the applied tail (first entry of its undo group). */
function tailActor(session: GameSession, goldfish?: string): string | undefined {
  const history = session.engine.getReplayHistory();
  let i = history.length - 1;
  const group = history[i]?.group;
  while (i > 0 && group !== undefined && history[i - 1]?.group === group) {
    i--;
  }
  return actorOf(history[i], goldfish);
}

/** Seat that initiated the next redoable action, if any. */
function nextRedoActor(session: GameSession, goldfish?: string): string | undefined {
  return actorOf(session.engine.peekRedo(), goldfish);
}

/** The Goldfish seat of a Goldfish sandbox session (undefined for duels and vs-Claude). */
function goldfishSeat(session: GameSession, humanSeat: string): string | undefined {
  if (!session.sandbox || session.opponent?.info.kind === "claude") {
    return undefined;
  }
  return session.players.find((p) => p !== humanSeat);
}

/**
 * Undo or redo on behalf of `actor`, then bring every client up to date.
 * Never throws for game-level refusals — they come back as `{ok:false,error}`.
 */
export function rewindSession(
  session: GameSession,
  kind: "undo" | "redo",
  opts: { actor: string; gameId?: string },
): RewindResult {
  if (session.pregame) {
    return { error: "Cannot rewind during pregame setup", ok: false, steps: 0 };
  }
  const { engine } = session;
  const state = engine.getState();
  // Open design question (DESIGN.md): duels keep "only while playing"; the
  // sandbox may also take back the winning move.
  const rewindableStatus = state.status === "playing" || (session.sandbox && state.status === "finished");
  if (!rewindableStatus) {
    return { error: "Can only rewind during active gameplay", ok: false, steps: 0 };
  }

  const goldfish = goldfishSeat(session, opts.actor);
  let steps = 0;
  if (kind === "undo") {
    if (!engine.canUndo()) {
      return { error: "Nothing to rewind", ok: false, steps: 0 };
    }
    // History floor: the pregame setup moves (deck init, mulligans,
    // transitionToPlay) sit in the same history but are never a rewind target —
    // an undo that lands outside live play is taken straight back.
    const undoOnce = (): boolean => {
      if (!engine.undo()) {
        return false;
      }
      const status = engine.getState().status;
      if (status !== "playing" && status !== "finished") {
        engine.redo();
        return false;
      }
      steps++;
      return true;
    };
    // Goldfish sandbox: skip back over the Goldfish's own actions first…
    while (goldfish && engine.canUndo() && tailActor(session, goldfish) === goldfish && steps < 64) {
      if (!undoOnce()) {
        break;
      }
    }
    // …then take back the human's action.
    const tookBackOwn = engine.canUndo() && tailActor(session, goldfish) !== goldfish && undoOnce();
    if (!tookBackOwn) {
      // Only Goldfish actions (or nothing) were rewindable: put them back so
      // the position never parks on an undriven Goldfish turn.
      for (; steps > 0; steps--) {
        engine.redo();
      }
      return { error: "Nothing to rewind", ok: false, steps: 0 };
    }
  } else {
    if (!engine.canRedo()) {
      return { error: "Nothing to redo", ok: false, steps: 0 };
    }
    if (engine.redo()) {
      steps++;
    }
    while (goldfish && engine.canRedo() && nextRedoActor(session, goldfish) === goldfish && steps < 64) {
      if (!engine.redo()) {
        break;
      }
      steps++;
    }
    if (steps === 0) {
      return { error: "Nothing to redo", ok: false, steps: 0 };
    }
  }

  const epoch = rewindEpoch(session) + 1;
  epochs.set(session, epoch);
  session.log.push(
    makeLogEntry(kind === "undo" ? REWIND_LOG_SENTINEL : REDO_LOG_LINE, {
      key: anchorKeyAfterLastMove(session, `rw${epoch}`),
      rewindable: false,
    }),
  );
  session.seq++;

  // A rewind can hand the cursor to the AI seat; re-arm it after a debounce so
  // several rewind clicks land first (Claude seat only — the Goldfish never
  // acts on a rewind, see above).
  scheduleOpponent(session, { gameId: opts.gameId, humanSeat: opts.actor });

  for (const [, client] of session.clients) {
    try {
      client.ws.send(JSON.stringify({
        moveId: kind,
        moves: buildAvailableMoves(session, client.playerId),
        playerId: opts.actor,
        rewind: { epoch, kind, steps },
        seq: session.seq,
        state: buildGameSnapshot(session, client.playerId),
        type: "state_update",
      }));
    } catch { /* Disconnected */ }
  }
  return { ok: true, steps };
}
