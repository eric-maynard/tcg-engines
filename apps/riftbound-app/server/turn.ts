/**
 * Turn rotation, end-turn finalization, goldfish auto-play, and post-move
 * auto combat resolution.
 */

import type { PlayerId } from "@tcg/core";
import { actorName, makeLogEntry } from "../src/narrator";
import { buildAvailableMoves, buildGameSnapshot } from "./snapshot";
import type { GameSession } from "./state";

/**
 * Determine the next player in a two-player game.
 */
export function getNextPlayer(session: GameSession, currentPlayerId: string): string {
  const [p1, p2] = session.players;
  return currentPlayerId === p1 ? p2 : p1;
}

/**
 * Prepare the flow manager for a player rotation BEFORE executing the endTurn move.
 *
 * The endTurn move calls flow.endPhase(), which triggers the full phase chain
 * inside executeMove: main → ending → (turn ends) → awaken → beginning →
 * channel → draw → main. The flow's onBegin callbacks (channel runes, draw
 * cards, ready units) use context.getCurrentPlayer(), so we must set the next
 * player on the flow manager BEFORE the move executes. Otherwise those callbacks
 * would operate on the wrong player.
 */
export function preparePlayerRotation(session: GameSession, currentPlayerId: string): string {
  const nextPlayer = getNextPlayer(session, currentPlayerId);
  const flowManager = session.engine.getFlowManager();
  flowManager?.setCurrentPlayer(nextPlayer as PlayerId);
  return nextPlayer;
}

/**
 * Finalize the end-turn after the endTurn move has executed.
 *
 * The engine's FlowManager now runs the full turn cycle (ending → cleanup →
 * awaken → beginning → channel → draw → main); this function only verifies
 * the flow landed on the expected player/phase and appends the turn-passed
 * log entry.
 */
export function finalizeEndTurn(session: GameSession, nextPlayer: string): void {
  // The endTurn move calls flow.endPhase(), and with the FlowManager now in
  // The `mainGame` segment (see finalizePregame), the flow cascades the full
  // Phase chain itself: main → ending (rule 517: clear damage/stun/mightMod,
  // Empty rune pools) → cleanup → next-turn awaken (rule 515.1: ready all) →
  // Beginning (rule 728.1.b Temporary sweep + rule 630.2 Hold scoring) →
  // Channel (rule 515.3 / 644.7) → draw (rule 515.4.b) → main. Nothing to
  // Reimplement here.
  const stateAfter = session.engine.getState();
  // rule-id: 517.1-end-of-turn-triggers — the Ending Step holds while
  // end-of-turn triggers sit on the chain; the flow finishes the rotation on
  // its own once the chain resolves, so don't patch over it.
  if (stateAfter.turn.phase === "ending") {
    return;
  }
  // Rule 734: turn.onEnd may have redirected to an additional-turn owner.
  const actualNext = stateAfter.turn.activePlayer || nextPlayer;
  // rule-id: 515.2.a-beginning-step-triggers — the Beginning Phase holds
  // while start-of-turn triggers sit on the chain; the flow cascades to main
  // once the chain resolves, so don't patch the phase over it.
  if (stateAfter.turn.phase !== "main" && stateAfter.turn.phase !== "beginning") {
    console.warn(
      `Flow state mismatch after endTurn: expected phase=main, ` +
      `got activePlayer=${stateAfter.turn.activePlayer} phase=${stateAfter.turn.phase}. ` +
      "Patching state as safety net.",
    );
    session.engine.applyPatches([
      { op: "replace", path: ["turn", "activePlayer"], value: actualNext },
      { op: "replace", path: ["turn", "phase"], value: "main" },
    ]);
  }

  session.log.push(
    makeLogEntry(
      `Turn passed to ${session.playerNames[actualNext] ?? actualNext}.`,
    ),
  );
}

/**
 * Auto-play for the Goldfish in sandbox mode.
 *
 * Handles chain priority, showdown focus, and full turn end.
 * Loops until the Goldfish has no more automatic actions to take.
 */
export function sandboxAutoPlay(session: GameSession, goldfish: string): void {
  const MAX_ITERATIONS = 20; // Safety valve to prevent infinite loops
  let acted = true;
  let iterations = 0;

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
      const r = session.engine.executeMove("passChainPriority", {
        params: { playerId: human },
        playerId: human as PlayerId,
      });
      if (r.success) { acted = true; continue; }
    }

    // Auto-pass chain priority if Goldfish has it
    if (state.interaction?.chain?.active && state.interaction.chain.activePlayer === goldfish) {
      const result = session.engine.executeMove("passChainPriority", {
        params: { playerId: goldfish },
        playerId: goldfish as PlayerId,
      });
      if (result.success) {
        session.log.push(
          makeLogEntry(
            `${actorName(goldfish, session.playerNames)} passed priority.`,
            { rewindable: true },
          ),
        );
        acted = true;
        continue;
      }
    }

    const goldMoves = session.engine.enumerateMoves(goldfish as PlayerId, { validOnly: true });

    // Auto-resolve any pending choice addressed to the goldfish (discard,
    // pick-from-revealed, choose-target). Without this the game deadlocks —
    // pendingChoice blocks every other move for both players.
    const pending = (state as { pendingChoice?: { prompter?: string; playerId?: string } }).pendingChoice;
    if (pending && (pending.prompter ?? pending.playerId) === goldfish) {
      const pick = goldMoves.find((m) => m.moveId === "resolvePendingChoice");
      if (pick) {
        const r = session.engine.executeMove("resolvePendingChoice", {
          params: pick.params as Record<string, unknown>,
          playerId: goldfish as PlayerId,
        });
        if (r.success) {
          session.log.push(makeLogEntry(
            `${actorName(goldfish, session.playerNames)} resolved a choice.`,
            { rewindable: true },
          ));
          acted = true;
          continue;
        }
      }
    }

    // Auto-pass showdown focus if Goldfish has it
    const passFocus = goldMoves.find((m) => m.moveId === "passShowdownFocus");
    if (passFocus) {
      session.engine.executeMove("passShowdownFocus", {
        params: passFocus.params as Record<string, unknown>,
        playerId: goldfish as PlayerId,
      });
      session.log.push(
        makeLogEntry(
          `${actorName(goldfish, session.playerNames)} passed focus.`,
          { rewindable: true },
        ),
      );
      acted = true;
      continue;
    }

    // Auto-resolve combat / conquer when the human player isn't the one to do
    // it. resolveFullCombat has no player param — the enumerator offers it to
    // whichever player is enumerated, so on the goldfish's turn it falls to the
    // goldfish. conquerBattlefield is per-player.
    if (state.turn.activePlayer === goldfish) {
      const combat = goldMoves.find((m) => m.moveId === "resolveFullCombat");
      if (combat) {
        const r = session.engine.executeMove("resolveFullCombat", {
          params: combat.params as Record<string, unknown>,
          playerId: goldfish as PlayerId,
        });
        if (r.success) {
          session.log.push(makeLogEntry(
            `Combat resolved at ${(combat.params as { battlefieldId?: string }).battlefieldId}.`,
            { rewindable: true },
          ));
          acted = true;
          continue;
        }
      }
      const conquer = goldMoves.find(
        (m) => m.moveId === "conquerBattlefield" &&
          (m.params as { playerId?: string }).playerId === goldfish,
      );
      if (conquer) {
        const r = session.engine.executeMove("conquerBattlefield", {
          params: conquer.params as Record<string, unknown>,
          playerId: goldfish as PlayerId,
        });
        if (r.success) {
          session.log.push(makeLogEntry(
            `${actorName(goldfish, session.playerNames)} conquered a battlefield.`,
            { rewindable: true },
          ));
          acted = true;
          continue;
        }
      }
    }

    // Auto end turn if it's the Goldfish's turn
    if (state.turn.activePlayer === goldfish) {
      const nextForGoldfish = preparePlayerRotation(session, goldfish);
      const endResult = session.engine.executeMove("endTurn", {
        params: { playerId: goldfish },
        playerId: goldfish as PlayerId,
      });
      if (endResult.success) {
        finalizeEndTurn(session, nextForGoldfish);
        session.log.push(
          makeLogEntry(
            `${actorName(goldfish, session.playerNames)} ended their turn.`,
            { rewindable: true },
          ),
        );
        acted = true;
        continue;
      }
      // rule-id: 515.3.b/515.4.b-turn-player-channels-draws — endTurn is rejected while a
      // chain is open (e.g. goldfish start-of-turn triggers). Restore the flow's
      // current player so the pending channel/draw onBegin callbacks still
      // target the goldfish, not the human, once the chain resolves.
      session.engine.getFlowManager()?.setCurrentPlayer(goldfish as PlayerId);
    }
  }

  // If the goldfish took any actions, broadcast updated state
  if (iterations > 0) {
    session.seq++;
    const goldSnapshot = buildGameSnapshot(session);
    for (const [, client] of session.clients) {
      const clientMoves = buildAvailableMoves(session, client.playerId);
      try {
        client.ws.send(JSON.stringify({
          moveId: "sandboxAutoPlay",
          moves: clientMoves,
          playerId: goldfish,
          seq: session.seq,
          state: goldSnapshot,
          type: "state_update",
        }));
      } catch { /* Disconnected */ }
    }
  }
}

/**
 * After unit movement, check if opposing units share a battlefield
 * and auto-resolve combat (contest + resolveFullCombat).
 */
export function autoResolveCombat(session: GameSession, movingPlayerId: string): void {
  const state = session.engine.getState();

  for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
    if (bf.contested) {
      continue; // Already contested, will be resolved at end of turn or separately
    }

    // Check if both players have units at this battlefield
    const bfZoneId = `battlefield-${bfId}`;
    const zones = state.zones ?? {};
    const unitsAtBf = (zones as Record<string, { owner: string }[]>)[bfZoneId] ?? [];
    const owners = new Set(unitsAtBf.map((c: { owner: string }) => c.owner));

    if (owners.size >= 2) {
      // Contest the battlefield
      session.engine.executeMove("contestBattlefield", {
        params: { battlefieldId: bfId, playerId: movingPlayerId },
        playerId: movingPlayerId as PlayerId,
      });

      // Immediately resolve combat
      session.engine.executeMove("resolveFullCombat", {
        params: { battlefieldId: bfId },
        playerId: movingPlayerId as PlayerId,
      });
    }
  }
}
