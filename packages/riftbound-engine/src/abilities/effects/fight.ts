// Effect handler: "fight"
import type { CardId as CoreCardId } from "@tcg/core";
import { dealDamageBatch } from "../../operations/deal-damage";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getEffectiveMightInRole } from "./_helpers";

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
    const resolverCtx = {
      cards: ctx.cards,
      draft: ctx.draft,
      playerId: ctx.playerId,
      // rule-id: ogn-258-298 (rule 387) — a reflexive fight scoped to "at its
      // destination" needs `sameZone`, else `location:"same"` matches the
      // whole board and picks a unit standing somewhere else.
      sameZone: ctx.sameZone,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    };
    if (!attackerId || !defenderId) {
      attackerId ??= resolveTarget(attackerTarget, resolverCtx)[0];
      defenderId ??= resolveTarget(defenderTarget, resolverCtx).filter(
        (id) => id !== attackerId,
      )[0];
    }
    // rule 359.3.e.2 / 359.3.e.5 — a target chosen at play time is re-checked
    // against its descriptor as the spell resolves; "they deal damage to each
    // other" cannot be performed with only one legal party, so an illegal
    // attacker OR defender (e.g. the enemy unit Flashed out of "at a
    // battlefield") makes the whole exchange do nothing.
    const stillLegal = (id: string, tgt: TargetDescriptor | string): boolean =>
      typeof tgt === "string" ||
      resolveTarget({ ...tgt, quantity: "all" }, { ...resolverCtx, choosing: true }).includes(id);
    if (
      attackerId &&
      defenderId &&
      stillLegal(attackerId, attackerTarget) &&
      stillLegal(defenderId, defenderTarget)
    ) {
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
      // rule 807.1.c / 814.1.c — a unit that is ALREADY an attacker/defender in
      // a combat carries its Assault/Shield bonus in that current Might, even
      // though this spell is not itself combat (ruling 6a9e16e0194e907a).
      const aMight = getEffectiveMightInRole(attackerId, ctx);
      const dMight = getEffectiveMightInRole(defenderId, ctx);
      // rule-id: ven-083-166 (Rampage) / rule 417.6.b.3 — each unit is the
      // SOURCE of the damage it deals (not the spell), its controller the
      // responsible player (417.6.b.4); both land as one simultaneous batch
      // through the damage choke point (Double / Prevent / immunity apply).
      const controllerOf = (id: string): string =>
        (ctx.cards.getCardController?.(id as CoreCardId) as string | undefined) ??
        (ctx.cards.getCardOwner(id as CoreCardId) as string | undefined) ??
        ctx.playerId;
      dealDamageBatch(ctx, [
        { amount: aMight, source: { cardId: attackerId, kind: "unit", player: controllerOf(attackerId) }, target: defenderId },
        { amount: dMight, source: { cardId: defenderId, kind: "unit", player: controllerOf(defenderId) }, target: attackerId },
      ]);
    }
  }
}
