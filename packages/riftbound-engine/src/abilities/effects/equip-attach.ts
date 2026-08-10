// Effect handler: "equip-attach" — the resolution half of the [Equip] activated ability.
//
// rule 377.3 / 818.1.c.1: [Equip] is an ACTIVATED ability, so activating it only
// pays the cost and puts an item on the chain; the attach itself happens when
// that item resolves, after every player has had priority. The `equipCard` move
// pays the cost and pushes `{type:"equip-attach", unitId}`; this handler performs
// the attach.
import type { CardId as CoreCardId } from "@tcg/core";
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

  // rule 477.1.b (ven-137-166 Shady Spectacles) — the copy clause hangs off the
  // attach itself; `attachEquipment` runs it for every attach route.
}
