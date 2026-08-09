/**
 * Riftbound Counter/Token Moves
 *
 * Moves for managing counters and tokens on cards:
 * exhausted state, damage, buffs, and stun.
 */

import type { CardId as CoreCardId, GameMoveDefinitions } from "@tcg/core";
import { withPostMoveCleanup } from "../../cleanup/post-move-cleanup";
import { clearDamage, removeDamage } from "../../operations/damage-store";
import { dealDamage } from "../../operations/deal-damage";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";

/**
 * Counter/token move definitions.
 *
 * rule 520 / 428.1.a.2 — sandbox damage and counter edits can make a unit
 * lethal, so every move here runs the post-move maintenance pass (static
 * recalc + state-based checks + `die` emission through the leave-board choke
 * point): a unit killed by `addDamage` fires its Deathknell like any other.
 */
export const counterMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = withPostMoveCleanup({
  addBuff: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.counters.setFlag(cardId as CoreCardId, "buffed", true);
    },
  },

  /**
   * Generic counter +/- for the sandbox action panel.
   *
   * Wraps `addCounter` / `removeCounter` from the core counter operations
   * so the UI can apply a single delta across four standard counter kinds
   * (plus, minus, poison, experience). A negative delta removes counters.
   *
   * The counter system underpinning this move lives in `state.cardMetas`
   * (via the reserved `__counters` bag), which `performCleanup` scans as
   * part of the static-ability recalc. Since counters affect game state,
   * we run a cleanup pass after mutation so any passive effects keyed on
   * counter values (e.g., poison thresholds) take effect immediately.
   */
  addCounter: {
    reducer: (_draft, context) => {
      const { cardId, counterType, delta } = context.params;
      if (delta === 0) {
        return;
      }
      if (delta > 0) {
        context.counters.addCounter(cardId as CoreCardId, counterType, delta);
      } else {
        context.counters.removeCounter(cardId as CoreCardId, counterType, -delta);
      }
      // The post-move wrapper runs static recalc + state-based checks so
      // passive effects gated on counter values take effect immediately.
    },
  },

  addDamage: {
    reducer: (draft, context) => {
      const { cardId, amount } = context.params;
      // rule 417 — dealt through the damage choke point (Prevent / Double /
      // immunity apply); the wrapper's maintenance pass reaps a lethal unit
      // and publishes its `die`.
      dealDamage({ cards: context.cards, counters: context.counters, draft, zones: context.zones }, {
        amount,
        source: { kind: "effect", player: context.playerId as string },
        target: cardId as string,
      });
    },
  },

  clearDamage: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      clearDamage(context, cardId as string);
    },
  },

  /**
   * Numeric ±Might / ±Toughness buff from the sandbox action panel.
   *
   * Updates `meta.mightModifier` with the provided deltaMight and, for
   * UI display only, `meta.toughnessModifier` with deltaToughness.
   * mightModifier is the temporary, player-owned buff field (not the
   * `staticMightBonus` field, which is reset every static recalc pass).
   *
   * A state-based-checks pass runs after mutation so static abilities
   * keyed on Might thresholds (e.g., "while mighty") re-evaluate
   * immediately — critical for risk #1 in the gap-closure plan.
   */
  modifyBuff: {
    reducer: (_draft, context) => {
      const { cardId, deltaMight, deltaToughness = 0 } = context.params;
      if (deltaMight === 0 && deltaToughness === 0) {
        return;
      }

      const current = (context.cards.getCardMeta(cardId as CoreCardId) ?? {}) as Partial<
        RiftboundCardMeta
      >;
      const currentMight = current.mightModifier ?? 0;
      const currentToughness = current.toughnessModifier ?? 0;

      context.cards.updateCardMeta(cardId as CoreCardId, {
        mightModifier: currentMight + deltaMight,
        toughnessModifier: currentToughness + deltaToughness,
      } as Partial<RiftboundCardMeta>);
    },
  },

  exhaustCard: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.counters.setFlag(cardId as CoreCardId, "exhausted", true);
    },
  },

  readyCard: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.counters.setFlag(cardId as CoreCardId, "exhausted", false);
    },
  },

  removeBuff: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.counters.setFlag(cardId as CoreCardId, "buffed", false);
    },
  },

  removeDamage: {
    reducer: (_draft, context) => {
      const { cardId, amount } = context.params;
      removeDamage(context, cardId as string, amount);
    },
  },

  stunUnit: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.counters.setFlag(cardId as CoreCardId, "stunned", true);
    },
  },

  unstunUnit: {
    reducer: (_draft, context) => {
      const { cardId } = context.params;
      context.counters.setFlag(cardId as CoreCardId, "stunned", false);
    },
  },
});
