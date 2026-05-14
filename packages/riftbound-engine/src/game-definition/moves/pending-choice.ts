/**
 * Pending-choice moves.
 *
 * Handles two flavors of paused-play decisions:
 *
 *  - `reveal-and-pick` — opponent reveals their hand and the active
 *    player picks a card from it (Sabotage / Mindsplitter / Ashe Focused).
 *  - `look-and-pick` — the active player looks at the top N cards of
 *    their own deck and picks 1 (Stacked Deck pattern). The picked card
 *    goes to a destination (default `to-hand`); the rest are recycled.
 *
 * A `reveal-hand` or `look` effect places a `PendingChoice` on the game
 * state and pauses play. `resolvePendingChoice` is the only legal move
 * while the choice is pending; it validates the pick, applies the stored
 * disposition, and clears the state.
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId, GameMoveDefinitions } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type {
  LookAndPickChoice,
  PendingChoice,
  RevealAndPickChoice,
  RiftboundCardMeta,
  RiftboundGameState,
  RiftboundMoves,
} from "../../types";

/**
 * Returns true when the given card ID is a valid pick for the pending
 * choice (i.e., is in the revealed snapshot and passes the filter).
 */
export function isValidPendingPick(choice: PendingChoice, cardId: string): boolean {
  if (!choice.revealed.includes(cardId)) {
    return false;
  }
  if (choice.type === "reveal-and-pick") {
    const excluded = choice.filter?.excludeCardTypes;
    if (excluded && excluded.length > 0) {
      const def = getGlobalCardRegistry().get(cardId);
      const cardType = def?.cardType;
      if (cardType && excluded.includes(cardType)) {
        return false;
      }
    }
  }
  // Look-and-pick has no card-type filter — any revealed card is pickable.
  return true;
}

/**
 * Pick a default (goldfish) card for the choice: the first revealed card
 * that passes the filter. Returns undefined if no valid pick exists.
 */
export function pickDefaultForChoice(choice: PendingChoice): string | undefined {
  return choice.revealed.find((id) => isValidPendingPick(choice, id));
}

/**
 * Returns the target zone a picked card is moved to based on the stored
 * `onPicked` action (reveal-and-pick variant).
 */
function revealOnPickedTargetZone(action: RevealAndPickChoice["onPicked"]): CoreZoneId {
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

/**
 * Returns the target zone for the look-and-pick variant's picked card.
 */
function lookOnPickedTargetZone(action: LookAndPickChoice["onPicked"]): {
  zone: CoreZoneId;
  position?: "top" | "bottom";
} {
  switch (action) {
    case "to-hand": {
      return { zone: "hand" as CoreZoneId };
    }
    case "to-trash": {
      return { zone: "trash" as CoreZoneId };
    }
    case "to-play": {
      // No clean default — most "look then play" effects route through
      // `play-card` semantics. For now we deposit to hand as a safe
      // Fallback so the card isn't lost; callers that need true into-play
      // Semantics should drive a separate effect after resolution.
      return { zone: "hand" as CoreZoneId };
    }
    case "banish": {
      return { zone: "banishment" as CoreZoneId };
    }
    case "recycle": {
      return { position: "bottom", zone: "mainDeck" as CoreZoneId };
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
      if (choice.prompter !== context.params.playerId) {
        return false;
      }
      return isValidPendingPick(choice, context.params.pickedCardId as string);
    },
    enumerator: (state, context) => {
      const choice = state.pendingChoice;
      if (!choice) {
        return [];
      }
      if (choice.prompter !== (context.playerId as string)) {
        return [];
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
      const { pickedCardId } = context.params;

      if (!isValidPendingPick(choice, pickedCardId as string)) {
        return;
      }

      if (choice.type === "reveal-and-pick") {
        const targetZoneId = revealOnPickedTargetZone(choice.onPicked);
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
      } else {
        // Look-and-pick: the picked card goes to `onPicked` destination;
        // The rest of the revealed cards are handled per `onUnpicked`.
        const pickedDest = lookOnPickedTargetZone(choice.onPicked);
        context.counters.clearAllCounters(pickedCardId as CoreCardId);
        context.zones.moveCard({
          cardId: pickedCardId as CoreCardId,
          targetZoneId: pickedDest.zone,
          ...(pickedDest.position ? { position: pickedDest.position } : {}),
        });

        for (const cardId of choice.revealed) {
          if (cardId === pickedCardId) {
            continue;
          }
          switch (choice.onUnpicked) {
            case "recycle": {
              context.zones.moveCard({
                cardId: cardId as CoreCardId,
                position: "bottom",
                targetZoneId: "mainDeck" as CoreZoneId,
              });
              break;
            }
            case "to-top": {
              // Cards are still on top of the deck — moving them to top
              // Preserves order (no-op for already-on-top zone contents,
              // But explicit in case of mid-flight zone churn).
              context.zones.moveCard({
                cardId: cardId as CoreCardId,
                position: "top",
                targetZoneId: "mainDeck" as CoreZoneId,
              });
              break;
            }
            case "trash": {
              context.zones.moveCard({
                cardId: cardId as CoreCardId,
                targetZoneId: "trash" as CoreZoneId,
              });
              break;
            }
          }
        }
      }

      // Clear the pending choice so play can resume.
      draft.pendingChoice = undefined;
    },
  },
};
