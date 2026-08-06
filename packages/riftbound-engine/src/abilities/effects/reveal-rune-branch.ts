// Effect handler: "reveal-rune-branch"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import type { EffectHelpers } from "./_helpers";

/**
 * rule-id: ogn-200-298 — "Reveal the top rune of your rune deck, then recycle
 * it. Do one of the following based on its domain: …". The branch is dictated
 * by the revealed rune's domain, never by the controller; the only choice left
 * is the branch effect's own target.
 *
 * rule 416.1.a — a recycled rune goes to the bottom of its owner's rune deck.
 */
export function handle_revealRuneBranch(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const branches = (effect as { branches?: Record<string, ExecutableEffect> }).branches ?? {};
  const top = ctx.zones.getCardsInZone("runeDeck" as CoreZoneId, ctx.playerId as CorePlayerId)[0];
  if (top === undefined) {
    return;
  }
  const domain = getGlobalCardRegistry().get(top as string)?.domain;
  ctx.zones.moveCard({
    cardId: top,
    position: "bottom",
    targetZoneId: "runeDeck" as CoreZoneId,
  });
  const branch = typeof domain === "string" ? branches[domain] : undefined;
  if (!branch) {
    return;
  }

  // rule 355.10 — a single caster-chosen target inside the branch is the
  // controller's pick; a `sequence` branch carries it on its lead step.
  const lead = (branch.target ??
    (branch.type === "sequence"
      ? ((branch as unknown as { effects?: readonly ExecutableEffect[] }).effects?.[0]?.target)
      : undefined)) as TargetDescriptor | string | undefined;
  if (
    lead !== undefined &&
    typeof lead !== "string" &&
    lead.type !== "self" &&
    lead.type !== "player" &&
    lead.quantity !== "all"
  ) {
    const options = resolveTarget(
      { ...lead, quantity: "all" },
      {
        cards: ctx.cards,
        choosing: true,
        draft: ctx.draft,
        playerId: ctx.playerId,
        sourceCardId: ctx.sourceCardId,
        sourceZone: ctx.sourceZone,
        triggerSourceId: ctx.triggerSourceId,
        zones: ctx.zones,
      },
    );
    if (options.length === 0) {
      return;
    }
    if (options.length >= 2 && !ctx.draft.pendingChoice) {
      ctx.draft.pendingChoice = {
        effect: branch,
        options,
        playerId: ctx.playerId,
        remaining: 1,
        sourceCardId: ctx.sourceCardId,
        type: "choose-target",
      };
      return;
    }
    h.executeEffect(branch, { ...ctx, boundTargets: options.slice(0, 1) });
    return;
  }
  h.executeEffect(branch, ctx);
}
