/**
 * Single damage store (rule 124.1 / 520).
 *
 * Marked damage lives in the `damage` counter (`__counters.damage`, owned by
 * the core counter operations); `meta.damage` is a mirror kept for readers and
 * is written ONLY here. Every writer (spell/ability damage, combat, heal, the
 * end-of-turn clear, zone-change resets, sandbox moves) goes through these
 * helpers so the two can never disagree.
 */

import type { CardId as CoreCardId } from "@tcg/core";

/** Structural slice every move / effect / cleanup / flow context satisfies. */
export interface DamageStoreOps {
  readonly cards: {
    getCardMeta?(cardId: CoreCardId): object | undefined;
    updateCardMeta?(cardId: CoreCardId, meta: Record<string, unknown>): void;
  };
  readonly counters?: {
    addCounter?(cardId: CoreCardId, counter: string, amount: number): void;
    clearCounter?(cardId: CoreCardId, counter: string): void;
  };
}

interface DamageMeta {
  damage?: number;
  __counters?: Record<string, number>;
}

/** Current marked damage on a card (counter store, falling back to the mirror). */
export function getDamage(ops: DamageStoreOps, cardId: string): number {
  const meta = ops.cards.getCardMeta?.(cardId as CoreCardId) as DamageMeta | undefined;
  return Math.max(0, meta?.__counters?.damage ?? 0, meta?.damage ?? 0);
}

/**
 * Set a card's marked damage to exactly `value`, writing the counter and the
 * `meta.damage` mirror together. `extraMeta` rides along in the same meta
 * update (e.g. kill attribution).
 */
export function setDamage(
  ops: DamageStoreOps,
  cardId: string,
  value: number,
  extraMeta?: Record<string, unknown>,
): number {
  const id = cardId as CoreCardId;
  const next = Math.max(0, Math.trunc(value));
  const counters = ops.counters;
  if (counters?.clearCounter) {
    counters.clearCounter(id, "damage");
    if (next > 0) {
      counters.addCounter?.(id, "damage", next);
    }
  }
  const meta = ops.cards.getCardMeta?.(id) as DamageMeta | undefined;
  // Contexts without a counter store (flow hooks, stripped test stubs) still
  // carry the reserved bag on meta when a real engine wrote it earlier — keep
  // it in step so `max(counter, mirror)` readers agree.
  const bag = meta?.__counters;
  const patch: Record<string, unknown> = { damage: next, ...(extraMeta ?? {}) };
  if (bag !== undefined && (bag.damage ?? 0) !== next && !counters?.clearCounter) {
    patch.__counters = { ...bag, damage: next };
  }
  ops.cards.updateCardMeta?.(id, patch);
  return next;
}

/** Add `amount` damage; returns the new total. */
export function addDamage(
  ops: DamageStoreOps,
  cardId: string,
  amount: number,
  extraMeta?: Record<string, unknown>,
): number {
  if (amount <= 0) {
    if (extraMeta) {
      ops.cards.updateCardMeta?.(cardId as CoreCardId, extraMeta);
    }
    return getDamage(ops, cardId);
  }
  return setDamage(ops, cardId, getDamage(ops, cardId) + amount, extraMeta);
}

/** Remove up to `amount` damage (heal); returns the new total. */
export function removeDamage(ops: DamageStoreOps, cardId: string, amount: number): number {
  if (amount <= 0) {
    return getDamage(ops, cardId);
  }
  return setDamage(ops, cardId, getDamage(ops, cardId) - amount);
}

/** Clear all marked damage (heal fully / zone-change reset). */
export function clearDamage(ops: DamageStoreOps, cardId: string, extraMeta?: Record<string, unknown>): void {
  setDamage(ops, cardId, 0, extraMeta);
}
