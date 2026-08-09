// Effect handler: "swap-back-battlefield" (rule 438.7)
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { recalculateStaticEffects, type StaticAbilityContext } from "../static-abilities";
import type { EffectHelpers } from "./_helpers";

/**
 * rule 438.7 — Swap Back: "replace this with the battlefield it replaced".
 * The battlefield token stops existing (186.1) and the card it displaced comes
 * back from Banishment into the SAME slot, inheriting its control, contested
 * state and every unit standing there (438.7.b). With nothing in Banishment to
 * swap to, nothing happens (438.7.c).
 */
export function handle_swapBackBattlefield(
  _effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const draft = ctx.draft as unknown as {
    battlefields?: Record<string, { id?: string } & Record<string, unknown>>;
  };
  const zone = ctx.triggerBattlefieldZone ?? ctx.sourceZone;
  const slotKey =
    typeof zone === "string" && zone.startsWith("battlefield-")
      ? zone.slice("battlefield-".length)
      : ctx.sourceCardId;
  const slot = draft.battlefields?.[slotKey];
  if (!slot) {
    return;
  }
  const tokenCardId = slot.id ?? slotKey;
  const registry = getGlobalCardRegistry();
  const meta = ctx.cards.getCardMeta?.(tokenCardId as CoreCardId) ?? {};
  let replacedId = (meta as { replacedBattlefieldCardId?: string }).replacedBattlefieldCardId;
  if (replacedId === undefined) {
    // 438.7.c — the displaced card is the battlefield waiting in Banishment.
    const banished = ctx.zones.getCardsInZone("banishment" as CoreZoneId) ?? [];
    replacedId = banished.find((id) => registry.get(id as string)?.cardType === "battlefield") as
      | string
      | undefined;
  }
  if (replacedId === undefined || replacedId === tokenCardId) {
    return;
  }

  // 438.7.b — the card returns to the slot the token occupied: same key, so the
  // units there, the controller and the scored state need no rewriting.
  const replacedDef = registry.get(replacedId);
  if (!replacedDef) {
    return;
  }
  ctx.zones.moveCard({ cardId: replacedId as CoreCardId, targetZoneId: "battlefieldRow" as CoreZoneId });
  const units = [...(ctx.zones.getCardsInZone(`battlefield-${slotKey}` as CoreZoneId) ?? [])];
  const newKey = replacedId;
  if (newKey !== slotKey && draft.battlefields) {
    draft.battlefields[newKey] = { ...slot, id: replacedId };
    delete draft.battlefields[slotKey];
    // 438.7.b — the returning card takes over the slot under its own id, so the
    // slot's unit/facedown zones have to exist before its occupants move over.
    ctx.zones.createZone?.({
      config: { id: `battlefield-${newKey}`, name: `Battlefield ${newKey}` },
      zoneId: `battlefield-${newKey}` as CoreZoneId,
    });
    ctx.zones.createZone?.({
      config: { faceDown: true, id: `facedown-${newKey}`, name: `Facedown ${newKey}`, visibility: "private" },
      zoneId: `facedown-${newKey}` as CoreZoneId,
    });
    for (const unit of units) {
      ctx.zones.moveCard({
        cardId: unit,
        targetZoneId: `battlefield-${newKey}` as CoreZoneId,
      });
    }
  }
  // 186.1 — the battlefield token ceases to exist once it leaves the row.
  ctx.zones.removeCardFromGame?.({ cardId: tokenCardId as CoreCardId });

  recalculateStaticEffects({
    cards: ctx.cards,
    draft: ctx.draft,
    zones: ctx.zones,
  } as unknown as StaticAbilityContext);
}
