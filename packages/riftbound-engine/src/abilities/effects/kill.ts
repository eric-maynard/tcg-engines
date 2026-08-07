// Effect handler: "kill"
import type { CardId as CoreCardId } from "@tcg/core";
import { getGlobalCardRegistry } from "../../operations/card-lookup";
import { runDieBatch } from "../die-replacement-batch";
import {
  type LKISnapshot,
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

/**
 * rule 422.1.a (unl-174-219) — "each opponent must kill one of THEIR units":
 * the instruction belongs to each opponent of the source's controller, so each
 * of them chooses among the units THEY control. The descriptor is written
 * relative to the source ("enemy" units) and is re-read as "friendly" from
 * each chooser's seat.
 */
function isEachOpponentsOwn(effect: ExecutableEffect): boolean {
  const tgt = effect.target as { controller?: string } | string | undefined;
  return (
    effect.player === "each" &&
    typeof tgt === "object" &&
    tgt !== null &&
    tgt.controller === "enemy"
  );
}

function handleEachOpponentKill(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const source = controllerOf(ctx.sourceCardId, ctx) || ctx.playerId;
  const ownUnits = { ...(effect.target as object), controller: "friendly" };
  const pending = effect as { eachRemaining?: readonly string[]; eachChooser?: string };
  let queue: string[];
  if (pending.eachRemaining === undefined) {
    queue = Object.keys(ctx.draft.players).filter((p) => p !== source);
  } else {
    const chooser = pending.eachChooser ?? ctx.playerId;
    killUnits((ctx.boundTargets ?? []).slice(0, 1), { ...ctx, playerId: chooser }, h);
    queue = [...pending.eachRemaining];
  }
  while (queue.length > 0) {
    const pid = queue.shift() as string;
    const options = candidatesFor({ ...effect, target: ownUnits } as ExecutableEffect, ctx, pid);
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
      effect: { ...effect, eachChooser: pid, eachRemaining: queue },
      options: options as never,
      // rule 422.1.a — the OPPONENT is asked, not the source's controller.
      playerId: pid as never,
      remaining: 1,
      sourceCardId: ctx.sourceCardId as never,
      type: "choose-target",
    };
    return;
  }
}

/**
 * rule-id: ven-154-166 (rule 355.8 / 359.3.e) — "Choose a friendly unit. Kill
 * an enemy unit with less Might than it": the two play-time choices arrive as
 * boundTargets [reference, victim]. The reference is only MEASURED (never
 * killed), and the "less Might" requirement is re-checked here: a victim
 * pumped in response to match or exceed the reference — or a reference that
 * left the board — means no kill, though the spell still resolves.
 */
function handleReferenceKill(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const [refId, victimId] = ctx.boundTargets ?? [];
  if (refId === undefined || victimId === undefined) {
    return;
  }
  const refDesc = (effect as { reference?: object }).reference as object;
  const resolverCtx = {
    cards: ctx.cards,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    zones: ctx.zones,
  };
  const refs = resolveTarget({ ...refDesc, quantity: "all" } as never, resolverCtx as never);
  if (!refs.includes(refId)) {
    return;
  }
  const victims = resolveTarget({ ...(effect.target as object), quantity: "all" } as never, {
    ...resolverCtx,
    referenceMight: h.getEffectiveMight(refId, ctx),
  } as never);
  if (!victims.includes(victimId)) {
    return;
  }
  killUnits([victimId], ctx, h);
}

/**
 * rule 108.2 / 370.1.a.2 (rule-id: ven-090-166) — "Each player chooses a unit
 * they control. Kill the rest.": every player, starting with the source's
 * controller, names one KEEPER among the units THEY CONTROL (control, not
 * ownership — 108.2). A player with no units chooses nothing; one with exactly
 * one unit keeps it without a prompt; otherwise the choice is mandatory. Once
 * every choice is in, every other unit on the board dies as one batch, so
 * units created by those deaths (Deathknell tokens) are never part of "the rest".
 */
function handleEachPlayerKeepsOne(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): void {
  const pending = effect as {
    eachKept?: readonly string[];
    eachRemaining?: readonly string[];
  };
  const caster = controllerOf(ctx.sourceCardId, ctx) || ctx.playerId;
  const kept = [...(pending.eachKept ?? [])];
  let queue: string[];
  if (pending.eachRemaining === undefined) {
    const order = Object.keys(ctx.draft.players);
    const at = order.indexOf(caster);
    queue = at < 0 ? [...order] : [...order.slice(at), ...order.slice(0, at)];
  } else {
    const picked = (ctx.boundTargets ?? [])[0];
    if (picked !== undefined) {
      kept.push(picked);
    }
    queue = [...pending.eachRemaining];
  }
  while (queue.length > 0) {
    const pid = queue.shift() as string;
    const options = candidatesFor(effect, ctx, pid);
    if (options.length === 0) {
      continue;
    }
    if (options.length === 1) {
      kept.push(options[0] as string);
      continue;
    }
    if (ctx.draft.pendingChoice) {
      return;
    }
    ctx.draft.pendingChoice = {
      effect: { ...effect, eachKept: kept, eachRemaining: queue },
      options: options as never,
      playerId: pid as never,
      remaining: 1,
      sourceCardId: ctx.sourceCardId as never,
      type: "choose-target",
    };
    return;
  }
  const victims = Object.keys(ctx.draft.players)
    .flatMap((pid) => candidatesFor(effect, ctx, pid))
    .filter((id) => !kept.includes(id));
  killUnits(victims, { ...ctx, playerId: caster }, h);
}

export function handle_kill(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  if ((effect as { keep?: unknown }).keep === "one") {
    handleEachPlayerKeepsOne(effect, ctx, h);
    return;
  }
  if ((effect as { chooser?: string }).chooser === "each-other-player") {
    handleEachOtherChoosesKill(effect, ctx, h);
    return;
  }
  if (isEachPlayersOwn(effect)) {
    handleEachPlayerKill(effect, ctx, h);
    return;
  }
  if (isEachOpponentsOwn(effect)) {
    handleEachOpponentKill(effect, ctx, h);
    return;
  }
  if (typeof (effect as { reference?: unknown }).reference === "object") {
    handleReferenceKill(effect, ctx, h);
    return;
  }
  if (raiseGroupSubsetRepick(effect, ctx, h)) {
    return;
  }
  killUnits(getTargetIds(effect, ctx), ctx, h);
}

/**
 * rule 355.11.b (rule-id: ogn-256-298 Fox-Fire) — a group chosen under an
 * aggregate requirement ("units … with total Might 4 or less") that no longer
 * meets it as the effect resolves: its controller picks a SUBSET of the
 * ORIGINAL targets that does (never a unit that was not chosen), and only that
 * subset is affected. Raises a `pick-many {semantics:"subset"}` prompt whose
 * answer re-enters this handler with the subset bound. Returns true when the
 * prompt was parked.
 */
function raiseGroupSubsetRepick(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
): boolean {
  const cap = (effect.target as { totalMight?: { lte?: number; lt?: number } } | undefined)?.totalMight;
  const limit = cap?.lte ?? (cap?.lt !== undefined ? cap.lt - 1 : undefined);
  const bound = ctx.boundTargets;
  if (limit === undefined || !bound || bound.length === 0 || ctx.draft.pendingChoice) {
    return false;
  }
  if ((effect as { _subsetChecked?: boolean })._subsetChecked === true) {
    return false;
  }
  const mightOf = (id: string): number => h.getEffectiveMight(id, ctx);
  const total = bound.reduce((sum, id) => sum + mightOf(id), 0);
  if (total <= limit) {
    return false;
  }
  ctx.draft.pendingChoice = {
    constraint: { totalMightAtMost: limit },
    max: bound.length,
    min: 0,
    // A unit that alone breaks the cap can be in no legal subset.
    options: bound.filter((id) => mightOf(id) <= limit).map((id) => ({ cardId: id, key: id })),
    playerId: ctx.playerId,
    prompt: `Choose original targets with total Might ${limit} or less to affect`,
    resume: {
      effect: { ...effect, _subsetChecked: true },
      kind: "subset-repick",
      playerId: ctx.playerId,
      sourceCardId: ctx.sourceCardId,
    },
    semantics: "subset",
    sourceCardId: ctx.sourceCardId,
    type: "pick-many",
  };
  return true;
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
  // rules 370–373 — die replacements for the whole simultaneous batch (one
  // Zhonya's Hourglass saves ONE of several units killed together; several
  // shields on one unit are ordered by its controller). A replaced death never
  // happens (370.1.a.1 / 369.1) — no Deathknell. If a question had to be asked
  // the batch finishes on the answer (`continueKillBatch`).
  const onBoard = targets.filter((id) => {
    const zone = snaps.get(id)?.zone;
    return zone === "base" || (typeof zone === "string" && zone.startsWith("battlefield-"));
  });
  const plan =
    onBoard.length > 0
      ? runDieBatch(ctx, onBoard, {
          canPrompt: true,
          kill: { cause, playerId: ctx.playerId, sourceCardId: ctx.sourceCardId, to: "trash" },
        })
      : { dying: [] as string[], replaced: [] as string[], suspended: false };
  // rule 359.3.e.14.b (sfd-163-221) — cleared AFTER the batch: a replacement's
  // own kill ("kill this instead" — Zhonya's Hourglass) is a different action
  // and must not be what a linked "If you do" sees.
  ctx.draft.lastKilledUnitMight = undefined;
  ctx.draft.lastKilledUnitId = undefined;
  ctx.draft.lastKilledUnitController = undefined;
  if (plan.suspended) {
    return results;
  }
  for (const targetId of targets) {
    // rule-id: unl-186-219 — "if it had N [Might] or less" reads the unit's
    // Might as it last existed on the board (last-known information).
    const killedMight = snaps.get(targetId)?.might ?? h.getEffectiveMight(targetId, ctx);
    if (plan.replaced.includes(targetId) || (onBoard.includes(targetId) && !plan.dying.includes(targetId))) {
      results.push({ cardId: targetId, cause, left: false, lki: snaps.get(targetId) as LKISnapshot, replacedBy: "replacement" });
      continue;
    }
    const result = leaveBoard(ctx, targetId, "trash", cause, {
      lki: snaps.get(targetId),
      replacements: "skip",
    });
    // rule 359.3.e.14.b (sfd-163-221) — a REPLACED (or impossible) death is not
    // a kill: a linked "If you do" must see no killed unit and no killed Might.
    if (result.left) {
      ctx.draft.lastKilledUnitMight = killedMight;
      // rule 359.3.f (sfd-162-221) — last-known control for a linked
      // "if it was a friendly/enemy unit" clause.
      ctx.draft.lastKilledUnitId = targetId;
      ctx.draft.lastKilledUnitController = snaps.get(targetId)?.controller;
    }
    results.push(result);
  }
  // rule-id: ogn-246-298 — a kill effect is a death: emit `die` (with the
  // batch's LKI) so Deathknell / "when a friendly unit dies" triggers fire.
  emitLeaveEvents(ctx, results, ctx.fireTriggers);
  return results;
}
