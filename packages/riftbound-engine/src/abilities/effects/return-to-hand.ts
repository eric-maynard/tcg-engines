// Effect handler: "return-to-hand"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import { removeFromBoard } from "../../operations/leave-board";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { tryReplaceCardEvent } from "./_replacement-gate";
import { type EffectHelpers, getTargetIds, raiseTotalMightSubsetRepick } from "./_helpers";

/**
 * rule-id: ogn-172-298 / sfd-044-221 / sfd-202-221 / ogn-181-298 — a card
 * bounced to hand leaves through the leave-board choke point: its attachment
 * links break both ways (rule 435 / 457.1), it is a NEW object in hand with no
 * exhaustion, damage, buffs, stun, grants, hidden status or control change
 * (rule 124.1 / 191.1), and a token ceases to exist instead (rule 186.1).
 */
function bounceToHand(cardIds: readonly string[], ctx: EffectContext): void {
  // rule 366-372 (ven-181-166): "if a spell or ability that chooses me would …
  // return me to hand, … instead" — a replaced card never leaves the board.
  const bounced = cardIds.filter(
    (cardId) =>
      !tryReplaceCardEvent(
        {
          cardId,
          owner: ctx.cards.getCardOwner?.(cardId as CoreCardId),
          type: "return-to-hand",
        },
        ctx,
      ),
  );
  if (bounced.length === 0) {
    return;
  }
  const results = removeFromBoard(
    ctx,
    bounced,
    "hand",
    { by: ctx.playerId, kind: "bounce", source: ctx.sourceCardId },
    ctx.fireTriggers,
  );
  // rule 446.2 (unl-214-219) — a bounce is a zone change, not a Move, and the
  // generic `leave-board` event does not say WHERE the card went. Publish the
  // dedicated event so "when a unit here is returned to a player's hand" texts
  // can read the unit's origin (`from`) and the hand it went to (`owner`, rule 108).
  const fire = ctx.fireTriggers;
  if (fire === undefined) {
    return;
  }
  for (const r of results) {
    if (!r.left) {
      continue;
    }
    fire({
      cardId: r.cardId,
      controller: r.lki.controller,
      from: r.lki.zone,
      owner: r.lki.owner,
      type: "return-to-hand",
    });
  }
}

export function handle_returnToHand(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  // rule 355.11.b (ven-107-166 Decree of Discord) — "units with total Might N or
  // less" binds the GROUP, not each target: if a response pushes the chosen
  // group over the cap, the caster re-picks a legal subset of the ORIGINAL
  // targets instead of bouncing everything that is still individually legal.
  if (raiseTotalMightSubsetRepick(effect, ctx)) {
    return;
  }
  const targets = getTargetIds(effect, ctx);
  // Only fall back to the source card when the ability has NO target
  // descriptor (i.e. "return me to hand"). A targeted return that finds
  // no legal targets fizzles — otherwise Windsinger's on-play "return an
  // enemy unit" bounces itself when the board is empty.
  const hasTargetSpec = "target" in effect && effect.target != null;
  const namesOwnSource =
    effect.target === undefined ||
    effect.target === "self" ||
    (typeof effect.target === "object" &&
      effect.target !== null &&
      (effect.target as { type?: string }).type === "self");
  const ids = targets.length === 0 && (!hasTargetSpec || namesOwnSource) ? [ctx.sourceCardId] : targets;
  // rule 108 / 124.1 (rule-id: ogn-252-298 Super Mega Death Rocket!) — "return
  // this from your trash to your hand": a card in the trash is not on the
  // board, so the leave-board choke point has nothing to remove. Move it out of
  // the trash directly; it is a new object in hand either way.
  const fromTrash = new Set(
    ids.filter((cardId) => ctx.zones.getCardZone?.(cardId as CoreCardId) === "trash"),
  );
  for (const cardId of fromTrash) {
    ctx.zones.moveCard({ cardId: cardId as CoreCardId, targetZoneId: "hand" as CoreZoneId });
  }
  const onBoard = ids.filter((cardId) => !fromTrash.has(cardId));
  if (onBoard.length > 0) {
    bounceToHand(onBoard, ctx);
  }
}
