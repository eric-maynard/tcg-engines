// Effect handler: "empower", "disempower"
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { recalculateStaticEffects, type StaticAbilityContext } from "../static-abilities";
import { type EffectHelpers, getTargetIds } from "./_helpers";

export function handle_empower(effect: ExecutableEffect, ctx: EffectContext, _h: EffectHelpers): void {
  const targets = getTargetIds(effect, ctx);
  const empowerTargets = targets.length === 0 ? [ctx.sourceCardId] : targets;
  let changed = false;
  for (const targetId of empowerTargets) {
    // rule 124.1 / 441.2 — Empowered is a board state on a permanent. A unit
    // that left the board before this resolved is a new object in its new
    // zone, so the status must not be written onto the card there.
    const zone = ctx.zones.getCardZone?.(targetId as CoreCardId) as string | undefined;
    if (zone !== undefined && zone !== "base" && !zone.startsWith("battlefield-")) {
      continue;
    }
    const wasEmpowered =
      (ctx.cards.getCardMeta(targetId as CoreCardId) as { empowered?: boolean } | undefined)
        ?.empowered ?? false;
    // rule 517.2.b: "Disempower it at end of turn" rides along as a duration —
    // the flag is read by the Ending Step cleanup.
    const turnDuration = (effect as { duration?: string }).duration === "turn";
    const untilEndOfTurn = effect.type === "empower" && turnDuration;
    // rule 517.2.b (rule-id: ven-035-166) — the mirror wording "Empower it at
    // end of turn" on a Disempower: the status comes BACK in the Ending Step.
    const reEmpowerAtEndOfTurn = effect.type === "disempower" && turnDuration;
    ctx.cards.updateCardMeta?.(
      targetId as CoreCardId,
      {
        empowered: effect.type === "empower",
        ...(untilEndOfTurn ? { empoweredUntilEndOfTurn: true } : {}),
        ...(effect.type === "disempower"
          ? { disempoweredUntilEndOfTurn: reEmpowerAtEndOfTurn, empoweredUntilEndOfTurn: false }
          : {}),
      } as unknown as Record<string, unknown>,
    );
    if (wasEmpowered !== (effect.type === "empower")) {
      changed = true;
    }
    // Rule 827.1.c: "When I become [Empowered]" fires on the false→true edge.
    if (effect.type === "empower" && !wasEmpowered) {
      ctx.fireTriggers?.({
        cardId: targetId,
        owner: ctx.cards.getCardOwner(targetId as CoreCardId) ?? ctx.playerId,
        type: "empower",
      });
    }
  }
  // rule 828.1.c — [Empowered] passives are dependent on the status, so they
  // must come and go with it immediately: a later step of the SAME effect
  // ("…then kill it if it has 3 Might or less") has to see the new Might.
  if (changed) {
    recalculateStaticEffects({
      cards: ctx.cards,
      draft: ctx.draft,
      zones: ctx.zones,
    } as unknown as StaticAbilityContext);
  }
}
