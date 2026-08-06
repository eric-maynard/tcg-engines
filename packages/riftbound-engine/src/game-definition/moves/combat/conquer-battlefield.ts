/**
 * conquerBattlefield move (split from combat.ts).
 */

import type {
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { createInteractionState, getActiveShowdown, getTurnState } from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { hasPlayerWon } from "../../win-conditions/victory";
import {
  applyScoreReplacement,
  canPlayerScoreAtBattlefield,
  finalPointConquerDrawsInstead,
} from "../../../operations/scoring-rules";

type Defs = GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>;

/**
 * Conquer Battlefield
 *
 * Take control of a battlefield.
 * This happens when attackers win combat or move to an uncontrolled battlefield.
 */
export const conquerBattlefield: Defs["conquerBattlefield"] = {
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
    // Rule 140.1.b/c + 589.1.a: Conquer is a Discretionary Action,
    // legal only in a Neutral Open state (no chain, no showdown).
    const interaction = state.interaction ?? createInteractionState();
    if (getTurnState(interaction) !== "neutral-open") {
      return false;
    }

    // Rule 548.2: Cannot conquer while a showdown is active at this battlefield
    if (state.interaction) {
      const activeShowdown = getActiveShowdown(state.interaction);
      if (
        activeShowdown?.active &&
        activeShowdown.battlefieldId === context.params.battlefieldId
      ) {
        return false;
      }
    }

    const bf = state.battlefields[context.params.battlefieldId];
    if (!bf) {
      return false;
    }
    if (bf.controller === context.params.playerId) {
      return false;
    }

    // Player must have units at the battlefield
    const bfZoneId = `battlefield-${context.params.battlefieldId}` as CoreZoneId;
    const allCards = context.zones.getCardsInZone(bfZoneId);
    let hasPlayerUnit = false;
    let hasOpponentUnit = false;
    for (const cardId of allCards) {
      const owner = context.cards.getCardOwner(cardId);
      if ((owner as string) === context.params.playerId) {
        hasPlayerUnit = true;
      } else {
        hasOpponentUnit = true;
      }
    }

    // Can only conquer if player has units and opponent does not
    return hasPlayerUnit && !hasOpponentUnit;
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

    const results: { playerId: string; battlefieldId: string }[] = [];

    for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
      if (bf.controller === (context.playerId as string)) {
        continue;
      }

      // Rule 548.2: Cannot conquer while a showdown is active at this battlefield
      if (state.interaction) {
        const enumShowdown = getActiveShowdown(state.interaction);
        if (enumShowdown?.active && enumShowdown.battlefieldId === bfId) {
          continue;
        }
      }

      const bfZoneId = `battlefield-${bfId}` as CoreZoneId;
      const allCards = context.zones.getCardsInZone(bfZoneId);
      let hasPlayerUnit = false;
      let hasOpponentUnit = false;
      for (const cardId of allCards) {
        const owner = context.cards.getCardOwner(cardId);
        if ((owner as string) === (context.playerId as string)) {
          hasPlayerUnit = true;
        } else {
          hasOpponentUnit = true;
        }
      }

      if (hasPlayerUnit && !hasOpponentUnit) {
        results.push({
          battlefieldId: bfId,
          playerId: context.playerId as string,
        });
      }
    }
    return results;
  },
  reducer: (draft, context) => {
    const { playerId, battlefieldId } = context.params;

    const battlefield = draft.battlefields[battlefieldId];
    if (battlefield) {
      battlefield.controller = playerId;
      battlefield.contested = false;
      battlefield.contestedBy = undefined;
    }

    // Track conquered battlefield for this turn
    if (!draft.conqueredThisTurn[playerId]) {
      draft.conqueredThisTurn[playerId] = [];
    }
    draft.conqueredThisTurn[playerId].push(battlefieldId);

    // Award 1 VP for conquering (rule 630.1)
    // Blocked if a battlefield ability (e.g. Forgotten Monument) prevents
    // This player from scoring here right now.
    const scoringAllowed = canPlayerScoreAtBattlefield(draft, playerId, battlefieldId);
    const player = draft.players[playerId];
    // rule 471.1.b.1: the Final Point by conquer requires every battlefield
    // scored this turn; otherwise the player draws a card instead and the
    // battlefield is NOT recorded as scored.
    const drewInstead =
      scoringAllowed && finalPointConquerDrawsInstead(draft, playerId, battlefieldId, context);
    // Rule 571.4: a board `score` replacement (e.g. Otterpus) substitutes for the point.
    if (player && scoringAllowed && !drewInstead && !applyScoreReplacement(draft, playerId, context)) {
      player.victoryPoints += 1;
    }

    // Track as scored this turn to prevent double-scoring
    if (!drewInstead) {
      if (!draft.scoredThisTurn[playerId]) {
        draft.scoredThisTurn[playerId] = [];
      }
      draft.scoredThisTurn[playerId].push(battlefieldId);
    }

    // Emit "conquer" event so triggered abilities fire
    // (e.g. Blade Dancer's "When you conquer, pay 1 to ready me")
    fireTriggers(
      { battlefieldId, playerId, type: "conquer" },
      {
        cards: context.cards,
        counters: context.counters,
        draft,
        zones: context.zones,
      },
    );

    // Check for victory
    if (player && hasPlayerWon(draft, playerId)) {
      draft.status = "finished";
      draft.winner = playerId;

      context.endGame?.({
        metadata: { finalScore: player.victoryPoints, method: "conquer" },
        reason: "victory_points",
        winner: playerId as CorePlayerId,
      });
    }
  },
};
