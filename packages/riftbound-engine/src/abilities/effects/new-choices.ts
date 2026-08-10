// Effect handler: "new-choices"
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { offerNewChoices } from "../new-choices";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import { type EffectHelpers } from "./_helpers";

/**
 * rule 751–755 — "[You may] choose new targets for it" / "make new choices for
 * that spell" as its own instruction: the finalized chain item it names has its
 * finalization choices (modes, targets, destinations — 752.1) re-offered to
 * this effect's controller, one keep-or-change slot at a time
 * (`abilities/new-choices.ts`). The item is the one bound at play time ("Choose
 * an enemy spell. …" — a card id or chain-item id), else the one the descriptor
 * resolves to, else the newest other item on the chain; never this effect's own.
 */
export function handle_newChoices(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const items = ctx.draft.interaction?.chain?.items;
  if (!items || items.length === 0 || ctx.draft.pendingChoice) {
    return;
  }
  const named = new Set<string>(ctx.boundTargets ?? []);
  const desc = effect.target;
  if (named.size === 0 && desc && typeof desc === "object" && (desc as TargetDescriptor).type !== "pending-value") {
    for (const id of resolveTarget({ ...(desc as TargetDescriptor), quantity: "all" }, {
      cards: ctx.cards,
      choosing: true,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      zones: ctx.zones,
    })) {
      named.add(id);
    }
  }
  let item: (typeof items)[number] | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it || it.countered || it.cardId === ctx.sourceCardId || it.status === "pending") continue;
    if (named.size > 0 && !named.has(it.cardId) && !named.has(it.id)) continue;
    item = it;
    break;
  }
  if (!item) {
    return;
  }
  offerNewChoices(ctx.draft, item.id, ctx.playerId, ctx, {
    grantedBy: ctx.sourceCardId,
    optional: (effect as { optional?: boolean }).optional !== false,
  });
}
