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
      // rule 367 / 340.1 — several "next time" shields armed in advance are each
      // live during a resolution, so they STACK (one spent per damage instance);
      // two Counter Strikes cover both of Falling Star's 3s.
      const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
        | { preventNextDamageInstance?: boolean | number; preventNextDamageSource?: string }
        | undefined;
      const armed =
        meta?.preventNextDamageInstance === true
          ? 1
          : typeof meta?.preventNextDamageInstance === "number"
            ? meta.preventNextDamageInstance
            : 0;
      ctx.cards.updateCardMeta?.(
        targetId as CoreCardId,
        {
          // stay a plain `true` for the single-shield case (the common one).
          preventNextDamageInstance: armed === 0 ? true : armed + 1,
          preventNextDamageSource: meta?.preventNextDamageSource ?? ctx.sourceCardId,
        } as unknown as Record<string, unknown>,
      );
    }
    return;
  }
  // rule 437.1.b.1.b — a Prevent Value of "All" on the chosen unit(s); rule
  // 437.1.b.1.a — otherwise the numeric Prevent Value. The source is kept so
  // the rule 372 ordering prompt can name the shield (`operations/deal-damage.ts`).
  const preventAmount: number | "all" =
    (effect.amount as unknown) === "all" ? "all" : resolveAmount(effect.amount ?? 0, ctx);
  for (const targetId of preventTargets) {
    // rule 437.5.a — all Prevent Values on a unit are considered together, so a
    // second numeric shield ADDS to the pool rather than replacing it (two Ki
    // Barriers prevent 14). A Prevent All swallows any numeric pool.
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | { damagePreventionShield?: number | "all"; damagePreventionSource?: string }
      | undefined;
    const existing = meta?.damagePreventionShield;
    const merged: number | "all" =
      preventAmount === "all" || existing === "all"
        ? "all"
        : typeof existing === "number" && existing > 0
          ? existing + preventAmount
          : preventAmount;
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        damagePreventionShield: merged,
        damagePreventionSource:
          typeof existing === "number" && existing > 0 && meta?.damagePreventionSource
            ? meta.damagePreventionSource
            : ctx.sourceCardId,
      } as unknown as Record<string, unknown>,
    );
  }
}
