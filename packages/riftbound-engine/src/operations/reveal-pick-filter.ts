/**
 * Shared predicate for `reveal-and-pick` filters.
 *
 * Both the `reveal-hand` effect handler (which must SKIP the whole
 * choose/recycle instruction when no revealed card can legally be chosen —
 * rule 359.3.e.11) and `resolvePendingChoice` (which validates an actual pick)
 * read the same filter, so the matching lives in one leaf module.
 */
import { getGlobalCardRegistry } from "./card-lookup";

export interface RevealPickFilter {
  readonly cardTypes?: readonly string[];
  readonly domains?: readonly string[];
  readonly excludeCardTypes?: readonly string[];
  readonly maxMight?: number;
  readonly minEnergyCost?: number;
}

export function matchesRevealPickFilter(filter: RevealPickFilter | undefined, cardId: string): boolean {
  if (filter === undefined) {
    return true;
  }
  const registry = getGlobalCardRegistry();

  const excluded = filter.excludeCardTypes;
  if (excluded && excluded.length > 0) {
    const cardType = registry.get(cardId)?.cardType;
    if (cardType && excluded.includes(cardType)) {
      return false;
    }
  }
  // rule-id: unl-139-219 — "You may choose a UNIT from it": an allow-list of
  // card types on the pick.
  const allowedTypes = filter.cardTypes;
  if (allowedTypes && allowedTypes.length > 0) {
    const cardType = registry.get(cardId)?.cardType;
    if (cardType && !allowedTypes.includes(cardType)) {
      return false;
    }
  }
  // rule 135.2 (ven-085-166 Decree of Strength) — "choose a Mind card from
  // it": the filter is a DOMAIN allow-list; a multi-domain card qualifies when
  // any of its domains is listed.
  const allowedDomains = filter.domains;
  if (allowedDomains && allowedDomains.length > 0) {
    const d = registry.get(cardId)?.domain;
    const ds = d === undefined ? [] : Array.isArray(d) ? d : [d];
    if (!ds.some((x) => allowedDomains.includes(x))) {
      return false;
    }
  }
  // rule-id: ogn-242-298 — "a unit … that has Might up to 1 more than the
  // killed unit": a Might ceiling on the pick, read from printed Might.
  const maxMight = filter.maxMight;
  if (typeof maxMight === "number" && registry.getMight(cardId) > maxMight) {
    return false;
  }
  // rule 206 (unl-064-219 Fate Weaver) — "a spell with Energy cost [4] or
  // more": the floor reads the card's PRINTED Energy cost; Power pips never
  // count toward it.
  const minEnergyCost = filter.minEnergyCost;
  if (typeof minEnergyCost === "number" && registry.getEnergyCost(cardId) < minEnergyCost) {
    return false;
  }
  return true;
}
