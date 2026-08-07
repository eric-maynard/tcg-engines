/**
 * conquerBattlefield move (split from combat.ts).
 */

import type { ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import { fireTriggers } from "../../../abilities/trigger-runner";
import { createInteractionState, getActiveShowdown, getTurnState } from "../../../chain";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";
import { checkVictory, scoreBattlefield, scoreEvents } from "../../../operations/points";

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
    // rule 188: pre-conquer controller — `null` means Uncontrolled.
    const previousController = battlefield?.controller ?? null;
    if (battlefield) {
      battlefield.controller = playerId;
      battlefield.contested = false;
      battlefield.contestedBy = undefined;
    }

    // rule 469.1 / 471: a Conquer worth up to one point — awardPoints applies
    // denial (054.1), method-scoped skips (443.1.a) and the Final Point
    // restriction (471.1.b: draw instead; the battlefield still Scored).
    const { isScore } = scoreBattlefield(draft, playerId, battlefieldId, "conquer", context, {
      previousController,
    });

    // Emit "conquer" event so triggered abilities fire
    // (e.g. Blade Dancer's "When you conquer, pay 1 to ready me").
    // rule 471.2.c: only when the battlefield actually Scored.
    if (isScore) {
      for (const event of scoreEvents(playerId, battlefieldId, "conquer", { previousController })) {
        fireTriggers(event, {
          cards: context.cards,
          counters: context.counters,
          draft,
          zones: context.zones,
        });
      }
    }

    // rule 472 / 319.1 — the Cleanup after this action checks victory.
    checkVictory(draft, { io: context });
  },
};
