/**
 * rule 142.4.c — a board static may lower the lethal-damage value of the units
 * it describes for damage dealt by its controller (Elder Dragon: "Any amount of
 * your damage is enough to kill enemy units").
 *
 * The set of players whose damage is lethal at any amount is rebuilt from the
 * board every time it is needed: rule 364 stops the passive the moment the
 * source leaves the board. Both the state-based lethal check and combat damage
 * ASSIGNMENT (465.2.c.3 — each unit must be given exactly lethal before the
 * next one) read it, so they can never disagree.
 */

import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "./card-lookup";

export interface LethalDamageScanContext {
  readonly draft: { readonly battlefields: Record<string, unknown> };
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
  };
}

/** Players for whom ANY nonzero amount of damage is lethal to enemy units. */
export function collectAnyDamageLethalPlayers(ctx: LethalDamageScanContext): Set<string> {
  const registry = getGlobalCardRegistry();
  const players = new Set<string>();
  const zoneIds = ["base", ...Object.keys(ctx.draft.battlefields ?? {}).map((bf) => `battlefield-${bf}`)];
  for (const zoneId of zoneIds) {
    for (const cardId of ctx.zones.getCardsInZone(zoneId as CoreZoneId)) {
      for (const ability of registry.getAbilities(cardId as string) ?? []) {
        const a = ability as { type?: string; effect?: { type?: string; value?: number } };
        if (a.type !== "static" || a.effect?.type !== "lethal-damage-modifier") {
          continue;
        }
        if ((a.effect.value ?? 1) > 1) {
          continue;
        }
        const holder = ctx.cards.getCardController?.(cardId) ?? ctx.cards.getCardOwner(cardId);
        if (holder) {
          players.add(holder);
        }
      }
    }
  }
  return players;
}
