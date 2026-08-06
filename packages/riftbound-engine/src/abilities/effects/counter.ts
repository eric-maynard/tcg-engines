// Effect handler: "counter"
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
      const targetItem = items[items.length - 1];
      if (targetItem && !targetItem.countered) {
        // Mutate in-place (we're inside an Immer draft)
        (targetItem as { countered: boolean }).countered = true;
      }
    }
  }
}
