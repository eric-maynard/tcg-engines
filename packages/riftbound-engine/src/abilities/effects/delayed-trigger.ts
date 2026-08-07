// Effect handler: "delayed-trigger"
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundCardMeta } from "../../types";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/**
 * rule-id: unl-095-219 (Grim Resolve) — rule 364.3: "When it wins a combat
 * this turn, gain 2 XP." installs a triggered ability ON the chosen unit for
 * the rest of the turn. The trigger is stored on the unit's meta so
 * `getBoardCards` offers it alongside the printed ones; the Ending Step
 * expires turn-scoped entries (rule 517.2.b).
 */
export function handle_delayedTrigger(
  effect: ExecutableEffect,
  ctx: EffectContext,
  _h: EffectHelpers,
): void {
  const dt = effect as unknown as {
    trigger?: { event?: string; on?: string };
    effect?: unknown;
    duration?: string;
  };
  if (!dt.trigger?.event || !dt.effect) {
    return;
  }
  const duration = (dt.duration ?? "turn") as "turn" | "permanent";
  // The effect reaches here as part of a chain item (an immer draft node), so
  // snapshot it into plain data before it is stored on card meta.
  const stored = JSON.parse(JSON.stringify(dt.effect)) as unknown;
  for (const targetId of getTargetIds(effect, ctx)) {
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const existing = meta?.delayedTriggers ?? [];
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        delayedTriggers: [
          ...existing,
          {
            duration,
            effect: stored,
            sourceCardId: ctx.sourceCardId,
            trigger: { event: dt.trigger.event, on: dt.trigger.on ?? "self" },
          },
        ],
      } as unknown as Record<string, unknown>,
    );
  }
}
