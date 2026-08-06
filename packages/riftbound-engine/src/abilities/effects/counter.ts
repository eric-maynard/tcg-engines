// Effect handler: "counter"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import { removeChainItem } from "../../chain";
import { isLegalCounterTarget } from "../../chain/counter-target";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_counter(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Counter a spell — mark the next item on the chain as countered
  // So its effect is skipped during resolution (rule 543)
  const chain = ctx.draft.interaction?.chain;
  if (chain && chain.items.length > 0) {
    // The item below the counter on the stack is the target
    // (counter was on top, already popped; the new top is the target)
    const { items } = chain;
    if (items.length > 0) {
      // rule-id: sfd-206-221 — "Counter a spell": the target is the topmost
      // un-countered SPELL beneath this item (never a triggered/activated
      // ability sitting above it, and never the countering spell itself),
      // sharing the play-time gate's legality check (isLegalCounterTarget).
      const counterSpec = effect as { target?: unknown };
      let targetItem: (typeof items)[number] | undefined;
      // rule-id: ogn-064-298 (rule 355.8) — the spell to counter was chosen
      // at play time and travels as boundTargets[0]; honour it rather than
      // defaulting to the topmost item when several spells are pending.
      const boundId = ctx.boundTargets?.[0];
      const boundOnChain =
        boundId !== undefined && items.some((it) => it && it.cardId === boundId);
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (!isLegalCounterTarget(counterSpec, item, ctx.sourceCardId)) continue;
        if (boundOnChain && item.cardId !== boundId) continue;
        targetItem = item;
        break;
      }
      // rule-id: sfd-206-221 — remember "that spell" for follow-up steps, since
      // a countered spell no longer sits on the chain to be read back.
      ctx.draft.lastCounterTargetId = targetItem?.cardId;
      // rule-id: ven-015-166 — "This can't be countered." (rule 544): the
      // counter resolves but has no effect on an uncounterable item.
      if (targetItem && !targetItem.countered && !targetItem.uncounterable) {
        // Mutate in-place (we're inside an Immer draft)
        (targetItem as { countered: boolean }).countered = true;
        // rule-id: unl-131-219 — "Return it to its owner's hand instead of
        // putting it in their trash": redirect where the countered spell
        // settles when it leaves the chain.
        if ((effect as { destination?: string }).destination === "hand" && targetItem.type === "spell") {
          (targetItem as { resolveTo?: string }).resolveTo = "hand";
        }
        // rule-id: ogn-064-298 (rule 425.1.a / 425.1.a.1) — a countered card
        // is cleared from the chain and put in its settle zone as part of
        // being countered, not deferred to the next all-pass resolution.
        const { cardId, id, resolveTo, type } = targetItem;
        if (
          type === "spell" &&
          ctx.zones.getCardZone(cardId as CoreCardId) === "chain"
        ) {
          ctx.zones.moveCard({
            cardId: cardId as CoreCardId,
            targetZoneId: (resolveTo ?? "trash") as CoreZoneId,
          });
        }
        if (ctx.draft.interaction) {
          ctx.draft.interaction = removeChainItem(ctx.draft.interaction, id);
        }
      }
    }
  }
}
