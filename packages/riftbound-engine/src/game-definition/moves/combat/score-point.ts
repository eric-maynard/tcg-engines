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
import { canPlayerScoreAtBattlefield } from "../../../operations/scoring-rules";
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
  enumerator: (state, context) => {
    if (state.pendingChoice) {
      return [];
    }
    if (state.status !== "playing") {
      return [];
    }
    if (state.turn.activePlayer !== (context.playerId as string)) {
      return [];
    }
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return [];
    }

    const scoredThisTurn = state.scoredThisTurn[context.playerId as string] ?? [];
    const results: { playerId: string; method: "conquer" | "hold"; battlefieldId: string }[] = [];

    for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
      if (bf.controller !== (context.playerId as string)) {
        continue;
      }
      if (scoredThisTurn.includes(bfId)) {
        continue;
      }
      if (!canPlayerScoreAtBattlefield(state, context.playerId as string, bfId)) {
        continue;
      }

      // Player controls this BF and hasn't scored it this turn
      results.push({
        battlefieldId: bfId,
        method: "conquer",
        playerId: context.playerId as string,
      });
    }
    return results;
  },
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

    // Rule 632.1.b.2: If trying to score the Final Point via conquer, the
    // Player must have scored EVERY battlefield this turn. Otherwise, they
    // Draw a card INSTEAD of scoring. No VP, no score event, no scoredThisTurn
    // Entry for this battlefield.
    const victoryScore = draft.victoryScore ?? 8;
    const isFinalPoint = player.victoryPoints === victoryScore - 1;
    if (isFinalPoint && method === "conquer") {
      const allBattlefieldIds = Object.keys(draft.battlefields ?? {});
      const scoredForPlayer = draft.scoredThisTurn[playerId] ?? [];
      const allScored = allBattlefieldIds.every(
        (bfId) => bfId === battlefieldId || scoredForPlayer.includes(bfId),
      );
      if (!allScored) {
        // Draw a card instead of scoring (rule 632.1.b.2).
        zones.drawCards({
          count: 1,
          from: "mainDeck" as CoreZoneId,
          playerId: playerId as CorePlayerId,
          to: "hand" as CoreZoneId,
        });
        // Intentionally do NOT push to scoredThisTurn — the battlefield was
        // Not scored, so a subsequent scorePoint this turn is still legal
        // (e.g. after scoring other battlefields first).
        return;
      }
    }

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

    if (!teamDisqualified) {
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
        ? ({ battlefieldId, playerId, type: "conquer" } as const)
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
