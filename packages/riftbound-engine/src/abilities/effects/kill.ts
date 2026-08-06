// Effect handler: "kill"
import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import { applyDieReplacement } from "../../cleanup/state-based-checks";
import type { CleanupContext } from "../../cleanup/state-based-checks";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import type { RiftboundCardMeta } from "../../types";
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

export function handle_kill(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  if (isEachPlayersOwn(effect)) {
    handleEachPlayerKill(effect, ctx, h);
    return;
  }
  killUnits(getTargetIds(effect, ctx), ctx, h);
}

function killUnits(targets: readonly string[], ctx: EffectContext, h: EffectHelpers): void {
  // rule 428.5.b: a Kill instruction is attributed to this spell/ability's controller.
  const killSource: "spell" | "ability" =
    getGlobalCardRegistry().getCardType(ctx.sourceCardId) === "spell" ? "spell" : "ability";
  const killed: { cardId: string; owner: string; wasStunned: boolean; wasBuffed: boolean; diedAt?: string }[] = [];
  ctx.draft.lastKilledUnitMight = undefined;
  for (const targetId of targets) {
    const owner = ctx.cards.getCardOwner(targetId as CoreCardId) ?? "";
    const meta = ctx.cards.getCardMeta?.(targetId as CoreCardId) as
      | Partial<RiftboundCardMeta>
      | undefined;
    const wasStunned = meta?.stunned === true;
    // rule 702: "a buffed friendly unit dies" reads the buff as it died.
    const wasBuffed = meta?.buffed === true;
    // rule-id: unl-186-219 — "if it had N [Might] or less" reads the unit's
    // Might as it last existed on the board (last-known information).
    ctx.draft.lastKilledUnitMight = h.getEffectiveMight(targetId, ctx);
    // rule 428.1.a.1.b: last known location feeds "at my battlefield" triggers.
    const diedAt = ctx.zones.getCardZone?.(targetId as CoreCardId) as string | undefined;
    // rule 370.1.a.1 / 369.1 — a board `die` replacement (Zhonya's Hourglass)
    // applies to a kill instruction too: the death never happens, so the unit
    // stays on the board and its Deathknell never resolves (808.1.d.1).
    if (applyDieReplacement(ctx as unknown as CleanupContext, targetId)) {
      continue;
    }
    ctx.zones.moveCard({
      cardId: targetId as CoreCardId,
      targetZoneId: "trash" as CoreZoneId,
    });
    killed.push({ cardId: targetId, diedAt, owner, wasBuffed, wasStunned });
  }
  // rule-id: ogn-246-298 — a kill effect is a death: emit `die` so
  // Deathknell / "when a friendly unit dies" triggers fire.
  if (ctx.fireTriggers) {
    for (const { cardId, diedAt, owner, wasBuffed, wasStunned } of killed) {
      ctx.fireTriggers({ cardId, diedAt, killSource, killedBy: ctx.playerId, owner, type: "die", wasBuffed, wasStunned });
    }
  }
}
