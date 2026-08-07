// Effect handler: "temporary-kill"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { type LeaveBoardContext, removeFromBoard } from "../../operations/leave-board";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { EffectHelpers } from "./_helpers";

/**
 * rule 816.1 — [Temporary] is a TRIGGERED ability ("At the start of your
 * Beginning Phase, kill me"), so its kill goes on the Chain and both players
 * get Priority over it. This handler is what that chain item resolves to.
 *
 * rule 359.3.e.12 — by the time it resolves the permanent may have left the
 * board (bounced/banished in response) or lost [Temporary]: the item then does
 * nothing. `leaveBoard` already refuses to kill a card that is off the board,
 * so only the keyword needs re-checking here.
 */
export function handle_temporaryKill(
  _effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const cardId = ctx.sourceCardId;
  if (cardId === undefined) {
    return;
  }
  const registry = getGlobalCardRegistry();
  const meta = ctx.cards.getCardMeta?.(cardId as CoreCardId) as
    | { grantedKeywords?: readonly { keyword: string }[] }
    | undefined;
  const stillTemporary =
    registry.hasKeyword(cardId, "Temporary") ||
    (meta?.grantedKeywords ?? []).some((gk) => gk.keyword === "Temporary");
  if (!stillTemporary) {
    return;
  }
  removeFromBoard(
    ctx as unknown as LeaveBoardContext,
    [cardId],
    "trash",
    { by: ctx.playerId, kind: "temporary" },
    ctx.fireTriggers,
  );
}
