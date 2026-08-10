// rule 425 / 727.1.c.2 — is a chain item counterable RIGHT NOW?
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../operations/card-lookup";

interface UncounterableZonesIo {
  getCardsInZone: (zone: CoreZoneId, player?: CorePlayerId) => readonly CoreCardId[];
}

interface UncounterableCardsIo {
  getCardOwner: (card: CoreCardId) => CorePlayerId | undefined;
  getCardController?: (card: CoreCardId) => CorePlayerId | undefined;
  getCardMeta: (card: CoreCardId) => unknown;
}

interface UncounterableDraft {
  players: Record<string, unknown>;
  battlefields: Record<string, unknown>;
}

/**
 * rule 425 (rule-id: ven-069-166) — "Your spells and abilities can't be
 * countered": a board static owned by a card its controller has on the board.
 * `while-empowered` gates it on the host's Empowered state (827), so the shield
 * is on only while that host is Empowered right now.
 */
export function controllerSpellsUncounterable(
  playerId: string,
  draft: UncounterableDraft,
  zones: UncounterableZonesIo,
  cards: UncounterableCardsIo,
): boolean {
  const registry = getGlobalCardRegistry();
  const candidates: CoreCardId[] = [
    ...Object.keys(draft.players).flatMap((p) => [
      ...zones.getCardsInZone("base" as CoreZoneId, p as CorePlayerId),
      ...zones.getCardsInZone("legendZone" as CoreZoneId, p as CorePlayerId),
    ]),
    ...Object.keys(draft.battlefields).flatMap((bf) =>
      zones.getCardsInZone(`battlefield-${bf}` as CoreZoneId),
    ),
  ];
  for (const cardId of candidates) {
    const controller = cards.getCardController?.(cardId) ?? cards.getCardOwner(cardId);
    if (controller !== playerId) {
      continue;
    }
    for (const ability of registry.getAbilities(cardId as string) ?? []) {
      const a = ability as { type?: string; condition?: { type?: string }; effect?: { type?: string } };
      if (a.type !== "static" || a.effect?.type !== "uncounterable-spells") {
        continue;
      }
      if (a.condition?.type === "while-empowered") {
        const meta = cards.getCardMeta(cardId) as { empowered?: boolean } | undefined;
        if (meta?.empowered !== true) {
          continue;
        }
      }
      return true;
    }
  }
  return false;
}

/**
 * rule-id: ven-015-166 — "This can't be countered." printed on the spell
 * itself. Inherent to the card, so it never changes while the item sits on the
 * chain.
 */
function printedUncounterable(cardId: string | undefined): boolean {
  if (cardId === undefined) {
    return false;
  }
  for (const ability of getGlobalCardRegistry().getAbilities(cardId) ?? []) {
    if ((ability as { uncounterable?: boolean }).uncounterable === true) {
      return true;
    }
  }
  return false;
}

/**
 * rule 727.1.c.2 / 828.1.b.1 (rule-id: ven-069-166) — a status-dependent
 * "can't be countered" applies exactly WHILE the status is true, so the shield
 * must be SAMPLED when the counter instruction executes. The chain item's
 * `uncounterable` flag is stamped when the spell is played and is therefore
 * stale by then (Mel can be Disempowered in between): it is deliberately not
 * consulted here — only the printed text and the live board are.
 */
export function itemIsUncounterable(
  item: { uncounterable?: boolean; controller?: string; cardId?: string } | undefined,
  ctx: {
    draft: UncounterableDraft;
    zones: UncounterableZonesIo;
    cards: UncounterableCardsIo;
  },
): boolean {
  if (item === undefined) {
    return false;
  }
  if (printedUncounterable(item.cardId)) {
    return true;
  }
  if (item.controller === undefined) {
    return false;
  }
  return controllerSpellsUncounterable(item.controller, ctx.draft, ctx.zones, ctx.cards);
}
