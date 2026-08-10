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
  const stillTemporary = (id: string): boolean => {
    const meta = ctx.cards.getCardMeta?.(id as CoreCardId) as
      | { grantedKeywords?: readonly { keyword: string }[]; attachedTo?: string }
      | undefined;
    const granted = (meta?.grantedKeywords ?? []).some((gk) => gk.keyword === "Temporary");
    // rule 718.2 / 721.2 — a printed [Temporary] is Inactive while the card is
    // attached (it got equipped in response): the item then does nothing.
    const printed =
      getGlobalCardRegistry().hasKeyword(id, "Temporary") && meta?.attachedTo === undefined;
    return printed || granted;
  };
  if (!stillTemporary(cardId)) {
    return;
  }
  // rule 808.1.d.2 / 428.1 — every [Temporary] queued by the same start-of-phase
  // instant dies SIMULTANEOUSLY, so the first of those items to resolve kills
  // the whole batch in one leave-board pass; the sibling items then resolve to
  // nothing. Their `die` triggers are therefore counted off ONE board state — a
  // unit a Deathknell brings back cannot grow another death's trigger count.
  const chain = (ctx.draft.interaction?.chain?.items ?? []) as readonly {
    readonly cardId: string;
    readonly effect?: unknown;
    readonly triggerBatch?: string;
  }[];
  const isTemporaryKill = (item: { readonly effect?: unknown }): boolean =>
    (item.effect as { type?: string } | undefined)?.type === "temporary-kill";
  const batch = chain.find((i) => i.cardId === cardId && isTemporaryKill(i))?.triggerBatch;
  const siblings = chain
    .filter(
      (i) =>
        isTemporaryKill(i) &&
        i.cardId !== cardId &&
        (batch === undefined || i.triggerBatch === batch) &&
        stillTemporary(i.cardId),
    )
    .map((i) => i.cardId);
  removeFromBoard(
    ctx as unknown as LeaveBoardContext,
    [cardId, ...new Set(siblings)],
    "trash",
    { by: ctx.playerId, kind: "temporary" },
    ctx.fireTriggers,
  );
}
