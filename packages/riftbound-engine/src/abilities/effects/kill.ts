// Effect handler: "kill"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import {
  type LeaveCause,
  type LeaveResult,
  emitLeaveEvents,
  leaveBoard,
  snapshotBatch,
} from "../../operations/leave-board";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import { resolveTarget } from "../target-resolver";
import { type EffectHelpers, getTargetIds } from "./_helpers";

/** rule 359.3.e — the CURRENT controller owns the "one of their units" choice. */
function controllerOf(cardId: string, ctx: EffectContext): string {
  return (
    ctx.cards.getCardController?.(cardId as CoreCardId) ??
    ctx.cards.getCardOwner(cardId as CoreCardId) ??
    ""
  );
}

/** Every candidate `effect.target` names for `playerId` (their own units). */
function candidatesFor(
  effect: ExecutableEffect,
  ctx: EffectContext,
  playerId: string,
): string[] {
  return resolveTarget({ ...(effect.target as object), quantity: "all" } as never, {
    cards: ctx.cards,
    choosing: true,
    draft: ctx.draft,
    playerId,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    zones: ctx.zones,
  } as never);
}

/**
 * rule 422.1.a / 355.16 (ogn-209-298) — "Each player kills one of their units":
 * every player chooses among the units THEY control and kills that one. The
 * caster's pick is locked in when the spell is cast; the remaining players are
 * asked in turn as the effect resolves (a player with no units does nothing,
 * a player with exactly one has no choice to make).
 */
function handleEachPlayerKill(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const pending = (effect as { eachRemaining?: readonly string[] }).eachRemaining;
  let queue: string[];
  if (pending === undefined) {
    const others = Object.keys(ctx.draft.players).filter((p) => p !== ctx.playerId);
    const own = (ctx.boundTargets ?? [])
      .filter((id) => controllerOf(id, ctx) === ctx.playerId)
      .slice(0, 1);
    if (own.length > 0) {
      killUnits(own, ctx, h);
      queue = others;
    } else {
      queue = [ctx.playerId, ...others];
    }
  } else {
    killUnits((ctx.boundTargets ?? []).slice(0, 1), ctx, h);
    queue = [...pending];
  }
  while (queue.length > 0) {
    const pid = queue.shift() as string;
    const options = candidatesFor(effect, ctx, pid);
    if (options.length === 0) {
      continue;
    }
    if (options.length === 1) {
      killUnits(options, { ...ctx, playerId: pid }, h);
      continue;
    }
    if (ctx.draft.pendingChoice) {
      return;
    }
    ctx.draft.pendingChoice = {
      effect: { ...effect, eachRemaining: queue },
      options: options as never,
      playerId: pid as never,
      remaining: 1,
      sourceCardId: ctx.sourceCardId as never,
      type: "choose-target",
    };
    return;
  }
}

/**
 * "Each player kills one of THEIR units/gear" — a per-player instruction whose
 * candidates are read relative to each chooser. A `player: "each"` kill whose
 * target names cards relative to the CASTER instead (ogn-237-298, "a unit you
 * don't control") is not this shape and keeps the plain single-kill path.
 */
function isEachPlayersOwn(effect: ExecutableEffect): boolean {
  const tgt = effect.target as { controller?: string } | string | undefined;
  return (
    effect.player === "each" &&
    typeof tgt === "object" &&
    tgt !== null &&
    tgt.controller === "friendly"
  );
}

/**
 * rule 355.16 (ogn-237-298) — "Starting with the next player, each other player
 * chooses a unit you don't control that hasn't been chosen for this spell. Kill
 * those units.": the caster picks nothing. Each opponent is asked in turn order,
 * always from the units the CASTER doesn't control, minus everything already
 * picked for this spell; the whole set dies at the end.
 */
function handleEachOtherChoosesKill(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const pending = effect as {
    eachRemaining?: readonly string[];
    eachChosen?: readonly string[];
  };
  // The pool is always read relative to the caster, not the current chooser.
  const caster = controllerOf(ctx.sourceCardId, ctx) || ctx.playerId;
  const chosen = [...(pending.eachChosen ?? [])];
  let queue: string[];
  if (pending.eachRemaining === undefined) {
    const order = Object.keys(ctx.draft.players);
    const at = order.indexOf(caster);
    queue = (at < 0 ? order : [...order.slice(at + 1), ...order.slice(0, at)]).filter(
      (p) => p !== caster,
    );
  } else {
    const picked = (ctx.boundTargets ?? [])[0];
    if (picked !== undefined) {
      chosen.push(picked);
    }
    queue = [...pending.eachRemaining];
  }
  while (queue.length > 0) {
    const pid = queue.shift() as string;
    const options = candidatesFor(
      { ...effect, target: (effect as { chooserTarget?: unknown }).chooserTarget } as ExecutableEffect,
      ctx,
      caster,
    ).filter((id) => !chosen.includes(id));
    if (options.length === 0) {
      continue;
    }
    if (options.length === 1) {
      chosen.push(options[0] as string);
      continue;
    }
    if (ctx.draft.pendingChoice) {
      return;
    }
    ctx.draft.pendingChoice = {
      effect: { ...effect, eachChosen: chosen, eachRemaining: queue },
      options: options as never,
      playerId: pid as never,
      remaining: 1,
      sourceCardId: ctx.sourceCardId as never,
      type: "choose-target",
    };
    return;
  }
  killUnits(chosen, { ...ctx, playerId: caster }, h);
}

export function handle_kill(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  if ((effect as { chooser?: string }).chooser === "each-other-player") {
    handleEachOtherChoosesKill(effect, ctx, h);
    return;
  }
  if (isEachPlayersOwn(effect)) {
    handleEachPlayerKill(effect, ctx, h);
    return;
  }
  killUnits(getTargetIds(effect, ctx), ctx, h);
}

/**
 * rule 428.1.a.1 — an Active Kill (kill instruction or kill cost). Every
 * target dies at the same moment (rule 370.1.a.2), so all of them leave the
 * board through `leaveBoard` before the batch's `die` events are published.
 * Exported so cost-kills (`activate-ability.ts`) share the exact path.
 */
export function killUnits(
  targets: readonly string[],
  ctx: EffectContext,
  h: Pick<EffectHelpers, "getEffectiveMight">,
  causeKind: "kill" | "cost" = "kill",
): LeaveResult[] {
  // rule 428.5.b: a Kill instruction is attributed to this spell/ability's controller.
  const killSource: "spell" | "ability" =
    getGlobalCardRegistry().getCardType(ctx.sourceCardId) === "spell" ? "spell" : "ability";
  const cause: LeaveCause = {
    by: ctx.playerId,
    kind: causeKind,
    source: ctx.sourceCardId,
    sourceKind: killSource,
  };
  const results: LeaveResult[] = [];
  // rule 370.1.a.2 / 740.2.a — note every target before the first one moves.
  const snaps = snapshotBatch(ctx, targets);
  ctx.draft.lastKilledUnitMight = undefined;
  for (const targetId of targets) {
    // rule-id: unl-186-219 — "if it had N [Might] or less" reads the unit's
    // Might as it last existed on the board (last-known information).
    ctx.draft.lastKilledUnitMight = snaps.get(targetId)?.might ?? h.getEffectiveMight(targetId, ctx);
    // rule 370.1.a.1 / 369.1 — board `die` replacements (Zhonya's Hourglass)
    // apply inside leaveBoard: the death never happens, no Deathknell.
    results.push(leaveBoard(ctx, targetId, "trash", cause, { lki: snaps.get(targetId) }));
  }
  // rule-id: ogn-246-298 — a kill effect is a death: emit `die` (with the
  // batch's LKI) so Deathknell / "when a friendly unit dies" triggers fire.
  emitLeaveEvents(ctx, results, ctx.fireTriggers);
  return results;
}
