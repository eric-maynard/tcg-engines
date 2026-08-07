/**
 * Shared attach/detach mechanics for Equipment (rules 434 / 435).
 *
 * Effect handlers must mutate the same state the `equipCard` / `unequipCard`
 * moves do — `meta.attachedTo` on the Equipment plus `meta.equippedWith` on the
 * holder — otherwise Might bonuses and "while equipped" statics never see it.
 */
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext } from "../effect-executor";
import { getGlobalCardRegistry } from "../../operations/card-lookup";

function meta(ctx: EffectContext, cardId: string): Record<string, unknown> | undefined {
  return ctx.cards.getCardMeta?.(cardId as CoreCardId);
}

/** The unit an Equipment is currently attached to, if any. */
export function attachedUnitOf(ctx: EffectContext, equipmentId: string): string | undefined {
  const attachedTo = meta(ctx, equipmentId)?.attachedTo;
  return typeof attachedTo === "string" ? attachedTo : undefined;
}

/** rule 434: attach an Equipment to a unit, recording both sides of the link. */
export function attachEquipment(ctx: EffectContext, equipmentId: string, unitId: string): void {
  const update = ctx.cards.updateCardMeta;
  if (!update) {
    return;
  }
  const previous = attachedUnitOf(ctx, equipmentId);
  if (previous) {
    detachEquipment(ctx, equipmentId);
  }

  const equipDef = getGlobalCardRegistry().get(equipmentId);
  const equipMeta: Record<string, unknown> = { attachedTo: unitId };
  if (equipDef?.copyAttachedUnitText) {
    equipMeta.copiedFromCardId = unitId;
  }
  update(equipmentId as CoreCardId, equipMeta);

  const held = meta(ctx, unitId)?.equippedWith;
  const current = Array.isArray(held) ? (held as string[]) : [];
  if (!current.includes(equipmentId)) {
    update(unitId as CoreCardId, { equippedWith: [...current, equipmentId] });
  }

  // rule 434.4: an attached card is wherever its holder is, so an Equipment
  // already on the board travels to the unit's zone. Off-board Equipment (still
  // being played) is placed by the play path, not here.
  const holderZone = ctx.zones.getCardZone(unitId as CoreCardId);
  const equipZone = ctx.zones.getCardZone(equipmentId as CoreCardId);
  if (
    holderZone !== undefined &&
    equipZone !== undefined &&
    equipZone !== holderZone &&
    (equipZone === "base" || equipZone.startsWith("battlefield-"))
  ) {
    ctx.zones.moveCard({ cardId: equipmentId as CoreCardId, targetZoneId: holderZone as CoreZoneId });
  }

  // rule 383.2.c / 401.1: "when you attach an Equipment to me" triggers.
  ctx.fireTriggers?.({
    cardId: unitId,
    equipmentId,
    playerId: ctx.playerId,
    type: "attach-equipment",
  } as Parameters<NonNullable<EffectContext["fireTriggers"]>>[0]);
}

/**
 * rule 435: detach an Equipment. 435.4 — the detached Equipment stays where it
 * is; it only returns to base when it was attached to a unit at a battlefield
 * and its controller has no presence there, which the zone move below models by
 * leaving battlefield-resident Equipment in place.
 */
export function detachEquipment(ctx: EffectContext, equipmentId: string): void {
  const update = ctx.cards.updateCardMeta;
  if (!update) {
    return;
  }
  const unitId = attachedUnitOf(ctx, equipmentId);
  update(equipmentId as CoreCardId, { attachedTo: undefined, copiedFromCardId: undefined });

  if (unitId) {
    // rule 477.1.b: "for as long as this is attached" — detaching ends the copy.
    getGlobalCardRegistry().revertCopy(unitId);
    const held = meta(ctx, unitId)?.equippedWith;
    const current = Array.isArray(held) ? (held as string[]) : [];
    update(unitId as CoreCardId, {
      equippedWith: current.filter((id) => id !== equipmentId),
    });
  }

  // rule 435.4: the Equipment stays at the unit's location; only base-resident
  // pairs need an explicit move (the equipment already tracks the holder's zone).
  const unitZone = unitId ? ctx.zones.getCardZone(unitId as CoreCardId) : undefined;
  const equipZone = ctx.zones.getCardZone(equipmentId as CoreCardId);
  if (unitZone && equipZone !== unitZone) {
    ctx.zones.moveCard({ cardId: equipmentId as CoreCardId, targetZoneId: unitZone as CoreZoneId });
  }
}

/** Split a bound target pair into [equipment, unit] using the card registry. */
export function splitEquipmentPair(ids: readonly string[]): {
  equipmentId?: string;
  unitId?: string;
} {
  const registry = getGlobalCardRegistry();
  const equipmentId = ids.find((id) => registry.getCardType(id) === "equipment");
  const unitId = ids.find((id) => id !== equipmentId && registry.getCardType(id) === "unit");
  return { equipmentId, unitId };
}
