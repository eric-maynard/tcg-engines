// Effect handler: "kill"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_kill(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const killed: { cardId: string; owner: string }[] = [];
  for (const targetId of targets) {
    const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? "";
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: "trash" as CoreZoneId,
    });
    killed.push({ cardId: targetId, owner });
  }
  // rule-id: ogn-246-298 — a kill effect is a death: emit `die` so
  // Deathknell / "when a friendly unit dies" triggers fire.
  if (ctx.fireTriggers) {
    for (const { cardId, owner } of killed) {
      ctx.fireTriggers({ cardId, owner, type: "die" });
    }
  }
}
