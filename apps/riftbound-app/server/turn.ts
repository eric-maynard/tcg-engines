/**
 * Server move sequencing = the engine's shared TurnDriver
 * (packages/riftbound-engine/src/harness/turn-driver.ts `applyMove`).
 *
 * The server never stages contests, showdowns or combat itself: a move's
 * reducer produces that state, and the driver fires the automatic procedures
 * (resolveFullCombat / endShowdown / resolveChain) right after every move —
 * exactly what the headless harness does. What stays here is app policy:
 * match-log lines and the sandbox Goldfish, both of which act only through
 * `applySessionMove`.
 */

import { applyMove } from "@tcg/riftbound/harness";
import type { ApplyMoveResult, ProcedureRun } from "@tcg/riftbound/harness";
import { actorName, makeLogEntry } from "../src/narrator";
import { anchorKeyAfterLastMove, buildAvailableMoves, buildGameSnapshot } from "./snapshot";
import type { GameSession } from "./state";

export type SessionMoveResult = ApplyMoveResult;

/**
 * Determine the next player in a two-player game.
 */
export function getNextPlayer(session: GameSession, currentPlayerId: string): string {
  const [p1, p2] = session.players;
  return currentPlayerId === p1 ? p2 : p1;
}

function logProcedures(session: GameSession, runs: readonly ProcedureRun[]): void {
  for (const run of runs) {
    if (!run.success) {
      continue;
    }
    if (run.moveId === "resolveFullCombat") {
      session.log.push(
        makeLogEntry(`Combat resolved at ${String(run.params.battlefieldId ?? "")}.`, {
          key: anchorKeyAfterLastMove(session, `proc${session.log.length}`),
          rewindable: true,
        }),
      );
    }
  }
}

/**
 * THE server entry point for executing a move on a session: one call into the
 * shared driver (endTurn rotation, the move itself, automatic procedures),
 * plus the match-log lines the app narrates on top.
 */
export function applySessionMove(
  session: GameSession,
  playerId: string,
  moveId: string,
  params: Record<string, unknown>,
): SessionMoveResult {
  // rule 128.4 — a pick taken out of a PRIVATE look (nothing was revealed,
  // 424.1) must not be named in the shared match log. This is the one choke
  // point that still sees the open prompt, so stamp the recorded params here;
  // `formatMoveLog` narrates a flagged pick generically.
  let recordedParams = params;
  if (moveId === "resolvePendingChoice") {
    const open = session.engine.getState().pendingChoice as
      | { private?: boolean; revealPick?: boolean }
      | undefined;
    // rule 424.1 (unl-064-219 Fate Weaver) — "reveal … and draw it": the look
    // was private but the PICK is public, so the log names it.
    if (open?.private && !open.revealPick) {
      recordedParams = { ...params, privateChoice: true };
    }
  }
  // DESIGN.md §Pausing inside a resolving item — the engine can stop part-way
  // through a resolving item (a costed die shield answered between two damage
  // instances). The browser client renders prompts and plays, not procedures,
  // so the server continues the item inside the same undo group: the human sees
  // the completed resolution, and one Rewind still takes back the whole action.
  const result = applyMove(session.engine, session.players, playerId, moveId, recordedParams, {
    resumeSuspended: true,
  });
  if (!result.success) {
    return result;
  }
  if (moveId === "endTurn") {
    const after = session.engine.getState();
    // rule 517.1 / 515.2.a — Ending/Beginning steps legitimately hold while
    // their triggers sit on the chain; the flow finishes the rotation itself.
    if (after.turn.phase !== "ending") {
      const actualNext = after.turn.activePlayer || result.next || getNextPlayer(session, playerId);
      // Anchored to the endTurn entry so a Rewind of the turn drops the line too.
      session.log.push(
        makeLogEntry(`Turn passed to ${session.playerNames[actualNext] ?? actualNext}.`, {
          key: anchorKeyAfterLastMove(session, `turn${session.log.length}`),
        }),
      );
    }
  }
  logProcedures(session, result.procedures);
  return result;
}

/**
 * Auto-play for the Goldfish in sandbox mode.
 *
 * Policy only (which legal move the Goldfish takes); every action goes
 * through `applySessionMove`, so procedures and turn rotation behave exactly
 * as they do for a human seat. Loops until the Goldfish has nothing to do.
 */
export function sandboxAutoPlay(session: GameSession, goldfish: string): void {
  const MAX_ITERATIONS = 20; // Safety valve to prevent infinite loops
  let acted = true;
  let iterations = 0;
  let actions = 0; // moves the Goldfish actually made (iterations counts loop passes, incl. the final no-op pass)
  const act = (seat: string, moveId: string, params: Record<string, unknown>, line?: string): boolean => {
    const r = applySessionMove(session, seat, moveId, params);
    if (r.success && line) {
      session.log.push(
        makeLogEntry(line, { key: anchorKeyAfterLastMove(session, `gf${session.log.length}`), rewindable: true }),
      );
    }
    return r.success;
  };
  const goldName = actorName(goldfish, session.playerNames);

  while (acted && iterations < MAX_ITERATIONS) {
    acted = false;
    iterations++;
    const state = session.engine.getState();
    if (state.status !== "playing") {break;}

    // Goldfish-owned start/end-of-turn triggers during the GOLDFISH's turn: the
    // human technically receives priority to respond, but in solo practice that
    // parks the goldfish turn in the beginning phase until the human presses
    // Space (looks like a hang, and the eventual Space reads as "skipped a turn").
    // If every chain item is a goldfish-controlled triggered ability and it is the
    // goldfish's turn, pass on the human's behalf so the turn completes.
    const chain = state.interaction?.chain;
    const human = session.players.find((p) => p !== goldfish);
    if (
      chain?.active && human && chain.activePlayer === human &&
      state.turn.activePlayer === goldfish &&
      chain.items.length > 0 &&
      chain.items.every((it: { controller?: string; triggered?: boolean }) => it.controller === goldfish && it.triggered)
    ) {
      // `sandboxAuto` marks the pass as made BY the Goldfish driver on the human's
      // behalf (server/rewind.ts skips it like any Goldfish action).
      if (act(human, "passChainPriority", { playerId: human, sandboxAuto: true })) { acted = true; actions++; continue; }
    }

    // Auto-pass chain priority if Goldfish has it
    if (state.interaction?.chain?.active && state.interaction.chain.activePlayer === goldfish) {
      if (act(goldfish, "passChainPriority", { playerId: goldfish }, `${goldName} passed priority.`)) {
        acted = true;
      actions++;
        continue;
      }
    }

    const goldMoves = buildAvailableMoves(session, goldfish);

    // Auto-resolve any pending choice addressed to the goldfish (discard,
    // pick-from-revealed, choose-target, combat-damage split). Without this the
    // game deadlocks — pendingChoice blocks every other move for both players.
    const pending = (state as { pendingChoice?: { prompter?: string; playerId?: string } }).pendingChoice;
    if (pending && (pending.prompter ?? pending.playerId) === goldfish) {
      const pick = goldMoves.find((m) => m.moveId === "resolvePendingChoice");
      if (pick && act(goldfish, "resolvePendingChoice", pick.params, `${goldName} resolved a choice.`)) {
        acted = true;
      actions++;
        continue;
      }
    }

    // Auto-pass showdown focus if Goldfish has it
    const passFocus = goldMoves.find((m) => m.moveId === "passShowdownFocus");
    if (passFocus && act(goldfish, "passShowdownFocus", passFocus.params, `${goldName} passed focus.`)) {
      acted = true;
      actions++;
      continue;
    }

    if (state.turn.activePlayer === goldfish) {
      // rule 323.12 — a staged showdown the Cleanup left for the turn player to
      // begin (several staged at once): the Goldfish just takes the first.
      const begin = goldMoves.find((m) => m.moveId === "startShowdown");
      if (begin && act(goldfish, "startShowdown", begin.params)) {
        acted = true;
      actions++;
        continue;
      }
      const conquer = goldMoves.find(
        (m) => m.moveId === "conquerBattlefield" && (m.params as { playerId?: string }).playerId === goldfish,
      );
      if (conquer && act(goldfish, "conquerBattlefield", conquer.params, `${goldName} conquered a battlefield.`)) {
        acted = true;
      actions++;
        continue;
      }

      // Auto end turn if it's the Goldfish's turn. endTurn is rejected while a
      // chain is open (rule 515.3.b / 515.4.b); the driver restores the flow's
      // current player itself in that case.
      if (act(goldfish, "endTurn", { playerId: goldfish }, `${goldName} ended their turn.`)) {
        acted = true;
      actions++;
        continue;
      }
    }
  }

  // Broadcast only if the Goldfish actually did something — a no-op pass must not
  // push a redundant state_update (it re-rendered clients ~500ms after every human
  // move and swallowed UI state such as an expanded rune group).
  if (actions > 0) {
    session.seq++;
    for (const [, client] of session.clients) {
      const clientMoves = buildAvailableMoves(session, client.playerId);
      try {
        client.ws.send(JSON.stringify({
          moveId: "sandboxAutoPlay",
          moves: clientMoves,
          playerId: goldfish,
          seq: session.seq,
          // rule 357.1.a — one SEAT-LESS snapshot reused for every client is
          // what made the hand go dead: `reachablePlays` / `unaffordableTargets`
          // answer "what could THIS seat still pay for?", so a snapshot built
          // with no viewer ships them empty. The Goldfish auto-passes right
          // through to the human's next Main Phase, so that seat-less frame was
          // the LAST one the human held while looking at their opening hand —
          // every card inert until they touched something themselves. Build it
          // per seat, as every other broadcaster here does.
          state: buildGameSnapshot(session, client.playerId),
          type: "state_update",
        }));
      } catch { /* Disconnected */ }
    }
  }
}
