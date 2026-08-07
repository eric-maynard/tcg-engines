// Effect handler: "equip-attach" — the resolution half of the [Equip] activated ability.
//
// rule 377.3 / 818.1.c.1: [Equip] is an ACTIVATED ability, so activating it only
// pays the cost and puts an item on the chain; the attach itself happens when
// that item resolves, after every player has had priority. The `equipCard` move
// pays the cost and pushes `{type:"equip-attach", unitId}`; this handler performs
// the attach.
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { getBattlefieldZoneId } from "../../zones/zone-configs";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { attachEquipment } from "./_attachment";
import type { EffectHelpers } from "./_helpers";

export function handle_equipAttach(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const equipmentId =
    (effect as unknown as { equipmentId?: string }).equipmentId ?? ctx.sourceCardId;
  const unitId = (effect as unknown as { unitId?: string }).unitId ?? ctx.boundTargets?.[0];
  if (!unitId) {
    return;
  }
  // rule 355.8: the attach simply does nothing if either card left the board
  // while the ability sat on the chain.
  const onBoard = (id: string) => {
    const zone = ctx.zones.getCardZone(id as CoreCardId);
    return zone === "base" || zone?.startsWith("battlefield-") === true;
  };
  if (!onBoard(equipmentId) || !onBoard(unitId)) {
    return;
  }

  // rule 709/710: an attachment's Might bonus can push the holder over the
  // Mighty threshold, so sample the holder's Might before the attach.
  const mightBefore = h.getEffectiveMight(unitId, ctx);
  attachEquipment(ctx, equipmentId, unitId);
  h.checkBecomesMighty(unitId, mightBefore, ctx);

  // rule 477.1.b (ven-137-166 Shady Spectacles): "As this is attached to a unit,
  // choose another friendly unit. The equipped unit becomes a copy of that unit
  // for as long as this is attached to it."
  const registry = getGlobalCardRegistry();
  if (registry.get(equipmentId)?.copyChosenUnitToHolder) {
    const zoneIds = ["base", ...Object.keys(ctx.draft.battlefields ?? {}).map(getBattlefieldZoneId)];
    const candidates: string[] = [];
    for (const zoneId of zoneIds) {
      for (const id of ctx.zones.getCardsInZone(
        zoneId as CoreZoneId,
        ctx.playerId as CorePlayerId,
      )) {
        if ((id as string) !== unitId && registry.get(id as string)?.cardType === "unit") {
          candidates.push(id as string);
        }
      }
    }
    // rule 355.5: the controller chooses; a sole legal candidate is auto-bound.
    if (candidates.length === 1 && candidates[0] !== undefined) {
      registry.becomeCopyOf(unitId, candidates[0]);
    } else if (candidates.length > 1 && !ctx.draft.pendingChoice) {
      ctx.draft.pendingChoice = {
        effect: { holderId: unitId, type: "become-copy" },
        options: candidates,
        playerId: ctx.playerId,
        remaining: 1,
        sourceCardId: equipmentId,
        type: "choose-target",
      } as typeof ctx.draft.pendingChoice;
    }
  }
}
