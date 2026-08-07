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
  // rule 434 / 355.13 (sfd-184-221) — "You may attach an Equipment with the
  // same controller to IT": the holder is whatever an earlier step bound (the
  // unit that just moved), and the Equipment is picked from `effect.equipment`.
  // `optional` makes the pick declinable; with no legal Equipment nothing is
  // asked at all (425.1.c).
  const holderMode = (effect as unknown as { holder?: string }).holder;
  if (holderMode === "bound") {
    // Re-entry from the prompt: `boundTargets` is now the chosen Equipment, so
    // the holder travels on the effect itself.
    const stashed = (effect as unknown as { holderId?: string }).holderId;
    if (stashed !== undefined) {
      const picked = ctx.boundTargets?.[0];
      if (picked !== undefined) {
        attachEquipment(ctx, picked, stashed);
      }
      return;
    }
    const holderId = ctx.boundTargets?.[0];
    if (holderId === undefined) {
      return;
    }
    const { boundTargets: _holder, ...unbound } = ctx;
    const candidates = getTargetIds(
      {
        ...effect,
        target: { ...(effect.equipment as object), quantity: "all" },
      } as unknown as ExecutableEffect,
      unbound as EffectContext,
    ).filter((id) => id !== holderId);
    if (candidates.length === 0 || ctx.draft.pendingChoice) {
      return;
    }
    const optional = (effect as unknown as { optional?: boolean }).optional === true;
    ctx.draft.pendingChoice = {
      ...(optional ? { anyNumber: true, maxPicks: 1, picked: [] } : {}),
      effect: { ...effect, holderId },
      options: candidates,
      playerId: ctx.playerId,
      remaining: 1,
      sourceCardId: ctx.sourceCardId,
      type: "choose-target",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
  // rule 819.1.d (sfd-054-221) — the mirror case: the SOURCE is the Equipment
  // and the pick names the unit it attaches to ("attach it to a unit you
  // control"). One candidate attaches directly, several are offered as a
  // choose-target pick.
  const holders = (effect as unknown as { holderCandidates?: readonly string[] })
    .holderCandidates;
  if (holders) {
    const picked = ctx.boundTargets?.[0];
    if (picked !== undefined) {
      if (holders.includes(picked)) {
        attachEquipment(ctx, ctx.sourceCardId, picked);
      }
      return;
    }
    if (holders.length === 0) {
      return;
    }
    if (holders.length === 1) {
      attachEquipment(ctx, ctx.sourceCardId, holders[0] as string);
      return;
    }
    ctx.draft.pendingChoice = {
      effect,
      options: [...holders],
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
