/**
 * Board-wide "can't play …" static restrictions (rule 419.1: playing a card
 * = putting it on the chain, so a restriction only stops FURTHER plays — an
 * item already on the chain has been played and still finalizes).
 *
 * Shape in card data:
 *   { type: "static", condition: { type: "while-at-battlefield" },
 *     effect: { type: "restrict-play", who: "opponents", cardType: "spell",
 *               matchesNamedCard: true } }
 */

import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState } from "../types";

export interface PlayRestrictionContext {
  readonly draft: RiftboundGameState;
  readonly zones: {
    getCardsInZone: (zoneId: CoreZoneId, playerId?: CorePlayerId) => CoreCardId[];
  };
  readonly cards: {
    getCardMeta?: (cardId: CoreCardId) => Partial<RiftboundCardMeta> | undefined;
    getCardOwner: (cardId: CoreCardId) => string | undefined;
    getCardController?: (cardId: CoreCardId) => string | undefined;
  };
}

interface RestrictSource {
  id: string;
  zone: string;
}

/** Cards that can carry a board static: base, battlefields, legend/champion zones. */
function restrictionSources(ctx: PlayRestrictionContext): RestrictSource[] {
  const out: RestrictSource[] = [];
  for (const playerId of Object.keys(ctx.draft.players)) {
    for (const zone of ["base", "legendZone", "championZone"]) {
      for (const id of ctx.zones.getCardsInZone(zone as CoreZoneId, playerId as CorePlayerId)) {
        out.push({ id: id as string, zone });
      }
    }
  }
  for (const bfId of Object.keys(ctx.draft.battlefields ?? {})) {
    const zone = `battlefield-${bfId}`;
    for (const id of ctx.zones.getCardsInZone(zone as CoreZoneId)) {
      out.push({ id: id as string, zone });
    }
  }
  return out;
}

function conditionHolds(condition: Record<string, unknown> | undefined, zone: string): boolean {
  if (!condition) {
    return true;
  }
  const type = String(condition.type ?? "");
  if (type === "while-at-battlefield" || type === "at-battlefield") {
    return zone.startsWith("battlefield");
  }
  // Unknown gating condition: fail closed on the restriction (do not forbid).
  return false;
}

/**
 * rule 419.1 (rule-id: ven-029-166 Ol' Poro) — "I can't be played on your
 * first, second, or third turns": a self-restriction printed on the card being
 * played, gated on how many turns its controller has taken. A player's first
 * turn is `turnsTaken === 1`, so "not on your first three turns" is
 * `minTurnsTaken: 4`.
 *
 * Shape in card data:
 *   { type: "static", effect: { type: "restrict-play", who: "self",
 *                               minTurnsTaken: 4 } }
 */
export function selfPlayIsForbidden(
  state: RiftboundGameState,
  playerId: string,
  cardId: string,
): boolean {
  const turnsTaken = state.players?.[playerId]?.turnsTaken ?? 0;
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (ability as { effect?: Record<string, unknown> }).effect;
    if (!effect || effect.type !== "restrict-play" || effect.who !== "self") {
      continue;
    }
    const minTurnsTaken = effect.minTurnsTaken;
    if (typeof minTurnsTaken === "number" && turnsTaken < minTurnsTaken) {
      return true;
    }
  }
  return false;
}

/**
 * True when a board static forbids `playerId` from playing `cardId` right now.
 * rule-id: ven-132-166 (Fallen Feline) — "While I'm at a battlefield, opponents
 * can't play spells with that name."
 */
export function playIsForbidden(
  ctx: PlayRestrictionContext,
  playerId: string,
  cardId: string,
): boolean {
  if (selfPlayIsForbidden(ctx.draft, playerId, cardId)) {
    return true;
  }
  const registry = getGlobalCardRegistry();
  const playedDef = registry.get(cardId);
  if (!playedDef) {
    return false;
  }
  for (const source of restrictionSources(ctx)) {
    for (const ability of registry.getAbilities(source.id) ?? []) {
      if (ability.type !== "static") {
        continue;
      }
      const effect = ability.effect as Record<string, unknown> | undefined;
      if (!effect || effect.type !== "restrict-play") {
        continue;
      }
      if (!conditionHolds(ability.condition as Record<string, unknown> | undefined, source.zone)) {
        continue;
      }
      const controller =
        ctx.cards.getCardController?.(source.id as CoreCardId) ??
        ctx.cards.getCardOwner(source.id as CoreCardId);
      const who = String(effect.who ?? "opponents");
      if (who === "opponents" && controller === playerId) {
        continue;
      }
      const restrictedType = effect.cardType as string | undefined;
      if (restrictedType && restrictedType !== "card" && playedDef.cardType !== restrictedType) {
        continue;
      }
      if (effect.matchesNamedCard === true) {
        const named = ctx.cards.getCardMeta?.(source.id as CoreCardId)?.namedCard;
        if (!named || named !== playedDef.name) {
          continue;
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * rule 355.2 (rule-id: sfd-216-221 Rockfall Path): a battlefield card whose own
 * text reads "Units can't be played here" is never a legal play destination for
 * a unit — not for a normal play, and not for an effect that would place a unit
 * there (rule 358.3.a: an impossible instruction is skipped). `battlefieldId`
 * is the battlefield card's instance id.
 */
export function battlefieldForbidsUnitPlays(battlefieldId: string): boolean {
  for (const ability of getGlobalCardRegistry().getAbilities(battlefieldId) ?? []) {
    if (ability?.type !== "static") {
      continue;
    }
    const effect = (ability as { effect?: { type?: string; keyword?: string } }).effect;
    if (effect?.type === "grant-keyword" && effect.keyword === "NoUnitsPlayedHere") {
      return true;
    }
  }
  return false;
}
