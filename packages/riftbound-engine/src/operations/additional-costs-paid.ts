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

/**
 * rule 805.1.a / 356.2.b.1 — additional costs another permanent GRANTS this
 * play (a board static's [Accelerate]) are not the card's own printed
 * additional cost, so a bare "if you paid the additional cost" never keys on
 * them; only an explicit `costId` reaches one.
 * Ids mirror `moves/play/cost-model.ts ADDITIONAL_COST_IDS` (leaf module — no import).
 */
const GRANTED_COST_IDS = new Set(["accelerate-granted"]);

/** Is `id` an additional cost another permanent GRANTED this play (rather than one the card prints)? */
export function isGrantedAdditionalCostId(id: string): boolean {
  return GRANTED_COST_IDS.has(id);
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
    return costId === undefined ? v.some((id) => !GRANTED_COST_IDS.has(id)) : v.includes(costId);
  }
  return false;
}
