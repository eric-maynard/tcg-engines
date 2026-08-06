// Effect handler: "delayed-lose-control"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * rule 317.1 / 455 (sfd-202-221 Hostile Takeover) — "Lose control of that unit
 * and recall it at end of turn". The control change itself is an ordinary
 * `take-control`; this step stamps the control effect it just created so the
 * Ending Step expires it (and, with `recall`, sends the permanent to its
 * controller's base — recalling is not a move, rule 458.1).
 */
export function handle_delayedLoseControl(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const targets = getTargetIds(effect, ctx);
  const recall = (effect as { recall?: boolean }).recall === true;
  for (const targetId of targets) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const effects = meta?.controlEffects;
    if (!effects || effects.length === 0) {
      continue;
    }
    // Only the controller this ability just installed loses control; earlier
    // layers (another player's steal) stay put and take over on expiry.
    const stamped = effects.map((entry, i) =>
      i === effects.length - 1 && entry.controllerId === ctx.playerId
        ? { ...entry, duration: "end-of-turn" as const, recallOnExpiry: recall }
        : entry,
    );
    ctx.cards.updateCardMeta?.(targetId as CoreCardId, {
      controlEffects: stamped,
    } as Partial<RiftboundCardMeta> as Record<string, unknown>);
  }
}
