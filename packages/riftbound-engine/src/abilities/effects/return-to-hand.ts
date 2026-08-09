// Effect handler: "return-to-hand"
import type { CardId as CoreCardId } from "@tcg/core";
import { removeFromBoard } from "../../operations/leave-board";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { tryReplaceCardEvent } from "./_replacement-gate";
import { type EffectHelpers, getTargetIds } from "./_helpers";

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
  const targets = getTargetIds(effect, ctx);
  // Only fall back to the source card when the ability has NO target
  // descriptor (i.e. "return me to hand"). A targeted return that finds
  // no legal targets fizzles — otherwise Windsinger's on-play "return an
  // enemy unit" bounces itself when the board is empty.
  const hasTargetSpec = "target" in effect && effect.target != null;
  if (targets.length === 0 && !hasTargetSpec) {
    bounceToHand([ctx.sourceCardId], ctx);
  } else {
    bounceToHand(targets, ctx);
  }
}
