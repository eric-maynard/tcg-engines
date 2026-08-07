// Effect handler: "choose-per-location"
//
// rule 106 / rule 355.13 (unl-118-219 Elder Dragon) — "choose up to one enemy
// unit at each location. Deal 1 to them." Every base and every battlefield is a
// separate location, so the chooser may name at most one candidate per zone and
// zero everywhere is a legal answer.
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectHelpers } from "./_helpers";

/** rule 420.1 — each player's base is its own location, keyed by controller. */
function locationKey(cardId: string, ctx: EffectContext): string {
  const zone = ctx.zones.getCardZone?.(cardId as CoreCardId) ?? "";
  if (zone === "base") {
    const controller =
      ctx.cards.getCardController?.(cardId as CoreCardId) ??
      ctx.cards.getCardOwner?.(cardId as CoreCardId) ??
      "";
    return `base:${controller}`;
  }
  return String(zone);
}

export function handle_choosePerLocation(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  // The candidate pool is deliberately NOT called `target`: a bare `target`
  // descriptor is lifted into a single-pick prompt by `resolve.ts` before this
  // handler ever runs, which would lose the per-location cap (rule 106).
  const spec = effect as unknown as {
    candidates?: TargetDescriptor;
    effect?: ExecutableEffect;
  };
  const inner = spec.effect;
  if (!inner) {
    return;
  }

  // Re-entry from the prompt: apply the inner effect to the chosen units,
  // keeping at most one per location (rule 106).
  const picked = ctx.boundTargets;
  if (picked && picked.length > 0) {
    const seen = new Set<string>();
    for (const id of picked) {
      const key = locationKey(id, ctx);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      h.executeEffect(inner, { ...ctx, boundTargets: [id] });
    }
    return;
  }

  if (!spec.candidates || ctx.draft.pendingChoice) {
    return;
  }
  const options = resolveTarget({ ...spec.candidates, quantity: "all" }, {
    cards: ctx.cards,
    choosing: true,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    zones: ctx.zones,
  } as Parameters<typeof resolveTarget>[1]);
  if (options.length === 0) {
    return;
  }
  // rule 355.13: "up to one at EACH location" — the cap is the number of
  // distinct locations that hold a candidate, and declining is always legal.
  const locations = new Set(options.map((id) => locationKey(id, ctx)));
  ctx.draft.pendingChoice = {
    anyNumber: true,
    effect: effect as never,
    maxPicks: locations.size,
    options: [...options],
    playerId: ctx.playerId,
    remaining: options.length,
    sourceCardId: ctx.sourceCardId,
    type: "choose-target",
  } as never;
}
