// Effect handler: "stun"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { tryReplaceCardEvent } from "./_replacement-gate";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_stun(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const stunned = targets.length === 0 ? [ctx.sourceCardId] : targets;
  // rule 423.1: selecting one or more Units is ONE stun action, so the events it
  // fires form one batch — "one or more" triggers match only batchIndex 0.
  let batchIndex = 0;
  for (const targetId of stunned) {
    // rule 423.1.a.1 (ogn-059-298): a stunned unit can't be stunned again —
    // choosing it is legal but no stun happens, so no stun event fires.
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as { stunned?: boolean } | undefined;
    if (meta?.stunned === true) {
      continue;
    }
    // rule 366-372 (ven-181-166): "if a spell or ability that chooses me would
    // stun me, … instead" — the replacement takes over and no stun happens.
    if (
      tryReplaceCardEvent(
        {
          cardId: targetId,
          owner: ctx.cards.getCardOwner?.(targetId as CoreCardId),
          type: "stun",
        },
        ctx,
      )
    ) {
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
      batchIndex: batchIndex++,
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
