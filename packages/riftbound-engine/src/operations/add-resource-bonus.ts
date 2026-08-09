/**
 * Static "[Add] an additional …" bonuses (rule 190.6.a — the ability's
 * controller Adds; rule 429.1 — how much is Added is computed as the ability
 * resolves, so a continuous effect may raise it).
 *
 * A permanent can continuously augment what ANOTHER permanent of its
 * controller Adds — Chem-Baroness (sfd-201-221): "While your score is within 3
 * points of the Victory Score, your Gold [ADD] an additional [1]."
 *
 * Generic, no per-card branches: any board permanent whose registry abilities
 * carry `{type:"static", effect:{type:"add-resource-bonus", energy?, power?,
 * target}}` opts in. The `target` descriptor is matched against the DEFINITION
 * of the card doing the Adding, not against the board — Gold kills itself as
 * part of its own activation cost, so it is already gone when the Add resolves.
 */

import type {
  CardId as CoreCardId,
  PlayerId as CorePlayerId,
  ZoneId as CoreZoneId,
} from "@tcg/core";
import { getGlobalCardRegistry } from "./card-lookup";
import { scoreWithinConditionMet } from "./score-within";

const PLAYER_BOARD_ZONES: readonly string[] = ["base", "legendZone", "championZone"];

export interface AddResourceBonus {
  readonly energy: number;
  readonly power: Record<string, number>;
}

interface BonusScanState {
  readonly victoryScore?: number;
  readonly players: Record<string, unknown>;
  readonly battlefields?: Record<string, { controller?: string | null } | undefined>;
}

export interface AddResourceBonusContext {
  readonly draft: BonusScanState;
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => readonly CoreCardId[];
  };
  readonly cards: {
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
  };
}

function conditionMet(
  condition: Record<string, unknown> | undefined,
  ctx: AddResourceBonusContext,
  controllerId: string,
): boolean {
  if (!condition) {
    return true;
  }
  // rule 383.2.a.1 — the shared score-proximity predicate; every other
  // condition kind is unknown here and, per engine convention, applies.
  if (condition.type === "score-within") {
    return scoreWithinConditionMet(
      condition as { points?: number; range?: number; whose?: string },
      ctx.draft as never,
      controllerId,
    );
  }
  return true;
}

/** Does the aura's `target` describe the card that is Adding? */
function describesAddingCard(
  target: unknown,
  addingCardId: string,
  addingPlayerId: string,
  auraControllerId: string,
): boolean {
  if (!target || typeof target !== "object") {
    return false;
  }
  const t = target as {
    type?: string;
    types?: readonly string[];
    controller?: string;
    filter?: unknown;
  };
  const def = getGlobalCardRegistry().get(addingCardId);
  if (!def) {
    return false;
  }
  if (t.type && t.type !== "any" && t.type !== "permanent" && t.type !== def.cardType) {
    return false;
  }
  if (t.types && !t.types.includes(def.cardType as string)) {
    return false;
  }
  const controller = t.controller ?? "friendly";
  if (controller === "friendly" || controller === "self" || controller === "you") {
    if (addingPlayerId !== auraControllerId) {
      return false;
    }
  } else if (controller === "enemy" && addingPlayerId === auraControllerId) {
    return false;
  }
  const filter = t.filter;
  if (filter && typeof filter === "object") {
    const f = filter as { name?: string; tag?: string };
    if (f.name && (def.name ?? "").toLowerCase() !== f.name.toLowerCase()) {
      return false;
    }
    if (f.tag && !(def.tags ?? []).some((tag) => tag.toLowerCase() === f.tag?.toLowerCase())) {
      return false;
    }
  }
  return true;
}

/**
 * Total extra Energy / Power pips board statics add to the Add that
 * `addingCardId` is performing for `addingPlayerId`.
 */
export function computeAddResourceBonus(
  ctx: AddResourceBonusContext,
  addingPlayerId: string,
  addingCardId: string,
): AddResourceBonus {
  const registry = getGlobalCardRegistry();
  let energy = 0;
  const power: Record<string, number> = {};

  const zonesToScan: string[] = [...PLAYER_BOARD_ZONES, "battlefieldRow"];
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    zonesToScan.push(`battlefield-${bfId}`);
  }

  for (const zoneId of zonesToScan) {
    const isPerPlayer = PLAYER_BOARD_ZONES.includes(zoneId);
    const ids = isPerPlayer
      ? Object.keys(ctx.draft.players).flatMap((pid) => [
          ...ctx.zones.getCardsInZone(zoneId as CoreZoneId, pid as CorePlayerId),
        ])
      : [...ctx.zones.getCardsInZone(zoneId as CoreZoneId)];

    for (const permId of ids) {
      // rule 190.6.d — on a battlefield card "you" is its CONTROLLER.
      const asBattlefield = ctx.draft.battlefields?.[permId as string];
      const auraController = asBattlefield
        ? asBattlefield.controller ?? null
        : ctx.cards.getCardController?.(permId as CoreCardId) ??
          ctx.cards.getCardOwner(permId as CoreCardId);
      if (!auraController) {
        continue;
      }
      for (const ability of registry.getAbilities(permId as string) ?? []) {
        if ((ability as { type?: string }).type !== "static") {
          continue;
        }
        const effect = (ability as { effect?: Record<string, unknown> }).effect;
        if (!effect || effect.type !== "add-resource-bonus") {
          continue;
        }
        if (
          !describesAddingCard(effect.target, addingCardId, addingPlayerId, auraController)
        ) {
          continue;
        }
        if (
          !conditionMet(
            (ability as { condition?: Record<string, unknown> }).condition,
            ctx,
            auraController,
          )
        ) {
          continue;
        }
        energy += (effect.energy as number | undefined) ?? 0;
        for (const domain of (effect.power as readonly string[] | undefined) ?? []) {
          power[domain] = (power[domain] ?? 0) + 1;
        }
      }
    }
  }

  return { energy, power };
}
