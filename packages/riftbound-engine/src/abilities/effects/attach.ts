// Effect handler: "attach"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { attachEquipment, splitEquipmentPair } from "./_attachment";
import { legalBoundIds } from "../target-slots";
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
    // rule 355.10.d.2 — a sole legal Equipment is still chosen, not auto-taken.
    ctx.draft.pendingChoice = {
      effect,
      options: [...candidates],
      playerId: ctx.playerId,
      remaining: 1,
      ...(candidates.length === 1 ? { soleOption: true as const } : {}),
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
    // rule 355.5 / 355.12 / 355.15 (ruling 4283ca02526c0650) — when the spell
    // NAMED this Equipment as it was played (`_bound`, stamped by
    // `play/make-choices.ts bindNestedDescriptorSlots`), the object is locked:
    // it is not re-chosen here, only re-CHECKED against the descriptor as it
    // reads now (358.1 / 359.3.e.2 — an Equipment that changed hands or left
    // the board is simply unaffected, and no replacement is offered, 355.15).
    // The "you may" DECISION still belongs to resolution (383.3.a.3), so the
    // locked pick is still offered as a declinable one-option prompt.
    const locked = legalBoundIds(
      { ...effect, target: effect.equipment } as ExecutableEffect,
      unbound as EffectContext,
    );
    const candidates = (
      locked ??
      getTargetIds(
        {
          ...effect,
          target: { ...(effect.equipment as object), quantity: "all" },
        } as unknown as ExecutableEffect,
        unbound as EffectContext,
      )
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
    // rule 355.10.d.2 — a sole legal holder is still chosen, not auto-taken.
    ctx.draft.pendingChoice = {
      effect,
      options: [...holders],
      playerId: ctx.playerId,
      remaining: 1,
      ...(holders.length === 1 ? { soleOption: true as const } : {}),
      sourceCardId: ctx.sourceCardId,
      type: "choose-target",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
  // rule 402.2 (sfd-193-221) — "Attach a detached Equipment you control to a
  // unit you control": with several candidate Equipment, or several candidate
  // holders, the CONTROLLER chooses; the first candidate may not be taken
  // silently. The Equipment is asked first, then the holder; each answer
  // re-enters this handler with the earlier pick stashed on the effect.
  // Only the fully-descriptive form ("<equipment descriptor> to <unit
  // descriptor>") is chooser-driven: "attach ME to a unit", "attach IT (the
  // card just played) to me" and other pronoun forms name their own objects.
  const equipDescriptor = effect.equipment as { type?: string } | string | undefined;
  const toDescriptor = effect.to as { type?: string } | string | undefined;
  const bothDescribed =
    typeof equipDescriptor === "object" &&
    (equipDescriptor?.type === "equipment" || equipDescriptor?.type === "gear") &&
    typeof toDescriptor === "object" &&
    toDescriptor?.type === "unit";
  const phase = (effect as unknown as { _attachPhase?: "equipment" | "unit" })._attachPhase;
  if (
    bothDescribed &&
    (phase !== undefined || ctx.boundTargets === undefined || ctx.boundTargets.length === 0)
  ) {
    const pickedNow = ctx.boundTargets?.[0];
    if (phase === "unit") {
      const stashedEquipment = (effect as unknown as { _attachEquipmentId?: string })
        ._attachEquipmentId;
      if (stashedEquipment !== undefined && pickedNow !== undefined) {
        attachEquipment(ctx, stashedEquipment, pickedNow);
      }
      return;
    }
    const { boundTargets: _unboundPick, ...rest } = ctx;
    const free = rest as EffectContext;
    let equipmentId = phase === "equipment" ? pickedNow : undefined;
    if (equipmentId === undefined) {
      const candidates = getTargetIds(
        {
          ...effect,
          target: { ...(effect.equipment as object), quantity: "all" },
        } as unknown as ExecutableEffect,
        free,
      );
      if (candidates.length === 0) {
        return;
      }
      if (candidates.length > 1 && !ctx.draft.pendingChoice) {
        ctx.draft.pendingChoice = {
          effect: { ...effect, _attachPhase: "equipment" },
          options: candidates,
          playerId: ctx.playerId,
          remaining: 1,
          sourceCardId: ctx.sourceCardId,
          type: "choose-target",
        } as typeof ctx.draft.pendingChoice;
        return;
      }
      equipmentId = candidates[0] as string;
    }
    const holders = getTargetIds(
      {
        ...effect,
        target: { ...(effect.to as object), quantity: "all" },
      } as unknown as ExecutableEffect,
      free,
    ).filter((id) => id !== equipmentId);
    if (holders.length === 0) {
      return;
    }
    // Another prompt is already open — that one is answered first, so this
    // holder is taken now (the choice is re-offered on re-entry).
    if (ctx.draft.pendingChoice) {
      attachEquipment(ctx, equipmentId, holders[0] as string);
      return;
    }
    // rule 355.10.d.2 — a sole legal holder is still chosen, not auto-taken.
    ctx.draft.pendingChoice = {
      effect: { ...effect, _attachEquipmentId: equipmentId, _attachPhase: "unit" },
      options: holders,
      playerId: ctx.playerId,
      remaining: 1,
      ...(holders.length === 1 ? { soleOption: true as const } : {}),
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
  // rule 359.3.e / 811.1.d.2 (sfd-139-221 Edge of Night) — "attach IT to a unit
  // you control (here)": the Equipment names itself, but its holder is a real
  // choice. With several legal units the controller is asked; the engine must
  // never keep the first one on the board. (The candidate pool is already
  // scoped — a from-Hidden play offers only units at that battlefield.)
  const selfEquipment =
    equipDescriptor === "self" ||
    (typeof equipDescriptor === "object" && equipDescriptor?.type === "self");
  const holderPool =
    selfEquipment &&
    typeof toDescriptor === "object" &&
    (ctx.boundTargets === undefined || ctx.boundTargets.length === 0)
      ? getTargetIds(
          { ...effect, target: { ...(toDescriptor as object), quantity: "all" } } as unknown as ExecutableEffect,
          ctx,
        ).filter((id) => id !== ctx.sourceCardId)
      : [];
  if (holderPool.length > 1 && !ctx.draft.pendingChoice) {
    ctx.draft.pendingChoice = {
      effect,
      options: [...holderPool],
      playerId: ctx.playerId,
      remaining: 1,
      sourceCardId: ctx.sourceCardId,
      type: "choose-target",
    } as typeof ctx.draft.pendingChoice;
    return;
  }
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
