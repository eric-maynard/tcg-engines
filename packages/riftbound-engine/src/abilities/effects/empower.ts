// Effect handler: "empower", "disempower"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_empower(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const empowerTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of empowerTargets) {
    const wasEmpowered =
      (ctx.cards.getCardMeta(targetId as CoreCardId) as { empowered?: boolean } | undefined)
        ?.empowered ?? false;
    // rule 517.2.b: "Disempower it at end of turn" rides along as a duration —
    // the flag is read by the Ending Step cleanup.
    const untilEndOfTurn =
      effect.type === "empower" && (effect as { duration?: string }).duration === "turn";
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        empowered: effect.type === "empower",
        ...(untilEndOfTurn ? { empoweredUntilEndOfTurn: true } : {}),
        ...(effect.type === "disempower" ? { empoweredUntilEndOfTurn: false } : {}),
      } as unknown as Record<string, unknown>,
    );
    // Rule 827.1.c: "When I become [Empowered]" fires on the false→true edge.
    if (effect.type === "empower" && !wasEmpowered) {
      ctx.fireTriggers?.({
        cardId: targetId,
        owner: ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId,
        type: "empower",
      });
    }
  }
}
