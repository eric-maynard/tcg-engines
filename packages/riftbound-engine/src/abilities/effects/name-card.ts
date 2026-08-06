// Effect handler: "name-card"
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers } from "./_helpers";

export function handle_nameCard(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // Rule 762 / 383.2.b: on resolution the controller names a legal card
  // of the given type. Pause play via pendingChoice; resolvePendingChoice
  // records the chosen name on the source card's `namedCard` meta.
  const cardType =
    (effect as unknown as { cardType?: "spell" | "unit" | "gear" }).cardType ?? "spell";
  const options = getGlobalCardRegistry().listNames(cardType);
  if (options.length === 0) {
    return;
  }
  ctx.draft.pendingChoice = {
    cardType,
    options,
    prompter: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    type: "name-card",
  };
}
