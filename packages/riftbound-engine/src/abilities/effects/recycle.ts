// Effect handler: "recycle"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_recycle(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule-id: unl-204-219-owner-chooses-top-or-bottom — "Its owner places it
  // on the top or bottom of their Main Deck." Only the owner-choice form is
  // executed here; it prompts the target's OWNER via choose-destination
  // with mainDeck-top / mainDeck-bottom options.
  if ((effect as { position?: string }).position !== "owner-choice") {
    return;
  }
  const [targetId] = getTargetIds(effect, ctx);
  if (!targetId) {
    return;
  }
  const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId;
  ctx.draft.pendingChoice = {
    cardId: targetId,
    options: ["mainDeck-top", "mainDeck-bottom"],
    playerId: owner,
    type: "choose-destination",
  };
}
