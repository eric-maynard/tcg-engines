/**
 * scorePoint move (split from combat.ts).
 */

import type {
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { createInteractionState, getTurnState } from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { hasPlayerWon } from "../../win-conditions/victory";
import {
  applyScoreReplacement,
  canPlayerScoreAtBattlefield,
  finalPointConquerDrawsInstead,
} from "../../../operations/scoring-rules";
import { areAllies, isTeamGame } from "../../../operations/teams";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Score Point
 *
 * Award a victory point to a player.
 * Two ways to score:
 * - Conquer: Gain control of a battlefield
 * - Hold: Control a battlefield during Beginning Phase
 */
export const scorePoint: Defs["scorePoint"] = {
  condition: (state, context) => {
    if (state.pendingChoice) {
      return false;
    }
    if (state.status !== "playing") {
      return false;
    }
    if (state.turn.activePlayer !== context.params.playerId) {
      return false;
    }
    // Rule 140.1.b/c + 589.1.a: Scoring is a Discretionary Action,
    // legal only in a Neutral Open state (no chain, no showdown).
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }

    const { playerId, battlefieldId } = context.params;

    // Must not have already scored this battlefield this turn
    if (state.scoredThisTurn?.[playerId]?.includes(battlefieldId)) {
      return false;
    }

    // Player must control this battlefield
    const bf = state.battlefields[battlefieldId];
    if (!bf || bf.controller !== playerId) {
      return false;
    }

    // Battlefield abilities (e.g. Forgotten Monument) can block scoring
    if (!canPlayerScoreAtBattlefield(state, playerId, battlefieldId)) {
      return false;
    }

    return true;
  },
  // rule 468 / 469 / 410.2: Scoring is a Limited Action that happens only as
  // part of a Hold (Scoring Step) or a Conquer (establishing Control) — it is
  // never a discretionary action a player may take on demand. This move stays
  // as the engine-internal entry point those two paths use, but it is never
  // offered as a choice.
  enumerator: () => [],
  reducer: (draft, context) => {
    const { playerId, method, battlefieldId } = context.params;
    const { cards, counters, zones } = context;

    // Blocked if a battlefield ability (e.g. Forgotten Monument) prevents
    // This player from scoring here right now.
    const scoringAllowed = canPlayerScoreAtBattlefield(draft, playerId, battlefieldId);

    const player = draft.players[playerId];
    if (!player || !scoringAllowed) {
      // Still record the attempt for idempotence (no VP, no event).
      draft.scoredThisTurn[playerId] = draft.scoredThisTurn[playerId] || [];
      draft.scoredThisTurn[playerId].push(battlefieldId);
      return;
    }

    // rule 471.1.b.1 / 632.1.b.2: the Final Point via conquer requires EVERY
    // battlefield scored this turn; otherwise draw a card instead. The
    // battlefield is intentionally NOT pushed to scoredThisTurn — a later
    // scorePoint this turn (after the others) is still legal.
    // rule 469.1 / 470: the draw replaces the POINT, not the Score — the
    // battlefield is still recorded and the Conquer triggers still fire.
    const drewFinalPointInstead =
      method === "conquer" &&
      finalPointConquerDrawsInstead(draft, playerId, battlefieldId, { cards, zones });

    // Rule 630.1.a: In team-based modes, conquering a battlefield whose
    // Previous controller was a teammate does not grant a victory
    // Point — the team already effectively controlled it. The battlefield
    // Still counts as "scored this turn" so subsequent scorePoint calls
    // Are idempotent, but no VP is awarded.
    const prevController = context.params.previousController ?? null;
    const teamDisqualified =
      method === "conquer" &&
      isTeamGame(draft) &&
      prevController !== null &&
      prevController !== playerId &&
      areAllies(draft, playerId, prevController as string);

    // Rule 571.4: a board `score` replacement (e.g. Otterpus) substitutes for the point.
    if (
      !drewFinalPointInstead &&
      !teamDisqualified &&
      // rule 443.1.a: the skip is method-specific — pass how this point is gained.
      !applyScoreReplacement(draft, playerId, { cards, zones }, method)
    ) {
      player.victoryPoints += 1;
    }

    // Track that this battlefield was scored this turn
    draft.scoredThisTurn[playerId] = draft.scoredThisTurn[playerId] || [];
    draft.scoredThisTurn[playerId].push(battlefieldId);

    // Rule 632.2: emit the appropriate score event so battlefield score
    // Abilities (on-conquer / on-hold) fire. Only the combat path used to
    // Emit these events — non-combat scorePoint invocations (e.g. Hold
    // During Beginning phase, manual Conquer moves) must fire them too.
    const scoreEvent =
      method === "conquer"
        ? ({ battlefieldId, playerId, previousController: prevController, type: "conquer" } as const)
        : ({ battlefieldId, playerId, type: "hold" } as const);
    fireTriggers(scoreEvent, { cards, counters, draft, zones });

    // Check for victory
    if (hasPlayerWon(draft, playerId)) {
      draft.status = "finished";
      draft.winner = playerId;

      context.endGame?.({
        metadata: { finalScore: player.victoryPoints, method },
        reason: "victory_points",
        winner: playerId as CorePlayerId,
      });
    }
  },
};
