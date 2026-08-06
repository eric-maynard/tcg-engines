// Effect handler: "attach"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { attachEquipment, splitEquipmentPair } from "./_attachment";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_attach(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: sfd-050-221 (rule 716) — "attach one of ITS Equipment to me": the
  // candidate list is fixed by an earlier step (the swap partner's Equipment),
  // and the new holder is always the ability's source. One candidate attaches
  // directly; several are offered as a choose-target pick.
  const candidates = (effect as unknown as { equipmentCandidates?: readonly string[] })
    .equipmentCandidates;
  if (candidates) {
    const picked = ctx.boundTargets?.[0];
    if (picked !== undefined) {
      if (candidates.includes(picked)) {
        attachEquipment(ctx, picked, ctx.sourceCardId);
      }
      return;
    }
    if (candidates.length === 0) {
      return;
    }
    if (candidates.length === 1) {
      attachEquipment(ctx, candidates[0] as string, ctx.sourceCardId);
      return;
    }
    ctx.draft.pendingChoice = {
      effect,
      options: [...candidates],
      playerId: ctx.playerId,
      remaining: 1,
      sourceCardId: ctx.sourceCardId,
      type: "choose-target",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
  const equipTargets = getTargetIds(
    { ...effect, target: effect.equipment } as ExecutableEffect,
    ctx,
  );
  const unitTargets = getTargetIds({ ...effect, target: effect.to } as ExecutableEffect, ctx);
  // A single bound-target list feeds both descriptors; split it by card type.
  const pair =
    equipTargets[0] === unitTargets[0]
      ? splitEquipmentPair(equipTargets)
      : { equipmentId: equipTargets[0], unitId: unitTargets[0] };
  if (pair.equipmentId && pair.unitId) {
    // rule 434: attach records `attachedTo` + the holder's `equippedWith`.
    attachEquipment(ctx, pair.equipmentId, pair.unitId);
  }
}
