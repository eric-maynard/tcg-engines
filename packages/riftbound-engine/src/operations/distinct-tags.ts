/**
 * rule-id: unl-046-219 / unl-196-219 — "for each of the following tags among
 * your units — Bird, Cat, Dog, and Poro". The count is over DISTINCT listed
 * tags present on at least one unit you control (two Poros = 1, an enemy Cat =
 * 0), never a unit tally. `_helpers.resolveAmount` does this for effect
 * amounts; the cost path and trigger conditions need the same reading without
 * an effect context, so the board walk lives here.
 */

import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { effectiveTags } from "../abilities/card-tags";
import { getGlobalCardRegistry } from "./card-lookup";

interface ZoneReader {
  getCardsInZone(zoneId: CoreZoneId, playerId?: CorePlayerId): readonly CoreCardId[];
}

interface CardReader {
  getCardController?(cardId: CoreCardId): string | undefined;
  getCardOwner(cardId: CoreCardId): string | undefined;
  getCardMeta?(cardId: CoreCardId): unknown;
}

/** Distinct listed tags carried by units the player controls (base + every battlefield). */
export function countDistinctTagsAmongUnits(
  zones: ZoneReader,
  cards: CardReader | undefined,
  battlefieldIds: readonly string[],
  playerId: string,
  tags: readonly string[],
): number {
  const wanted = new Set(tags.map((t) => t.toLowerCase()));
  const registry = getGlobalCardRegistry();
  const present = new Set<string>();
  const consider = (id: CoreCardId): void => {
    if (registry.getCardType(id as string) !== "unit") {
      return;
    }
    const controller = cards?.getCardController?.(id) ?? cards?.getCardOwner(id);
    if (controller !== playerId) {
      return;
    }
    // rule 135.2.b.3 — a tag gained as the unit was played ("choose Bird, Cat,
    // Dog, or Poro. I gain that tag.") counts wherever a printed tag counts.
    const cardTags = effectiveTags(
      (registry.get(id as string) as { tags?: readonly string[] } | undefined)?.tags,
      cards?.getCardMeta?.(id) as
        | { namedTag?: string; grantedTags?: readonly string[] }
        | undefined,
    );
    for (const t of cardTags) {
      const key = t.toLowerCase();
      if (wanted.has(key)) {
        present.add(key);
      }
    }
  };
  for (const id of zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) {
    consider(id);
  }
  for (const bfId of battlefieldIds) {
    for (const id of zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
      consider(id);
    }
  }
  return present.size;
}
