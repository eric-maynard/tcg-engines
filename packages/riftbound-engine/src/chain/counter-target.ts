/**
 * Counter-target legality — shared by the play-time gate/enumerator
 * (rule 355.8) and the `counter` effect handler so all three agree on which
 * chain items a given counter effect may hit.
 */

import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { ChainItem } from "./chain-state";

type Comparison = { eq?: number; lt?: number; lte?: number; gt?: number; gte?: number };
type CounterTargetObject = { type?: string; filter?: unknown };

function within(value: number, cmp: unknown): boolean {
  if (typeof cmp !== "object" || cmp === null) return true;
  const c = cmp as Comparison;
  if (c.eq !== undefined && value !== c.eq) return false;
  if (c.lt !== undefined && !(value < c.lt)) return false;
  if (c.lte !== undefined && !(value <= c.lte)) return false;
  if (c.gt !== undefined && !(value > c.gt)) return false;
  if (c.gte !== undefined && !(value >= c.gte)) return false;
  return true;
}

/** True when the counter effect only hits spells (not abilities). */
export function counterWantsSpell(effect: { target?: unknown } | undefined): boolean {
  const tgt = effect?.target;
  return (
    tgt === undefined ||
    tgt === "spell" ||
    (typeof tgt === "object" && tgt !== null && (tgt as CounterTargetObject).type === "spell")
  );
}

/**
 * Whether `item` is a legal target for `effect` (a `counter` effect).
 * `sourceCardId` excludes the countering spell itself.
 */
export function isLegalCounterTarget(
  effect: { target?: unknown } | undefined,
  item: ChainItem | undefined,
  sourceCardId?: string,
): boolean {
  if (!item || item.countered) return false;
  if (sourceCardId !== undefined && item.cardId === sourceCardId) return false;
  if (counterWantsSpell(effect) && item.type !== "spell") return false;
  const tgt = effect?.target;
  if (typeof tgt === "object" && tgt !== null) {
    const raw = (tgt as CounterTargetObject).filter;
    const filters = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    const registry = getGlobalCardRegistry();
    for (const f of filters) {
      if (typeof f !== "object" || f === null) continue;
      // rule 206: cost restrictions read the target's printed cost, not what was paid.
      if ("energyCost" in f && !within(registry.getEnergyCost(item.cardId), (f as { energyCost: unknown }).energyCost)) {
        return false;
      }
      if ("cost" in f && !within(registry.getEnergyCost(item.cardId), (f as { cost: unknown }).cost)) {
        return false;
      }
      if ("powerCost" in f && !within(registry.getPowerCost(item.cardId).length, (f as { powerCost: unknown }).powerCost)) {
        return false;
      }
    }
  }
  return true;
}
