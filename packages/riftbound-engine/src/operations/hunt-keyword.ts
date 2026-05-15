/**
 * Riftbound Hunt Keyword
 *
 * Implements the **Hunt** keyword introduced by the Unleashed (UNL) set
 * (Core Rules 2026-03-30, §823).
 *
 * Rule §823 — Hunt:
 *   "Hunt" is a passive-ability keyword on units. A unit with Hunt has the
 *   triggered ability: "When I conquer or hold, gain 1 XP." A *Hunt Value*
 *   `[Hunt N]` gains N XP instead of 1. Multiple instances of Hunt are
 *   additive (rule §802 — independent keyword instances).
 *
 * "When I conquer or hold" — a unit *conquers* a battlefield when its
 * controller takes control of that battlefield by conquering it (rule §630
 * conquer), and *holds* a battlefield it (its controller) already controls
 * during the Scoring Phase hold check. The XP is gained by the unit's
 * **controller** (responsibility / control follows the controller, not the
 * deck owner — rule §411 / §823).
 *
 * Because the imported UNL card files carry the Hunt keyword as plain
 * `rulesText` rather than a structured triggered ability, this module
 * provides a deterministic, engine-side handler invoked from the conquer
 * (`combat.ts`) and hold (`riftbound-flow.ts`) code paths: it scans the
 * units at the just-conquered/held battlefield, sums each one's Hunt value,
 * and grants the controller that much XP. This keeps Hunt working even when
 * the card's text hasn't been parsed into an explicit ability.
 */

import type { CardDefinitionRegistry } from "./card-lookup";
import { getGlobalCardRegistry } from "./card-lookup";

/** Card-meta view sufficient for reading granted keywords. */
interface MetaView {
  grantedKeywords?: readonly { keyword: string; value?: number }[];
}

/**
 * Compute the Hunt value of a single unit — the amount of XP it grants its
 * controller "when I conquer or hold". Returns 0 if the unit does not have
 * Hunt at all.
 *
 * Combines:
 *   - the card definition's Hunt value (`registry.getKeywordValue`), and
 *   - any runtime-granted Hunt instances on the unit's meta.
 *
 * @param cardId   - Unit instance id
 * @param meta     - The unit's card meta (for `grantedKeywords`); optional
 * @param registry - Card-definition registry; defaults to the global one
 * @returns Total Hunt value (sum of all instances), or 0 if no Hunt
 */
export function getHuntValue(
  cardId: string,
  meta?: MetaView,
  registry: CardDefinitionRegistry = getGlobalCardRegistry(),
): number {
  let total = 0;
  const defValue = registry.getKeywordValue(cardId, "Hunt");
  if (defValue !== undefined) {
    total += defValue;
  }
  for (const gk of meta?.grantedKeywords ?? []) {
    if (gk.keyword === "Hunt") {
      total += gk.value ?? 1;
    }
  }
  return total;
}

/**
 * Compute the total XP that `playerId` gains from the Hunt keyword as a
 * result of conquering or holding a battlefield, given the unit ids present
 * at that battlefield and a way to look up each unit's meta.
 *
 * Only units **controlled by** `playerId` count — that player's units are
 * the ones "conquering or holding". Units belonging to other players (which
 * can momentarily share a contested battlefield) are ignored.
 *
 * @param unitIds        - Card ids at the battlefield (will be filtered)
 * @param playerId       - The conquering / holding player
 * @param getController  - `(cardId) => controllerId | undefined`
 * @param getCardMeta    - `(cardId) => meta | undefined`
 * @param registry       - Card-definition registry; defaults to global
 * @returns Total XP to grant `playerId` (0 if no Hunt units of theirs)
 */
export function computeHuntXpGain(
  unitIds: readonly string[],
  playerId: string,
  getController: (cardId: string) => string | undefined,
  getCardMeta: (cardId: string) => MetaView | undefined,
  registry: CardDefinitionRegistry = getGlobalCardRegistry(),
): number {
  let xp = 0;
  for (const cardId of unitIds) {
    if (getController(cardId) !== playerId) {
      continue;
    }
    xp += getHuntValue(cardId, getCardMeta(cardId), registry);
  }
  return xp;
}
