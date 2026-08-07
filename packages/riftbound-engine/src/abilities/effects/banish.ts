// Effect handler: "banish"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { removeFromBoard } from "../../operations/leave-board";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

function isBoardZone(zone: string | undefined): boolean {
  return zone === "base" || (zone ?? "").startsWith("battlefield-");
}

export function handle_banish(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  // If the source card is flagged to track exiled cards (The Zero Drive),
  // Record each banished card's instance ID in the source's
  // `exiledByThis` meta. The state-based cleanup will return those cards
  // When the source later leaves the board.
  const banishRegistry = getGlobalCardRegistry();
  const banishSourceDef = banishRegistry.get(ctx.sourceCardId);
  // rule 397 (rule-id: unl-148-219) — a Linked ability ("play a unit banished
  // WITH THIS") needs the same list without the Zero Drive's return-on-leave
  // behaviour, so the banish effect itself can ask for the tagging.
  const tracksLinked =
    banishSourceDef?.tracksExiledCards === true ||
    (effect as { trackLinked?: unknown }).trackLinked === true;
  if (tracksLinked && targets.length > 0) {
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
  const fromBoard: string[] = [];
  const origin = new Map<string, string>();
  for (const targetId of targets) {
    const from = ctx.zones.getCardZone?.(targetId as CoreCardId) as string | undefined;
    if (isBoardZone(from)) {
      fromBoard.push(targetId);
      origin.set(targetId, from as string);
      continue;
    }
    // Banishing from a non-board zone (trash, hand, deck) is a plain move.
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: "banishment" as CoreZoneId,
    });
    // rule 186.1: a token anywhere off the board ceases to exist.
    if ((targetId as string).startsWith("token-")) {
      ctx.zones.removeCardFromGame?.({ cardId: targetId as CoreCardId });
    }
  }
  if (fromBoard.length === 0) {
    return;
  }
  // rule 427.1 / 124.1 / 186.1 / 457.1 — a permanent banished from the board
  // leaves through the choke point: not a kill (no Deathknell), Equipment
  // detaches, the card is a NEW object (damage, buffs, stun, grants and
  // control changes gone — rule 191.1) and a token ceases to exist at once so
  // a follow-up "then its owner plays it" step finds nothing to replay.
  removeFromBoard(
    ctx,
    fromBoard,
    "banishment",
    { by: ctx.playerId, kind: "banish", source: ctx.sourceCardId },
    ctx.fireTriggers,
  );
  for (const targetId of fromBoard) {
    if ((targetId as string).startsWith("token-")) {
      continue;
    }
    // rule-id: ven-066-166 — remember the board zone it left so a "then its
    // owner plays it to the same location" step has a destination.
    ctx.cards.updateCardMeta?.(targetId as CoreCardId, {
      banishedFrom: origin.get(targetId),
    } as unknown as Record<string, unknown>);
  }
}
