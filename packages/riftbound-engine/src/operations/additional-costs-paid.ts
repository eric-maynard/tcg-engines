/**
 * rule 356.2 / 356.4.f.1 — `draft.additionalCostsPaid[cardId]` records WHICH
 * additional costs a play paid (id list from `moves/play/cost-model.ts`), so
 * "if you paid MY additional cost" can name the cost. Leaf module (types only)
 * so ability code can read it without importing the move layer.
 */

import type { RiftboundGameState } from "../types";

type Ledger = Record<string, boolean | readonly string[]>;

/** Record the ids paid for `cardId` (an empty list = nothing paid). */
export function recordAdditionalCostsPaid(
  draft: RiftboundGameState,
  cardId: string,
  paidIds: readonly string[],
): void {
  const holder = draft as { additionalCostsPaid?: Ledger };
  holder.additionalCostsPaid ??= {};
  holder.additionalCostsPaid[cardId] = paidIds.length > 0 ? [...paidIds] : false;
}

/** Was any (or the named) additional cost of `cardId` paid? Reads the id list and the legacy boolean. */
export function additionalCostWasPaid(
  state: RiftboundGameState,
  cardId: string,
  costId?: string,
): boolean {
  const v = (state as { additionalCostsPaid?: Ledger }).additionalCostsPaid?.[cardId];
  if (v === true) {
    return true;
  }
  if (Array.isArray(v)) {
    return costId === undefined ? v.length > 0 : v.includes(costId);
  }
  return false;
}
