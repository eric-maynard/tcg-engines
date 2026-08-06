// Effect handler: "replacement"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_replacement(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Rule 571: an activated ability that resolves to a replacement effect
  // installs it into game state so future events can consult it. The
  // damage-bonus consumer wiring is TODO; this at least records intent.
  const active = ctx.draft.activeReplacements ?? [];
  // rule-id: unl-007-219 — a die-replacement rider ("If it would die this
  // turn, banish it instead") is bound to the specific unit(s) the effect
  // targeted, so state-based checks can match it against the dying card.
  const replEff = effect as unknown as { replaces?: string; target?: unknown; duration?: string };
  // rule-id: ogn-254-298 — "Choose a unit. Kill it the next time it takes
  // damage": the play-time chosen unit (boundTargets) binds a single-fire
  // take-damage replacement so the damage handler matches only that unit.
  const bindsTakeDamage =
    replEff.replaces === "take-damage" && replEff.duration === "next" && !!ctx.boundTargets;
  const targetCardIds =
    (replEff.replaces === "die" && (replEff.target !== undefined || ctx.boundTargets)) ||
    bindsTakeDamage
      ? getTargetIds(effect, ctx)
      : undefined;
  (ctx.draft as { activeReplacements?: unknown[] }).activeReplacements = [
    ...active,
    {
      ...effect,
      owner: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      ...(targetCardIds && targetCardIds.length > 0 ? { targetCardIds } : {}),
    },
  ];
}
