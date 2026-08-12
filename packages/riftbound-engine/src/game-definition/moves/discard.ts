/**
 * Riftbound Discard/Trash Moves
 *
 * Moves for discarding, killing, banishing, and recycling cards.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
  GameMoveDefinitions,
} from "@tcg/core";
import { fireTriggers } from "../../abilities/trigger-runner";
import { withPostMoveCleanup } from "../../cleanup/post-move-cleanup";
import { leaveBoard, removeFromBoard } from "../../operations/leave-board";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { burnOut } from "../../operations/points";

/**
 * Discard/trash move definitions.
 *
 * rule 522: removing a permanent from the board ends its continuous effects —
 * so every removal runs the post-move cleanup (static recalc + state-based
 * checks) before the next action.
 */
export const discardMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = withPostMoveCleanup({
  banishCard: {
    reducer: (draft, context) => {
      const { cardId } = context.params;
      // rule 427.1 / 124.1 / 186.1 — through the leave-board choke point.
      removeFromBoard(
        { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        [cardId as string],
        "banishment",
        { kind: "banish" },
        (event) => fireTriggers(event, { cards: context.cards, counters: context.counters, draft, zones: context.zones }),
      );
    },
  },

  burnOut: {
    /**
     * Rule 607.4.a: Burn Out only fires when a game effect directs it
     * OR when the player has an empty main deck and is attempting a
     * draw / look / mill action. A player cannot fire burnOut as a
     * voluntary move while their main deck still has cards and the
     * caller has not identified a source action.
     *
     * `directed` callers (effect executor, replacement pipeline) bypass
     * the gating because they represent a rule-driven invocation.
     */
    condition: (state, context) => {
      if (state.status !== "playing") {
        return false;
      }
      const { playerId } = context.params;
      const source = context.params.source ?? "directed";
      if (source === "directed") {
        return true;
      }
      // Non-directed (draw/look/mill) sources only legal when the
      // Player's main deck is empty.
      const deck = context.zones.getCardsInZone(
        "mainDeck" as CoreZoneId,
        playerId as CorePlayerId,
      );
      return deck.length === 0;
    },
    reducer: (draft, context) => {
      const { playerId, opponentId } = context.params;
      const source = context.params.source ?? "directed";
      const { zones } = context;

      // Rule 607.2.a/.b (431.2): shuffle the player's trash into their main
      // deck, then the chosen opponent gains 1 point — through awardPoints, so
      // a "can't gain points" static applies (rule 054.1); the victory check is
      // the Cleanup's (rule 472).
      burnOut(draft, playerId, context, { opponentId });

      // Rule 607.2.c: After shuffling and scoring, the player retries
      // The original action that caused the burn-out. Only the `draw`
      // Source currently has a concrete retry path in the engine; the
      // Others (look/mill) depend on the calling effect to re-run.
      const retryCards = zones.getCardsInZone(
        "mainDeck" as CoreZoneId,
        playerId as CorePlayerId,
      );
      if (source === "draw" && retryCards.length > 0) {
        zones.drawCards({
          count: 1,
          from: "mainDeck" as CoreZoneId,
          playerId: playerId as CorePlayerId,
          to: "hand" as CoreZoneId,
        });
      }

      // Rule 651.2 / 652: Removal from the game is handled by `concede`
      // And by explicit "removed from the game" effects. `burnOut` only
      // Awards VP and reshuffles; repeated burn outs drive the opponent
      // To victoryScore, which is already checked above.
    },
  },

  discardCard: {
    reducer: (draft, context) => {
      const { cardId } = context.params;
      const playerId = context.cards.getCardOwner(cardId as CoreCardId) ?? "";
      // rule 422 / ogn-006-298: the choke point moves it and emits `discard`
      // so "When you discard me…" self-triggers can fire.
      removeFromBoard(
        { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        [cardId as string],
        "trash",
        { by: playerId, kind: "discard" },
        (event) => fireTriggers(event, { cards: context.cards, counters: context.counters, draft, zones: context.zones }),
      );
    },
  },

  drawCard: {
    reducer: (draft, context) => {
      const { playerId, count = 1 } = context.params;
      for (let i = 0; i < count; i++) {
        context.zones.drawCards({
          count: 1,
          from: "mainDeck" as CoreZoneId,
          playerId: playerId as CorePlayerId,
          to: "hand" as CoreZoneId,
        });
        // rule 745 — one card from the top of the Main Deck to the hand is ONE
        // draw, and rule 316 counts them over the whole turn, so this move is a
        // draw event like any other ("when you draw your second card each turn").
        fireTriggers(
          { playerId: playerId as string, type: "draw" },
          { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        );
      }
    },
  },

  killUnit: {
    reducer: (draft, context) => {
      const { cardId } = context.params;
      // rule 428.1 — a sandbox kill is a real death: die replacements,
      // Equipment detach (457.1), 124.1 reset, token cease (186.1) and a
      // `die` event with last-known information (Deathknell fires).
      removeFromBoard(
        { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        [cardId as string],
        "trash",
        { kind: "kill" },
        (event) => fireTriggers(event, { cards: context.cards, counters: context.counters, draft, zones: context.zones }),
      );
    },
  },

  recycleCard: {
    reducer: (draft, context) => {
      const { cardId } = context.params;
      // rule 416.1.a / 124.1 / 186.1 — through the leave-board choke point.
      leaveBoard(
        { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        cardId as string,
        "deck-bottom",
        { kind: "recycle" },
      );
      // rule-id: ogn-235-298 — emit `recycle` for the card's owner so "When
      // you recycle one or more cards to your Main Deck" triggers fire.
      // Guarded so unit-test stubs that omit the full context bags don't crash.
      const owner = context.cards?.getCardOwner?.(cardId as CoreCardId) as string | undefined;
      if (owner && typeof context.zones.getCardsInZone === "function") {
        fireTriggers(
          { cardIds: [cardId as string], playerId: owner, type: "recycle" },
          { cards: context.cards, counters: context.counters, draft, zones: context.zones },
        );
      }
    },
  },
});
