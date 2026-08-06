// Effect handler: "ready"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_ready(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // Only fall back to the source card when the ability has NO target
  // descriptor ("ready me"). A targeted ready that finds no legal targets
  // fizzles — otherwise Bubble Bot's "ready another friendly Mech" readies
  // itself when no other Mech is on the board.
  const hasTargetSpec = "target" in effect && effect.target != null;
  const readied = targets.length === 0 && !hasTargetSpec ? [ctx.sourceCardId] : targets;
  const registry = getGlobalCardRegistry();
  for (const targetId of readied) {
    // rule-id: unl-144-219 — "I can't be readied." also blocks ready effects.
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | { grantedKeywords?: { keyword: string }[] }
      | undefined;
    if (registry.cantReady(targetId, meta?.grantedKeywords)) {
      continue;
    }
    ctx.counters.setFlag(targetId as CoreCardId, "exhausted", false);
    ctx.fireTriggers?.({
      cardId: targetId,
      playerId: ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId,
      type: "ready",
    });
  }
}
