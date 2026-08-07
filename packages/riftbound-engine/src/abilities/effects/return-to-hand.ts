// Effect handler: "return-to-hand"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";
import { attachedUnitOf, detachEquipment } from "./_attachment";

/**
 * rule 435 — break every attachment link a card leaving the board is part of:
 * as the worn Equipment (its holder loses the Might bonus) and as the holder
 * (its Equipment comes loose and returns to base).
 */
function detachAttachments(cardId: string, ctx: EffectContext): void {
  if (attachedUnitOf(ctx, cardId) !== undefined) {
    detachEquipment(ctx, cardId);
  }
  const held = (ctx.cards.getCardMeta?.(cardId as CoreCardId) as { equippedWith?: string[] } | undefined)
    ?.equippedWith;
  for (const equipId of Array.isArray(held) ? [...held] : []) {
    detachEquipment(ctx, equipId);
    ctx.zones.moveCard({ cardId: equipId as CoreCardId, targetZoneId: "base" as CoreZoneId });
  }
}

/**
 * rule-id: ogn-172-298 — a unit bounced to hand leaves the board, so its
 * board-only state (exhausted, damage, buffs, stun, …) must not persist.
 * moveCard only changes zone; clear the meta explicitly like the kill path.
 */
function bounceToHand(cardId: string, ctx: EffectContext): void {
  // rule 435 (sfd-044-221) — a card leaving the board takes its attachment
  // links with it: an Equipment bounced to hand detaches from its holder (which
  // loses the Might bonus), and a bounced unit drops the Equipment it wore.
  detachAttachments(cardId, ctx);
  ctx.zones.moveCard({
    cardId: cardId as CoreCardId,
    targetZoneId: "hand" as CoreZoneId,
  });
  ctx.counters.setFlag(cardId as CoreCardId, "exhausted", false);
  ctx.counters.setFlag(cardId as CoreCardId, "stunned", false);
  ctx.counters.setFlag(cardId as CoreCardId, "buffed", false);
  // rule 124.1 (sfd-202-221) — the card in hand is a new object: a temporary
  // control change does not survive the zone change either.
  const owner = ctx.cards.getCardOwner(cardId as CoreCardId);
  if (owner !== undefined) {
    ctx.cards.setCardController?.(cardId as CoreCardId, owner);
  }
  ctx.cards.updateCardMeta?.(cardId as CoreCardId, {
    buffed: false,
    controlEffects: undefined,
    combatRole: null,
    damage: 0,
    exhausted: false,
    grantedKeywords: undefined,
    // rule-id: ogn-181-298 — a facedown card returned to hand stops being hidden.
    hidden: false,
    hiddenAt: undefined,
    mightModifier: 0,
    stunned: false,
  } as Partial<RiftboundCardMeta> as Record<string, unknown>);
}

export function handle_returnToHand(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // Only fall back to the source card when the ability has NO target
  // descriptor (i.e. "return me to hand"). A targeted return that finds
  // no legal targets fizzles — otherwise Windsinger's on-play "return an
  // enemy unit" bounces itself when the board is empty.
  const hasTargetSpec = "target" in effect && effect.target != null;
  if (targets.length === 0 && !hasTargetSpec) {
    bounceToHand(ctx.sourceCardId, ctx);
  } else {
    for (const targetId of targets) {
      bounceToHand(targetId, ctx);
    }
  }
}
