// Effect handler: "fight"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getEffectiveMight } from "./_helpers";

export function handle_fight(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  // Two units deal damage equal to their Might to each other
  const attackerTarget = (effect as unknown as { attacker?: TargetDescriptor }).attacker;
  const defenderTarget = (effect as unknown as { defender?: TargetDescriptor }).defender;
  if (attackerTarget && defenderTarget) {
    // rule-id: ven-083-166 (Rampage) / rule 355.8 — the caster-chosen
    // attacker/defender pair is locked at play time and travels in
    // boundTargets as [attacker, defender]; only fall back to descriptor
    // resolution when nothing was bound.
    // rule-id: ogn-149-298 (rule 355.10) — with a FIXED attacker ("self") the
    // only chosen card is the defender, so boundTargets carries just it.
    const attackerFixed = typeof attackerTarget === "string";
    let attackerId: string | undefined = attackerFixed ? undefined : ctx.boundTargets?.[0];
    let defenderId: string | undefined = attackerFixed
      ? ctx.boundTargets?.[0]
      : ctx.boundTargets?.[1];
    if (!attackerId || !defenderId) {
      const resolverCtx = {
        cards: ctx.cards,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        zones: ctx.zones,
      };
      attackerId ??= resolveTarget(attackerTarget, resolverCtx)[0];
      defenderId ??= resolveTarget(defenderTarget, resolverCtx).filter(
        (id) => id !== attackerId,
      )[0];
    }
    if (attackerId && defenderId) {
      // rule-id: ven-083-166 (Rampage) — "If you paid the additional cost,
      // give the friendly unit +2 Might this turn" resolves against the
      // chosen attacker only, BEFORE damage is exchanged; run the optional
      // `onAttacker` sub-effect with boundTargets narrowed to the attacker.
      const onAttacker = (effect as unknown as { onAttacker?: ExecutableEffect }).onAttacker;
      if (onAttacker) {
        executeEffect(onAttacker, { ...ctx, boundTargets: [attackerId] });
      }
      // "Damage equal to their Mights" is current (effective) Might, so
      // turn buffs like Rampage's +2 count.
      const aMight = getEffectiveMight(attackerId, ctx);
      const dMight = getEffectiveMight(defenderId, ctx);
      // rule-id: ven-083-166 (Rampage) / rule 520 — mirror fight damage to
      // meta.damage (as `case "damage"` does) so state-based death checks,
      // end-of-turn clear, and UI see it. Read priors BEFORE addCounter so
      // counter stores that alias meta.damage don't double-apply.
      const readDamage = (id: string): number =>
        (ctx.cards.getCardMeta?.(id as CoreCardId) as Partial<RiftboundCardMeta> | undefined)
          ?.damage ?? 0;
      const attackerPrior = readDamage(attackerId);
      const defenderPrior = readDamage(defenderId);
      if (aMight > 0) {
        ctx.counters.addCounter(defenderId as CoreCardId, "damage", aMight);
        ctx.cards.updateCardMeta?.(
          defenderId as CoreCardId,
          { damage: defenderPrior + aMight } as unknown as Record<string, unknown>,
        );
      }
      if (dMight > 0) {
        ctx.counters.addCounter(attackerId as CoreCardId, "damage", dMight);
        ctx.cards.updateCardMeta?.(
          attackerId as CoreCardId,
          { damage: attackerPrior + dMight } as unknown as Record<string, unknown>,
        );
      }
    }
  }
}
