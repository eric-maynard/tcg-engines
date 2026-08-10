// Effect handler: "attach-or-detach"
//
// rule 434 / 435 — "Choose a unit and an Equipment with the same controller.
// Attach that Equipment to that unit or detach that Equipment from that unit."
// The chosen pair determines which half applies: an Equipment already attached
// to the chosen unit detaches, anything else attaches.
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { attachEquipment, attachedUnitOf, detachEquipment, splitEquipmentPair } from "./_attachment";
import type { EffectHelpers } from "./_helpers";
import { getTargetIds } from "./_helpers";

export function handle_attach_or_detach(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const bound = ctx.boundTargets ?? [];
  const ids =
    bound.length >= 2
      ? [...bound]
      : [
          ...getTargetIds({ ...effect, target: effect.equipment } as ExecutableEffect, ctx),
          ...getTargetIds({ ...effect, target: effect.to } as ExecutableEffect, ctx),
        ];
  const { equipmentId, unitId } = splitEquipmentPair(ids);
  if (!equipmentId || !unitId) {
    return;
  }
  // rule 434.1.g — the caster may name the half as the spell is played: ATTACH on
  // the Equipment's current wearer is a legal choice that changes nothing (the rest
  // of the spell still happens); DETACH applies only to that same wearer.
  const named = (effect as { mode?: "attach" | "detach" }).mode;
  if (named === "attach") {
    attachEquipment(ctx, equipmentId, unitId);
    return;
  }
  if (named === "detach") {
    if (attachedUnitOf(ctx, equipmentId) === unitId) {
      detachEquipment(ctx, equipmentId);
    }
    return;
  }
  if (attachedUnitOf(ctx, equipmentId) === unitId) {
    detachEquipment(ctx, equipmentId);
  } else {
    attachEquipment(ctx, equipmentId, unitId);
  }
}
