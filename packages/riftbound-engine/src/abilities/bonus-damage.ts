/**
 * Bonus Damage (rules 712-715).
 *
 * rule 715.1: when a spell or ability a player controls deals damage, every
 * instance of that damage is increased by the total Bonus Damage that player
 * has. Combat damage is not a spell or ability, so it is never increased.
 *
 * Two shapes feed the total:
 *  - a static, controller-scoped grant that lives while its card is on the
 *    board (`{type:"grant-keyword", keyword:"BonusDamage", target:"controller"}`
 *    — Annie, Fiery ogs-001-024);
 *  - a delayed `deals-bonus-damage` replacement installed in
 *    `draft.activeReplacements` by an ability (Ravenborn Tome ogn-032-298:
 *    "the next spell you play this turn deals 1 Bonus Damage"). A
 *    `duration:"next"` entry latches onto the first spell that uses it so
 *    every damage instance of THAT spell is increased, and no later one.
 */
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { EffectContext } from "./effect-executor";

interface BonusReplacementEntry {
  replaces?: string;
  bonusDamage?: number;
  duration?: string;
  owner?: string;
  appliedToSourceId?: string;
  target?: { type?: string; controller?: string };
}

function staticBonusFor(ctx: EffectContext): number {
  const registry = getGlobalCardRegistry();
  const boardCards: string[] = [];
  for (const playerId of Object.keys(ctx.draft.players)) {
    if (playerId !== ctx.playerId) continue;
    for (const cardId of ctx.zones.getCardsInZone("base" as CoreZoneId, playerId as CorePlayerId)) {
      boardCards.push(cardId as string);
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields)) {
    for (const cardId of ctx.zones.getCardsInZone(`battlefield-${bfId}` as CoreZoneId)) {
      if (ctx.cards.getCardOwner(cardId) === ctx.playerId) boardCards.push(cardId as string);
    }
  }
  let bonus = 0;
  for (const cardId of boardCards) {
    // rule 136.2.b/c — an Equipment's Effect Text abilities are inactive while
    // it is unattached (Rabadon's Deathcrown sfd-191-221).
    const attached =
      (ctx.cards.getCardMeta?.(cardId as CoreCardId) as { attachedTo?: string } | undefined)
        ?.attachedTo !== undefined;
    for (const ability of registry.getAbilities(cardId) ?? []) {
      if (ability?.type !== "static") continue;
      if ((ability as { effectText?: boolean }).effectText === true && !attached) continue;
      const effect = (ability as { effect?: Record<string, unknown> }).effect;
      if (
        effect?.type === "grant-keyword" &&
        effect.keyword === "BonusDamage" &&
        effect.target === "controller"
      ) {
        bonus += typeof effect.value === "number" ? effect.value : 1;
      }
    }
  }
  return bonus;
}

/**
 * rule 715.4.a / 364 (ogn-296-298 Void Gate) — a battlefield passive
 * "Spells and abilities deal 1 Bonus Damage to units here" is scoped to the
 * DAMAGED unit's location, not to the damage's controller: it applies to every
 * unit at that battlefield, whoever controls the battlefield or the spell.
 * rule 714: several sources sum, so it adds to `getBonusDamage`.
 */
export function getLocationBonusDamage(targetId: string, ctx: EffectContext): number {
  const zone = ctx.zones.getCardZone?.(targetId as CoreCardId) as string | undefined;
  if (zone === undefined || !zone.startsWith("battlefield-")) {
    return 0;
  }
  const battlefieldId = zone.slice("battlefield-".length);
  let bonus = 0;
  for (const ability of getGlobalCardRegistry().getAbilities(battlefieldId) ?? []) {
    if (ability?.type !== "static") continue;
    const effect = (ability as { effect?: Record<string, unknown> }).effect;
    if (effect?.type !== "bonus-damage") continue;
    const location = (effect.target as { location?: string } | undefined)?.location;
    if (location !== undefined && location !== "here") continue;
    bonus += typeof effect.amount === "number" ? effect.amount : 1;
  }
  return bonus;
}

/**
 * Total Bonus Damage to add to each damage instance this spell/ability deals.
 * Latches any `duration:"next"` delayed bonus onto the current source card.
 */
export function getBonusDamage(ctx: EffectContext): number {
  let bonus = staticBonusFor(ctx);
  const sourceIsSpell = getGlobalCardRegistry().getCardType(ctx.sourceCardId) === "spell";
  const entries = ctx.draft.activeReplacements as BonusReplacementEntry[] | undefined;
  for (const entry of entries ?? []) {
    if (entry?.replaces !== "deals-bonus-damage") continue;
    if (entry.owner !== undefined && entry.owner !== ctx.playerId) continue;
    // "the next SPELL you play" — an ability's damage doesn't consume it.
    if (entry.target?.type === "spell" && !sourceIsSpell) continue;
    if (entry.duration === "next") {
      if (entry.appliedToSourceId === undefined) {
        entry.appliedToSourceId = ctx.sourceCardId;
      } else if (entry.appliedToSourceId !== ctx.sourceCardId) {
        continue; // already spent on an earlier spell
      }
    }
    bonus += typeof entry.bonusDamage === "number" ? entry.bonusDamage : 1;
  }
  return bonus;
}
