// Effect handler: "choose-per-location"
//
// rule 106 / rule 355.13 (unl-118-219 Elder Dragon) — "choose up to one enemy
// unit at each location. Deal 1 to them." Every base and every battlefield is a
// separate location, so the chooser may name at most one candidate per zone and
// zero everywhere is a legal answer.
import type { CardId as CoreCardId } from "@tcg/core";
import { getDeflectSurcharge } from "../../game-definition/moves/play/cost";
import { surchargeFields, surchargedOptions } from "../../game-definition/moves/prompt-cost";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectHelpers } from "./_helpers";

/** Minimal accessors needed to key a card by its location (rule 106). */
export interface LocationKeyAccessors {
  cards: {
    getCardController?: (id: CoreCardId) => string | undefined;
    getCardOwner?: (id: CoreCardId) => string | undefined;
  };
  zones: { getCardZone?: (id: CoreCardId) => string | undefined };
}

/**
 * rule 106 / rule 420.1 — each battlefield is a location and each player's base
 * is its own location, so bases are keyed by controller.
 * Shared with the prompt layer so "up to one at each location" can be enforced
 * while picking, not only when the picks are applied.
 */
export function locationKeyOf(cardId: string, acc: LocationKeyAccessors): string {
  const zone = acc.zones.getCardZone?.(cardId as CoreCardId) ?? "";
  if (zone === "base") {
    const controller =
      acc.cards.getCardController?.(cardId as CoreCardId) ??
      acc.cards.getCardOwner?.(cardId as CoreCardId) ??
      "";
    return `base:${controller}`;
  }
  return String(zone);
}

function locationKey(cardId: string, ctx: EffectContext): string {
  return locationKeyOf(cardId, ctx as unknown as LocationKeyAccessors);
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

  // rule 402.2 — the objects were named while the item was FINALIZED (or by an
  // earlier prompt): apply the inner effect to exactly them, keeping at most
  // one per location (rule 106). An empty set is a legal answer ("up to one"),
  // and nothing is re-picked here.
  const picked = ctx.boundTargets;
  if (picked) {
    const seen = new Set<string>();
    // rule 355.5 / 359.3.e.5 — each object was chosen FOR one location; one that
    // is somewhere else by resolution (Flashed home, moved) fails the "at each
    // location" restriction and is simply not affected. Never re-target.
    const chosenAt = ctx.draft.perLocationTargets?.[ctx.sourceCardId];
    for (const id of picked) {
      const key = locationKey(id, ctx);
      if (chosenAt?.[id] !== undefined && chosenAt[id] !== key) {
        continue;
      }
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      h.executeEffect(inner, { ...ctx, boundTargets: [id] });
    }
    return;
  }

  if (ctx.draft.pendingChoice) {
    return;
  }
  raiseChoosePerLocationChoice(effect, ctx);
}

/**
 * rule 106 / 355.13 — raise the "up to one at each location" pick for
 * `effect.candidates` on `ctx.draft.pendingChoice`, returning false when there
 * is nothing to choose. `extra` carries `bindToChainItemId` when the choice is
 * made while the item is FINALIZED (rule 402.2) instead of as it resolves.
 */
export function raiseChoosePerLocationChoice(
  effect: ExecutableEffect,
  ctx: EffectContext,
  extra: Record<string, unknown> = {},
): boolean {
  const spec = effect as unknown as { candidates?: TargetDescriptor };
  if (!spec.candidates) {
    return false;
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
    return false;
  }
  // rule 809.1.c / 809.1.c.1 (356.2.a.2) — [Deflect] taxes ABILITIES as well as
  // spells, and the surcharge is incurred when the target is CHOSEN. This
  // prompt is built from `candidates` (not `target`), so it never passes
  // through the generic gating in chain/resolve.ts: a candidate no Add could
  // ever fund is dropped here (809.1.d), one the pool merely does not cover YET
  // stays listed (429.3), and the prompt carries `deflectTax` +
  // `deflectPerOption` so pending-choice gates and charges it at pick time.
  const taxed = surchargedOptions(
    ctx.draft,
    ctx.playerId,
    options,
    (id) =>
      getDeflectSurcharge(
        ctx.draft,
        ctx.playerId,
        [id],
        ctx.cards as Parameters<typeof getDeflectSurcharge>[3],
        ctx.sourceCardId,
      ),
    ctx.zones as never,
  );
  const pool = taxed.options;
  if (pool.length === 0) {
    return false;
  }
  // rule 355.13: "up to one at EACH location" — the cap is the number of
  // distinct locations that hold a candidate, and declining is always legal.
  const locations = new Set(pool.map((id) => locationKey(id, ctx)));
  // rule 355.5 / 359.3.e.5 — a candidate is chosen FOR the location it sits at
  // NOW (the whole answer is given before anyone gets Priority, so this is also
  // where it was when picked). Remember that, so a unit Flashed elsewhere
  // before the ability resolves fails the restriction instead of being followed
  // to its new location — and the ability never re-targets.
  (ctx.draft as { perLocationTargets?: Record<string, Record<string, string>> }).perLocationTargets =
    {
      ...(ctx.draft.perLocationTargets ?? {}),
      [ctx.sourceCardId]: Object.fromEntries(pool.map((id) => [id, locationKey(id, ctx)])),
    };
  ctx.draft.pendingChoice = {
    anyNumber: true,
    ...surchargeFields(taxed),
    ...extra,
    effect: effect as never,
    maxPicks: locations.size,
    // rule 106: the prompt layer must drop options sharing a location with an
    // already-named pick — otherwise a second pick here eats the pick budget.
    onePerLocation: true,
    options: [...pool],
    playerId: ctx.playerId,
    remaining: pool.length,
    sourceCardId: ctx.sourceCardId,
    type: "choose-target",
  } as never;
  return true;
}
