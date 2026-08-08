/**
 * TurnDriver — the single implementation of "end the turn" and "run the
 * automatic procedures the engine models as moves".
 *
 * `applyMove` is THE sequencing path shared by the harness (EngineBackend),
 * apps/riftbound-app/server (ws + REST move handlers, goldfish auto-play) and
 * testing/playtest: execute one move (endTurn via the rotation below), then
 * fire the automatic procedures the engine models as moves. Everything else —
 * contesting, staging/beginning showdowns, combat roles, focus — is engine
 * state produced by the move reducers themselves, so every caller observes the
 * same `enumerateMoves` menu afterwards.
 */

import type { PlayerId } from "@tcg/core";
import type { HarnessEngine } from "./internal";

export interface EndTurnResult {
  success: boolean;
  /** The player whose turn it now is (or would have been on failure). */
  next: string;
  error?: string;
  errorCode?: string;
}

/**
 * Seat order after `current`, skipping removed players.
 */
export function nextPlayerAfter(
  engine: HarnessEngine,
  players: readonly string[],
  current: string,
): string {
  const removed = new Set(engine.getState().removedPlayers ?? []);
  const idx = players.indexOf(current);
  for (let i = 1; i <= players.length; i++) {
    const candidate = players[(idx + i) % players.length] as string;
    if (!removed.has(candidate)) {
      return candidate;
    }
  }
  return current;
}

/**
 * Drive end-of-turn → start-of-next-turn for the current turn player.
 *
 * The flow's onBegin callbacks (awaken/channel/draw) read
 * getCurrentPlayer(), so the next player is set on the FlowManager BEFORE
 * `endTurn` cascades main → ending → cleanup → awaken → beginning →
 * channel → draw → main. Ending/Beginning phases legitimately HOLD while
 * their triggers sit on the chain (rules 517.1 / 515.2.a); callers observe
 * `state.turn.phase` and keep answering decisions.
 */
export function endTurn(
  engine: HarnessEngine,
  players: readonly string[],
  playerId?: string,
): EndTurnResult {
  const before = engine.getState();
  const cur = playerId ?? before.turn.activePlayer;
  const next = nextPlayerAfter(engine, players, cur);
  const flow = engine.getFlowManager();

  flow?.setCurrentPlayer(next as PlayerId);
  const result = engine.executeMove("endTurn", {
    params: { playerId: cur },
    playerId: cur as PlayerId,
  });
  if (!result.success) {
    flow?.setCurrentPlayer(cur as PlayerId);
    return { error: result.error, errorCode: result.errorCode, next, success: false };
  }

  const after = engine.getState();
  if (after.status !== "playing" || after.turn.phase === "ending") {
    return { next, success: true };
  }
  // Rule 734: turn.onEnd may have redirected to an additional-turn owner.
  const actualNext = after.turn.activePlayer || next;
  if (actualNext !== next) {
    flow?.setCurrentPlayer(actualNext as PlayerId);
  }
  if (after.turn.phase === "beginning") {
    return { next: actualNext, success: true };
  }
  if (after.turn.activePlayer !== actualNext || after.turn.phase !== "main") {
    // Safety net shared with the server: never leave the game between turns.
    engine.applyPatches([
      { op: "replace", path: ["turn", "activePlayer"], value: actualNext },
      { op: "replace", path: ["turn", "phase"], value: "main" },
    ]);
  }
  return { next: actualNext, success: true };
}

/**
 * Engine moves that represent automatic rules procedures rather than
 * player decisions. The driver fires them whenever they are enumerated.
 *  - resolveFullCombat: Combat Damage Step after the combat showdown closed (626)
 *  - endShowdown: pop a showdown everyone passed on (348)
 *  - resolveChain: resolve the top item once all passed (543) — normally
 *    done inside passChainPriority already.
 */
export const PROCEDURE_MOVES: readonly string[] = ["resolveFullCombat", "endShowdown", "resolveChain"];

export interface ProcedureRun {
  moveId: string;
  params: Record<string, unknown>;
  seat: string;
  success: boolean;
  error?: string;
}

/**
 * Fire enumerated procedure moves until none remain (bounded). Executed on
 * behalf of the turn player (they carry no meaningful chooser).
 */
export function runProcedures(engine: HarnessEngine, maxSteps = 16): ProcedureRun[] {
  const runs: ProcedureRun[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const state = engine.getState();
    if (state.status !== "playing" || state.pendingChoice) {
      break;
    }
    const seat = state.turn.activePlayer;
    const legal = engine.enumerateMoves(seat as PlayerId, {
      moveIds: [...PROCEDURE_MOVES],
      validOnly: true,
    });
    let pick = PROCEDURE_MOVES.map((id) => legal.find((m) => m.moveId === id)).find(Boolean);
    if (!pick) {
      // rule 323.13 / 461.1 — the engine's Cleanup leaves TWO OR MORE staged
      // combats unopened because the turn player picks which one begins. That
      // is a real decision, so it is not in PROCEDURE_MOVES; the harness driver
      // (which carries no policy) takes the first offered one so scripted tests
      // keep flowing. `autoProcedures(false)` surfaces the choice instead.
      const starts = engine.enumerateMoves(seat as PlayerId, {
        moveIds: ["startShowdown"],
        validOnly: true,
      });
      if (starts.length < 2) {
        break;
      }
      pick = starts[0];
    }
    if (!pick) {
      break;
    }
    const params = (pick.params ?? {}) as Record<string, unknown>;
    const r = engine.executeMove(pick.moveId, { params, playerId: seat as PlayerId });
    runs.push({
      error: r.success ? undefined : r.error,
      moveId: pick.moveId,
      params,
      seat,
      success: r.success,
    });
    if (!r.success) {
      break;
    }
  }
  return runs;
}

export interface ApplyMoveOptions {
  /** Fire PROCEDURE_MOVES after a successful move (default true). */
  readonly autoProcedures?: boolean;
}

export interface ApplyMoveResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  /** endTurn only: the seat whose turn it now is. */
  next?: string;
  /** Automatic procedures that ran after the move (empty on failure). */
  procedures: ProcedureRun[];
}

/**
 * Execute one move as `seat` and run the automatic follow-ups. `endTurn`
 * goes through the rotation-aware `endTurn()` above; every other move is a
 * plain `executeMove`. This is the only place a driver (harness, app server,
 * bots) should sequence the engine — never re-implement contest / showdown /
 * combat staging on the calling side.
 */
export function applyMove(
  engine: HarnessEngine,
  players: readonly string[],
  seat: string,
  moveId: string,
  params: Record<string, unknown>,
  opts: ApplyMoveOptions = {},
): ApplyMoveResult {
  let next: string | undefined;
  if (moveId === "endTurn") {
    const r = endTurn(engine, players, (params.playerId as string | undefined) ?? seat);
    if (!r.success) {
      return { error: r.error, errorCode: r.errorCode, next: r.next, procedures: [], success: false };
    }
    next = r.next;
  } else {
    const r = engine.executeMove(moveId, { params, playerId: seat as PlayerId });
    if (!r.success) {
      return { error: r.error, errorCode: r.errorCode, procedures: [], success: false };
    }
  }
  const procedures = opts.autoProcedures === false ? [] : runProcedures(engine);
  return { next, procedures, success: true };
}
