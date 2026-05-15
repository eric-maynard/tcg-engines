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

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { executeEffect } from "../../abilities/effect-executor";
import type { EffectContext, ExecutableEffect } from "../../abilities/effect-executor";
import { dispatchEvent } from "../../events/dispatcher";
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
  // Pick-mode uses a numeric option index in its own move param —
  // `resolvePendingChoice.pickedCardId` is not consulted for this variant.
  if (choice.type === "pick-mode") {
    return false;
  }
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
 * Returns true when the given option index is a valid pick for a
 * pick-mode pendingChoice.
 */
export function isValidPendingOption(choice: PendingChoice, index: number): boolean {
  if (choice.type !== "pick-mode") {
    return false;
  }
  return Number.isInteger(index) && index >= 0 && index < choice.options.length;
}

/**
 * Pick a default (goldfish) card for the choice: the first revealed card
 * that passes the filter. Returns undefined if no valid pick exists.
 */
export function pickDefaultForChoice(choice: PendingChoice): string | undefined {
  if (choice.type === "pick-mode") {
    // Pick-mode doesn't pick a card. Callers that goldfish a pick-mode
    // Should consult `options[0]?.index` and use the `pickedOptionIndex`
    // Move param instead.
    return undefined;
  }
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
      if (choice.type === "pick-mode") {
        return isValidPendingOption(choice, context.params.pickedOptionIndex as number);
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
      if (choice.type === "pick-mode") {
        // Pick-mode enumerates by option index, not by revealed card id.
        const results: {
          playerId: string;
          pickedOptionIndex: number;
          pickedCardId?: string;
        }[] = [];
        for (const opt of choice.options) {
          results.push({
            pickedOptionIndex: opt.index,
            playerId: context.playerId as string,
          });
        }
        return results;
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

      // Pick-mode (modal "Choose one — A. B.") — fire the chosen option's
      // Effect through `executeEffect` and clear the pendingChoice.
      if (choice.type === "pick-mode") {
        const { pickedOptionIndex } = context.params;
        if (!isValidPendingOption(choice, pickedOptionIndex as number)) {
          return;
        }
        const option = choice.options[pickedOptionIndex as number];
        if (!option) {
          return;
        }
        // Clear the choice BEFORE firing the option's effect so the chosen
        // Branch can itself set a new pendingChoice (e.g. an option that
        // Does a `look` / `reveal-hand`).
        const optionEffect = option.effect as ExecutableEffect;
        const {sourceCardId} = choice;
        const {sourceZone} = choice;
        const {variables} = choice;
        draft.pendingChoice = undefined;

        // Build the EffectContext from the reducer's `context` so the
        // Option's effect resolves with the same zone/card/counter ops the
        // Engine normally provides during effect resolution.
        const effectCtx: EffectContext = {
          cards: {
            getCardController: context.cards.getCardController as
              | EffectContext["cards"]["getCardController"]
              | undefined,
            getCardMeta: context.cards.getCardMeta as
              EffectContext["cards"]["getCardMeta"],
            getCardOwner: context.cards.getCardOwner,
            setCardController: context.cards.setCardController as
              | EffectContext["cards"]["setCardController"]
              | undefined,
            updateCardMeta: context.cards.updateCardMeta as
              EffectContext["cards"]["updateCardMeta"],
          },
          counters: {
            addCounter: context.counters.addCounter,
            clearCounter: context.counters.clearCounter,
            removeCounter: context.counters.removeCounter,
            setFlag: context.counters.setFlag,
          },
          draft,
          fireTriggers: (event) =>
            dispatchEvent(
              {
                cards: context.cards,
                counters: context.counters,
                draft,
                zones: context.zones,
              } as unknown as Parameters<typeof dispatchEvent>[0],
              event,
            ),
          playerId: choice.prompter as CorePlayerId,
          sourceCardId,
          sourceZone,
          ...(variables ? { variables } : {}),
          zones: {
            drawCards: context.zones.drawCards as EffectContext["zones"]["drawCards"],
            getCardZone: context.zones.getCardZone as EffectContext["zones"]["getCardZone"],
            getCardsInZone: context.zones.getCardsInZone,
            moveCard: context.zones.moveCard as EffectContext["zones"]["moveCard"],
            shuffleZone: context.zones.shuffleZone as
              | EffectContext["zones"]["shuffleZone"]
              | undefined,
          },
        };
        executeEffect(optionEffect, effectCtx);
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
