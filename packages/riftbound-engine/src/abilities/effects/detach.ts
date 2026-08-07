// Effect handler: "detach"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundGameState } from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { attachedUnitOf, detachEquipment } from "./_attachment";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_detach(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const equipmentDesc = (effect as { equipment?: { attachedTo?: unknown } }).equipment;
  // rule-id: sfd-107-221 (rule 435) — "Then detach an Equipment from IT": the
  // host is the unit an earlier part of the spell referenced (the Might
  // reference), not a target of this step. Exactly one Equipment comes off, so
  // a unit wearing several prompts its controller.
  if (equipmentDesc?.attachedTo === "reference" || equipmentDesc?.attachedTo === "pending-value") {
    const registry = getGlobalCardRegistry();
    // Re-entry from the prompt: the answer is the chosen Equipment.
    const picked = (ctx.boundTargets ?? []).find(
      (id) => registry.getCardType(id) === "equipment" && attachedUnitOf(ctx, id) !== undefined,
    );
    if (picked) {
      detachEquipment(ctx, picked);
      return;
    }
    const unitId = (ctx as { pendingSequenceValue?: readonly string[] }).pendingSequenceValue?.[0];
    if (!unitId) {
      return;
    }
    const held = ctx.cards.getCardMeta?.(unitId as CoreCardId)?.equippedWith;
    const attached = Array.isArray(held) ? (held as string[]) : [];
    // rule 435.1.a.1 — nothing attached (the unit stopped being equipped while
    // the spell was on the chain): the instruction does nothing.
    if (attached.length === 0) {
      return;
    }
    if (attached.length > 1 && !ctx.draft.pendingChoice) {
      ctx.draft.pendingChoice = {
        effect: { equipment: { type: "equipment" }, type: "detach" },
        options: attached,
        playerId: ctx.playerId,
        remaining: 1,
        sourceCardId: ctx.sourceCardId,
        type: "choose-target",
      } as RiftboundGameState["pendingChoice"];
      return;
    }
    detachEquipment(ctx, attached[0] as string);
    return;
  }

  const detachTargets = getTargetIds(
    { ...effect, target: effect.equipment } as ExecutableEffect,
    ctx,
  );
  if (detachTargets[0]) {
    // rule 435: clear both sides of the attachment link.
    detachEquipment(ctx, detachTargets[0]);
  }
}
