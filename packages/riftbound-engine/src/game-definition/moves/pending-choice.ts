/**
 * Pending-choice moves.
 *
 * Handles the "opponent reveals their hand, active player picks a card"
 * flow used by Sabotage, Mindsplitter, and Ashe Focused.
 *
 * A `reveal-hand` effect places a `PendingChoice` on the game state and
 * pauses play. `resolvePendingChoice` is the only legal move while the
 * choice is pending; it validates the pick against the filter, applies
 * the stored effect (recycle / banish / discard), and clears the state.
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import { executeEffect } from "../../abilities/effect-executor";
import type { ExecutableEffect } from "../../abilities/effect-executor";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type {
  PendingChoice,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";
import { buildEffectContext } from "./chain-moves";

/**
 * Returns true when the given card ID is a valid pick for the pending
 * choice (i.e., is in the revealed snapshot and passes the filter).
 */
export function isValidPendingPick(choice: PendingChoice, cardId: string): boolean {
  if (choice.type !== "reveal-and-pick") {
    return false;
  }
  if (!choice.revealed.includes(cardId)) {
    return false;
  }
  const excluded = choice.filter?.excludeCardTypes;
  if (excluded && excluded.length > 0) {
    const def = getGlobalCardRegistry().get(cardId);
    const cardType = def?.cardType;
    if (cardType && excluded.includes(cardType)) {
      return false;
    }
  }
  return true;
}

/**
 * Pick a default (goldfish) card for the choice: the first revealed card
 * that passes the filter. Returns undefined if no valid pick exists.
 */
export function pickDefaultForChoice(choice: PendingChoice): string | undefined {
  if (choice.type === "name-card") {
    return choice.options[0];
  }
  if (choice.type === "choose-target" || choice.type === "choose-destination") {
    return choice.options[0];
  }
  return choice.revealed.find((id) => isValidPendingPick(choice, id));
}

/**
 * Returns the target zone a picked card is moved to based on the stored
 * `onPicked` action.
 */
function onPickedTargetZone(action: "recycle" | "banish" | "discard"): CoreZoneId {
  switch (action) {
    case "recycle": {
      return "mainDeck" as CoreZoneId;
    }
    case "banish": {
      return "banishment" as CoreZoneId;
    }
    case "discard": {
      return "trash" as CoreZoneId;
    }
  }
}

export const pendingChoiceMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  resolvePendingChoice: {
    condition: (state, context) => {
      const choice = state.pendingChoice;
      if (!choice) {
        return false;
      }
      if (choice.type === "choose-target") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return choice.options.includes(context.params.pickedCardId as string);
      }
      if (choice.type === "choose-destination") {
        if (choice.playerId !== context.params.playerId) {
          return false;
        }
        return choice.options.includes(context.params.pickedZoneId as string);
      }
      if (choice.prompter !== context.params.playerId) {
        return false;
      }
      if (choice.type === "name-card") {
        // Rule 762: any legal card name is valid; the enumerated `options`
        // are the names known to this game's registry.
        const name = context.params.pickedName;
        return typeof name === "string" && choice.options.includes(name);
      }
      return isValidPendingPick(choice, context.params.pickedCardId as string);
    },
    enumerator: (state, context) => {
      const choice = state.pendingChoice;
      if (!choice) {
        return [];
      }
      if (choice.type === "choose-target") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return choice.options.map((cardId) => ({
          pickedCardId: cardId,
          playerId: context.playerId as string,
        }));
      }
      if (choice.type === "choose-destination") {
        if (choice.playerId !== (context.playerId as string)) {
          return [];
        }
        return choice.options.map((zoneId) => ({
          pickedZoneId: zoneId,
          playerId: context.playerId as string,
        }));
      }
      if (choice.prompter !== (context.playerId as string)) {
        return [];
      }
      if (choice.type === "name-card") {
        return choice.options.map((name) => ({
          pickedName: name,
          playerId: context.playerId as string,
        }));
      }
      const results: { playerId: string; pickedCardId: string }[] = [];
      for (const cardId of choice.revealed) {
        if (isValidPendingPick(choice, cardId)) {
          results.push({
            pickedCardId: cardId,
            playerId: context.playerId as string,
          });
        }
      }
      return results;
    },
    reducer: (draft, context) => {
      const choice = draft.pendingChoice;
      if (!choice) {
        return;
      }

      if (choice.type === "choose-target") {
        const picked = context.params.pickedCardId as string;
        if (!choice.options.includes(picked)) {
          return;
        }
        const effectCtx = {
          ...buildEffectContext(draft, choice.playerId, choice.sourceCardId, context),
          boundTargets: [picked],
        };
        executeEffect(choice.effect as ExecutableEffect, effectCtx);
        draft.pendingChoice = undefined;
        return;
      }

      if (choice.type === "choose-destination") {
        const zoneId = context.params.pickedZoneId as string;
        if (!choice.options.includes(zoneId)) {
          return;
        }
        context.zones.moveCard({
          cardId: choice.cardId as CoreCardId,
          targetZoneId: zoneId as CoreZoneId,
        });
        draft.pendingChoice = undefined;
        return;
      }

      if (choice.type === "name-card") {
        // Rule 762 / 383.2.b: record the chosen name on the source card so
        // linked abilities ("cards with that name") can read it.
        const name = context.params.pickedName;
        if (typeof name !== "string" || !choice.options.includes(name)) {
          return;
        }
        context.cards.updateCardMeta(choice.sourceCardId as CoreCardId, {
          namedCard: name,
        } as Partial<RiftboundCardMeta>);
        draft.pendingChoice = undefined;
        return;
      }

      const { pickedCardId } = context.params;

      if (!isValidPendingPick(choice, pickedCardId as string)) {
        return;
      }

      const targetZoneId = onPickedTargetZone(choice.onPicked);
      const moveParams: {
        cardId: CoreCardId;
        targetZoneId: CoreZoneId;
        position?: "top" | "bottom";
      } = {
        cardId: pickedCardId as CoreCardId,
        targetZoneId,
      };
      // Recycle → bottom of main deck (rule: recycle places at bottom).
      if (choice.onPicked === "recycle") {
        moveParams.position = "bottom";
      }
      context.counters.clearAllCounters(pickedCardId as CoreCardId);
      context.zones.moveCard(moveParams);

      // Clear the pending choice so play can resume.
      draft.pendingChoice = undefined;
    },
  },
};
