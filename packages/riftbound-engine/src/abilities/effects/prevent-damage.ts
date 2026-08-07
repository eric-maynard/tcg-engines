// Effect handler: "prevent-damage"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds, resolveAmount } from "./_helpers";

export function handle_preventDamage(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Set a damage prevention shield — store on card meta
  const targets = getTargetIds(effect, ctx);
  // rule-id: ogn-145-298 — an untargeted "Prevent all spell and ability
  // damage this turn" (rule 437.1.b.1.b) is a global Prevent, not a shield on
  // the source spell. Install it as a turn-scoped runtime take-damage
  // replacement so handle_damage consults it; end-of-turn cleanup expires it.
  if (targets.length === 0 && effect.target === undefined && effect.amount === "all") {
    const active = ctx.draft.activeReplacements ?? [];
    (ctx.draft as { activeReplacements?: unknown[] }).activeReplacements = [
      ...active,
      {
        type: "replacement",
        replaces: "take-damage",
        replacement: "prevent",
        amount: "all",
        global: true,
        duration: (effect as { duration?: string }).duration ?? "turn",
        owner: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
      },
    ];
    return;
  }
  const preventTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  // rule 437.5.b (sfd-194-221): "the next time it would be dealt damage, prevent it"
  // arms a single instance-wide shield (Prevent Value All) rather than a numeric one.
  if ((effect as { instance?: boolean }).instance === true) {
    for (const targetId of preventTargets) {
      ctx.cards.updateCardMeta?.(
        targetId as CoreCardId,
        { preventNextDamageInstance: true } as unknown as Record<string, unknown>,
      );
    }
    return;
  }
  const preventAmount = resolveAmount(effect.amount ?? 0, ctx);
  for (const targetId of preventTargets) {
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        damagePreventionShield: preventAmount,
      } as unknown as Record<string, unknown>,
    );
  }
}
