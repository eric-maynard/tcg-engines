// Effect handler: "kill"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import { applyDieReplacement } from "../../cleanup/state-based-checks";
import type { CleanupContext } from "../../cleanup/state-based-checks";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_kill(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // rule 428.5.b: a Kill instruction is attributed to this spell/ability's controller.
  const killSource: "spell" | "ability" =
    getGlobalCardRegistry().getCardType(ctx.sourceCardId) === "spell" ? "spell" : "ability";
  const killed: { cardId: string; owner: string; wasStunned: boolean; diedAt?: string }[] = [];
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
    // rule 428.1.a.1.b: last known location feeds "at my battlefield" triggers.
    const diedAt = ctx.zones.getCardZone?.(targetId as CoreCardId) as string | undefined;
    // rule 370.1.a.1 / 369.1 — a board `die` replacement (Zhonya's Hourglass)
    // applies to a kill instruction too: the death never happens, so the unit
    // stays on the board and its Deathknell never resolves (808.1.d.1).
    if (applyDieReplacement(ctx as unknown as CleanupContext, targetId)) {
      continue;
    }
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: "trash" as CoreZoneId,
    });
    killed.push({ cardId: targetId, diedAt, owner, wasStunned });
  }
  // rule-id: ogn-246-298 — a kill effect is a death: emit `die` so
  // Deathknell / "when a friendly unit dies" triggers fire.
  if (ctx.fireTriggers) {
    for (const { cardId, diedAt, owner, wasStunned } of killed) {
      ctx.fireTriggers({ cardId, diedAt, killSource, killedBy: ctx.playerId, owner, type: "die", wasStunned });
    }
  }
}
