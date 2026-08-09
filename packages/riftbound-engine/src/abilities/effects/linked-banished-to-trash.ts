// Effect handler: "linked-banished-to-trash"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, linkedBanishedIds } from "./_helpers";

/**
 * rule 394-397 (rule-id: unl-181-219, Virtuoso) — a Linked ability only ever
 * sees the cards ITS OWN ability banished (`exiledByThis`, written by
 * `effects/banish.ts` when the banish asks for `trackLinked`). "Put each in
 * its trash" moves exactly those, in their owner's trash (rule 161.2.a), and
 * empties the link list so the next set starts from zero.
 */
export function handle_linkedBanishedToTrash(
  _effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const ids = linkedBanishedIds(ctx);
  for (const id of ids) {
    ctx.zones.moveCard({ cardId: id as CoreCardId, targetZoneId: "trash" as CoreZoneId });
  }
  ctx.cards.updateCardMeta?.(ctx.sourceCardId as CoreCardId, {
    exiledByThis: [],
  } as unknown as Record<string, unknown>);
}
