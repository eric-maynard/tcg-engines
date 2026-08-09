// Effect handler: "reveal-rune-branch"
import type { CardId as CoreCardId, PlayerId as CorePlayerId, ZoneId as CoreZoneId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { findAllReplacements, type ReplacementContext } from "../replacement-effects";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import { type EffectHelpers, recordPublicReveal } from "./_helpers";

/**
 * rule 369.1 / 370.1 (sfd-018-221 Void Hatchling) — "If you would reveal cards
 * from A DECK, look at the top card first. You may recycle it. Then reveal
 * those cards." The rune deck is a deck, so a rune reveal is replaced too: its
 * owner peeks at the top rune and may recycle it, and the reveal then happens
 * against whatever rune that left on top. Each Hatchling gets its own look
 * (tracked by `lookedBefore`); the reveal is deferred onto the prompt's `then`.
 */
function offerRuneRevealLook(effect: ExecutableEffect, ctx: EffectContext): boolean {
  const done = ((effect as { lookedBefore?: readonly string[] }).lookedBefore ??
    []) as readonly string[];
  const matches = findAllReplacements(
    { owner: ctx.playerId, playerId: ctx.playerId, type: "reveal" },
    ctx as unknown as ReplacementContext,
  );
  for (const match of matches) {
    if (match.sourceOwner !== ctx.playerId || done.includes(match.sourceCardId)) continue;
    const steps = (match.replacement as { effects?: { type?: string }[] } | undefined)?.effects;
    if (!steps?.some((s) => s?.type === "look")) continue;
    const top = ctx.zones.getCardsInZone("runeDeck" as CoreZoneId, ctx.playerId as CorePlayerId)[0];
    // An empty rune deck gives nothing to look at — that Hatchling does nothing.
    if (top === undefined) return false;
    const carried = {
      ...(effect as object),
      lookedBefore: [...done, match.sourceCardId],
    } as ExecutableEffect;
    ctx.draft.pendingChoice = {
      boundTargets: [top],
      // "You MAY recycle it": yes recycles the peeked rune; the reveal (the
      // `then`) happens either way.
      effect: { ...(carried as object), recycleTopFirst: true },
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
      then: carried,
      type: "confirm",
      // biome-ignore lint/suspicious/noExplicitAny: branded id types
    } as any;
    return true;
  }
  return false;
}

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
  // rule 416.1.b (sfd-018-221) — the accepted "you may recycle it" half of a
  // look that replaced this reveal: the peeked rune goes under the rune deck
  // and the deferred reveal (the prompt's `then`) runs next.
  if ((effect as { recycleTopFirst?: boolean }).recycleTopFirst === true) {
    const peeked = ctx.zones.getCardsInZone("runeDeck" as CoreZoneId, ctx.playerId as CorePlayerId)[0];
    if (peeked !== undefined) {
      ctx.zones.moveCard({
        cardId: peeked,
        position: "bottom",
        targetZoneId: "runeDeck" as CoreZoneId,
      });
    }
    return;
  }
  if (offerRuneRevealLook(effect, ctx)) {
    return;
  }
  const top = ctx.zones.getCardsInZone("runeDeck" as CoreZoneId, ctx.playerId as CorePlayerId)[0];
  if (top === undefined) {
    return;
  }
  const domain = getGlobalCardRegistry().get(top as string)?.domain;
  // rule 424.1 — the rune is REVEALED: its identity is public information, so
  // it is recorded for the log/UI even though the branch is not a choice.
  recordPublicReveal(ctx, ctx.playerId as string, [top as string]);
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
