// Effect handler: "stun"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_stun(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const stunned = targets.length === 0 ? [ctx.sourceCardId] : targets;
  for (const targetId of stunned) {
    // rule 423.1.a.1 (ogn-059-298): a stunned unit can't be stunned again —
    // choosing it is legal but no stun happens, so no stun event fires.
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as { stunned?: boolean } | undefined;
    if (meta?.stunned === true) {
      continue;
    }
    ctx.counters.setFlag(targetId as CoreCardId, "stunned", true);
    // rule 423.1: setFlag writes meta.__flags.stunned but every reader (combat
    // resolver, target filters, kill/die events, end-of-turn clear) checks
    // top-level meta.stunned; mirror it there (same pattern as buff.ts).
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      { stunned: true } as unknown as Record<string, unknown>,
    );
    // rule-id: unl-055-219 — emit the stun event so "When you [Stun] an enemy
    // unit at a battlefield" triggers (Vex, Mocking) can match.
    const zone = ctx.zones.getCardZone(targetId as CoreCardId);
    ctx.fireTriggers?.({
      cardId: targetId,
      owner: ctx.cards.getCardOwner(targetId as CoreCardId),
      stunnedBy: ctx.playerId,
      type: "stun",
      ...(zone?.startsWith("battlefield-")
        ? { battlefieldId: zone.replace(/^battlefield-/, "") }
        : {}),
    });
  }
}
