/**
 * Channel-count limits (rule 515.3.b).
 *
 * A static ability may cap how many runes players channel at the start of their
 * Channel Phase — e.g. ven-036-166 (Sandstone Chimera): "While I'm at a
 * battlefield, players only channel 1 rune at the start of their Channel Phase."
 * The static is only in effect while its source is at a battlefield, so only
 * cards in `battlefield-<id>` zones are consulted.
 */

import { getGlobalCardRegistry } from "./card-lookup";

interface ChannelLimitAbility {
  readonly type?: string;
  readonly effect?: { readonly type?: string; readonly amount?: number };
}

/**
 * The smallest channel-count cap imposed by a static on the board, or
 * `undefined` when no card limits channeling.
 */
export function getChannelCountLimit(
  battlefieldIds: readonly string[],
  getCardsInZone: (zoneId: string) => readonly string[],
): number | undefined {
  const registry = getGlobalCardRegistry();
  let limit: number | undefined;

  for (const bfId of battlefieldIds) {
    for (const cardId of getCardsInZone(`battlefield-${bfId}`)) {
      const abilities = (registry.getAbilities(cardId) ?? []) as ChannelLimitAbility[];
      for (const ability of abilities) {
        if (ability?.type !== "static" || ability.effect?.type !== "channel-limit") {
          continue;
        }
        const amount = ability.effect.amount;
        if (typeof amount !== "number") {
          continue;
        }
        limit = limit === undefined ? amount : Math.min(limit, amount);
      }
    }
  }

  return limit;
}
