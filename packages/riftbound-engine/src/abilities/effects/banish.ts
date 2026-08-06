// Effect handler: "banish"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_banish(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // If the source card is flagged to track exiled cards (The Zero Drive),
  // Record each banished card's instance ID in the source's
  // `exiledByThis` meta. The state-based cleanup will return those cards
  // When the source later leaves the board.
  const banishRegistry = getGlobalCardRegistry();
  const banishSourceDef = banishRegistry.get(ctx.sourceCardId);
  if (banishSourceDef?.tracksExiledCards === true && targets.length > 0) {
    const sourceMeta = ctx.cards.getCardMeta?.(ctx.sourceCardId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = sourceMeta?.exiledByThis ?? [];
    ctx.cards.updateCardMeta?.(
      ctx.sourceCardId as CoreCardId,
      {
        exiledByThis: [...existing, ...(targets as string[])],
      } as unknown as Record<string, unknown>,
    );
  }
  for (const targetId of targets) {
    const from = ctx.zones.getCardZone?.(targetId as CoreCardId) as string | undefined;
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: "banishment" as CoreZoneId,
    });
    // rule 124.1: a card leaving the board for banishment becomes a NEW
    // object — damage, buffs, stun and granted keywords are gone, and any
    // control-changing effect on it ends, so it reverts to its owner
    // (rule 191.1). Matters when it is replayed from banishment
    // (sfd-200-221 Arcane Shift: "then its owner plays it").
    if (from !== "base" && !(from ?? "").startsWith("battlefield-")) {
      continue;
    }
    ctx.counters?.setFlag?.(targetId as CoreCardId, "stunned", false);
    ctx.counters?.setFlag?.(targetId as CoreCardId, "buffed", false);
    ctx.counters?.setFlag?.(targetId as CoreCardId, "exhausted", false);
    ctx.cards.updateCardMeta?.(targetId as CoreCardId, {
      buffed: false,
      combatMightModifier: 0,
      combatRole: null,
      controlEffects: undefined,
      damage: 0,
      grantedKeywords: undefined,
      mightModifier: 0,
      stunned: false,
    } as unknown as Record<string, unknown>);
    const owner = ctx.cards.getCardOwner(targetId as CoreCardId);
    if (owner) {
      ctx.cards.setCardController?.(targetId as CoreCardId, owner as Parameters<
        NonNullable<typeof ctx.cards.setCardController>
      >[1]);
    }
  }
}
