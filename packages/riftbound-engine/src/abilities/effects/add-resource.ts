// Effect handler: "add-resource"
import { getActiveShowdown } from "../../chain";
import { computeAddResourceBonus } from "../../operations/add-resource-bonus";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, resolveAmount } from "./_helpers";

/**
 * rule 190.6.a — an ability's controller Adds by default, but text that names
 * other players ("the attacker and defender each [Add] [1]") fills their pools
 * instead. Combat roles come from the showdown running as the effect resolves
 * (rule 464.2.c); a role with nobody in it simply Adds nothing.
 */
function targetPlayers(effect: ExecutableEffect, ctx: EffectContext): string[] {
  const roles = (effect as { players?: readonly string[] }).players;
  if (!roles || roles.length === 0) {
    return [ctx.playerId];
  }
  const showdown = ctx.draft.interaction ? getActiveShowdown(ctx.draft.interaction) : undefined;
  const ids: string[] = [];
  for (const role of roles) {
    const id =
      role === "attacker"
        ? showdown?.attackingPlayer
        : role === "defender"
          ? showdown?.defendingPlayer
          : role === "opponent"
            ? Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId)
            : ctx.playerId;
    if (id !== undefined && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

export function handle_addResource(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  for (const playerId of targetPlayers(effect, ctx)) {
    const pool = ctx.draft.runePools[playerId];
    if (!pool) {
      continue;
    }
    // rule 429.1 (sfd-083-221 Hextech Anomaly): "[Add] that much" scales with
    // the X paid, so the amount may be an expression, not a literal number.
    const energyAmount = resolveAmount(
      effect.energy as number | Record<string, unknown> | undefined,
      ctx,
    );
    if (energyAmount > 0) {
      pool.energy += energyAmount;
      // rule 429.4 (ogs-014-024): "Use only to play spells" earmarks the added
      // Energy — `cost.ts` hides it from plays of any other card type.
      const restriction = (effect as { restriction?: string }).restriction;
      if (restriction) {
        const draft = ctx.draft as {
          restrictedEnergy?: Record<string, Record<string, number>>;
        };
        draft.restrictedEnergy ??= {};
        const forPlayer = (draft.restrictedEnergy[playerId] ??= {});
        forPlayer[restriction] = (forPlayer[restriction] ?? 0) + energyAmount;
      }
    }
    if (effect.power) {
      // rule 429.1 (sfd-117-221 Ancient Henge): "[Add] that much [rainbow]"
      // repeats each listed pip X times when the effect carries an amount.
      const rawCount = (effect as { amount?: unknown }).amount;
      const repeats = rawCount === undefined ? 1 : resolveAmount(rawCount as number, ctx);
      // rule 429.4 (ogn-247-298): "Use only to play spells" earmarks the added
      // Power exactly as it does Energy — `cost.ts` hides it from plays of any
      // other card type and from ability activations.
      const powerRestriction = (effect as { restriction?: string }).restriction;
      const draft = ctx.draft as {
        restrictedPower?: Record<string, Record<string, Record<string, number>>>;
      };
      let earmark: Record<string, number> | undefined;
      if (powerRestriction) {
        draft.restrictedPower ??= {};
        const forPlayer = (draft.restrictedPower[playerId] ??= {});
        earmark = forPlayer[powerRestriction] ??= {};
      }
      for (let i = 0; i < repeats; i++) {
        for (const domain of effect.power) {
          const key = domain as keyof typeof pool.power;
          pool.power[key] = (pool.power[key] ?? 0) + 1;
          if (earmark) {
            earmark[domain] = (earmark[domain] ?? 0) + 1;
          }
        }
      }
    }
    // rule 429.1 — how much is Added is computed as the ability resolves, so a
    // board static ("your Gold [ADD] an additional [1]") augments this Add.
    if (energyAmount > 0 || effect.power) {
      const bonus = computeAddResourceBonus(ctx, playerId, ctx.sourceCardId);
      pool.energy += bonus.energy;
      for (const [domain, count] of Object.entries(bonus.power)) {
        const key = domain as keyof typeof pool.power;
        pool.power[key] = (pool.power[key] ?? 0) + count;
      }
    }
  }
}
