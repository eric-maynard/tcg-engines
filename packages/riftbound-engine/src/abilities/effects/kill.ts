// Effect handler: "kill"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_kill(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // rule 428.5.b: a Kill instruction is attributed to this spell/ability's controller.
  const killSource: "spell" | "ability" =
    getGlobalCardRegistry().getCardType(ctx.sourceCardId) === "spell" ? "spell" : "ability";
  const killed: { cardId: string; owner: string; wasStunned: boolean }[] = [];
  ctx.draft.lastKilledUnitMight = undefined;
  for (const targetId of targets) {
    const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? "";
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const wasStunned = meta?.stunned === true;
    // rule-id: unl-186-219 — "if it had N [Might] or less" reads the unit's
    // Might as it last existed on the board (last-known information).
    ctx.draft.lastKilledUnitMight = h.getEffectiveMight(targetId, ctx);
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: "trash" as CoreZoneId,
    });
    killed.push({ cardId: targetId, owner, wasStunned });
  }
  // rule-id: ogn-246-298 — a kill effect is a death: emit `die` so
  // Deathknell / "when a friendly unit dies" triggers fire.
  if (ctx.fireTriggers) {
    for (const { cardId, owner, wasStunned } of killed) {
      ctx.fireTriggers({ cardId, killSource, killedBy: ctx.playerId, owner, type: "die", wasStunned });
    }
  }
}
