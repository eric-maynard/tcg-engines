// Effect handler: "choice"
import { getDeflectSurcharge } from "../../game-definition/moves/play/cost";
import {
  type SpellEffectTargetShape,
  spellEffectHasLegalTargets,
} from "../../game-definition/moves/play/targeting";
import type { EffectContext, ExecutableEffect } from "../effect-executor";
import type { TargetDescriptor } from "../target-resolver";
import { resolveTarget } from "../target-resolver";
import { type EffectHelpers } from "./_helpers";

/**
 * rule 370.1.b / 383.2.c (sfd-059-221 Svellsongur, ruling d04623892609c111) —
 * "choose one that hasn't been chosen this turn" is a restriction of ONE ability.
 * A copied instance of the same ability keeps its own record, keyed by the object
 * conferring the copy (`_modeInstance`, stamped in `trigger-runner.ts`); the
 * printed instance stays on plain `modesChosenThisTurn`.
 */
export interface ChosenModesMeta {
  modesChosenThisTurn?: number[];
  modesChosenThisTurnByInstance?: Record<string, number[]>;
  modesChosenTurn?: number;
}

export function modeInstanceKey(effect: unknown): string | undefined {
  return (effect as { _modeInstance?: string } | undefined)?._modeInstance;
}

export function readChosenModes(
  meta: ChosenModesMeta | undefined,
  instance: string | undefined,
): number[] {
  return instance === undefined
    ? (meta?.modesChosenThisTurn ?? [])
    : (meta?.modesChosenThisTurnByInstance?.[instance] ?? []);
}

export function chosenModesPatch(
  meta: ChosenModesMeta | undefined,
  instance: string | undefined,
  next: number[],
): ChosenModesMeta {
  return instance === undefined
    ? { modesChosenThisTurn: next }
    : {
        modesChosenThisTurnByInstance: {
          ...(meta?.modesChosenThisTurnByInstance ?? {}),
          [instance]: next,
        },
      };
}

/**
 * rule 809.1.c.1 (rule-id: sfd-077-221) — a modal spell declares its target as
 * it RESOLVES, so the [Deflect] surcharge for choosing an opponent's Deflect
 * object is owed here rather than at cast time. Multi-candidate picks are
 * charged by the prompt (`pending-choice.ts chargePromptedDeflectTax`); this
 * covers the sole candidate the handler binds by itself.
 */
function chargeAutoBoundDeflect(picked: ExecutableEffect, ctx: EffectContext): void {
  const tgt = picked.target as TargetDescriptor | string | undefined;
  if (tgt === undefined || typeof tgt === "string" || ctx.boundTargets !== undefined) {
    return;
  }
  const kind = (tgt as { type?: string }).type;
  const quantity = (tgt as { quantity?: unknown }).quantity;
  if (
    (kind !== "unit" && kind !== "gear" && kind !== "unit-or-gear") ||
    quantity === "all" ||
    (typeof quantity === "number" && quantity > 1) ||
    (typeof quantity === "object" && quantity !== null)
  ) {
    return;
  }
  const options = resolveTarget({ ...(tgt as TargetDescriptor), quantity: "all" }, {
    cards: ctx.cards,
    choosing: true,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sameZone: ctx.sameZone,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    triggerSourceId: ctx.triggerSourceId,
    zones: ctx.zones,
  } as Parameters<typeof resolveTarget>[1]);
  if (options.length !== 1) {
    return;
  }
  let owed = getDeflectSurcharge(
    ctx.draft,
    ctx.playerId,
    options,
    ctx.cards as Parameters<typeof getDeflectSurcharge>[3],
  );
  const pool = ctx.draft.runePools?.[ctx.playerId]?.power as
    | Record<string, number>
    | undefined;
  if (owed <= 0 || !pool) {
    return;
  }
  // Deflect is Power of ANY Domain (721.1.c); drain the most-stocked first.
  while (owed > 0) {
    const key = Object.entries(pool)
      .filter(([, v]) => (v ?? 0) > 0)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))[0]?.[0];
    if (key === undefined) {
      return;
    }
    pool[key] = (pool[key] ?? 0) - 1;
    owed--;
  }
}

/**
 * rule 355.3 / 355.8 — a mode whose effect has no legal target may not be
 * chosen. Modes without a card target (player/self/battlefield descriptors,
 * resourceful effects) are always choosable.
 */
function modeHasLegalTarget(option: { effect?: ExecutableEffect }, ctx: EffectContext): boolean {
  const tgt = option.effect?.target as TargetDescriptor | string | undefined;
  if (tgt === undefined || typeof tgt === "string") {
    return true;
  }
  // Only descriptors the resolver can actually enumerate are judged here:
  // everything else (players, cards in private zones, the source itself) is
  // either always legal or lives in a zone the board resolver does not scan.
  // rule 355.9.a.4 (sfd-039-221 Royal Entourage "ready or exhaust a legend") —
  // a Legend Zone IS enumerable, and an EMPTY one leaves the mode with no legal
  // object: judging it here is what keeps the menu from offering a mode nobody
  // could ever answer.
  const kind = (tgt as { type?: string }).type;
  if (kind !== "unit" && kind !== "gear" && kind !== "unit-or-gear" && kind !== "legend") {
    return true;
  }
  if (ctx.boundTargets && ctx.boundTargets.length > 0) {
    return true;
  }
  return (
    resolveTarget({ ...(tgt as TargetDescriptor), quantity: "all" }, {
      cards: ctx.cards,
      choosing: true,
      draft: ctx.draft,
      playerId: ctx.playerId,
      sameZone: ctx.sameZone,
      sourceCardId: ctx.sourceCardId,
      sourceZone: ctx.sourceZone,
      triggerSourceId: ctx.triggerSourceId,
      zones: ctx.zones,
    } as Parameters<typeof resolveTarget>[1]).length > 0
  );
}

/**
 * rule 349 / 820.2 (unl-182-219) — modes are picked during the Make Relevant
 * Choices step of PLAYING the card, so a spell's mode arrives here already
 * locked in as `_chosenIndex`. Run it without re-prompting; a prompt the mode
 * parks (its own target) suspends the rest of a [Repeat] sequence, which is
 * what `fromChosenMode` tells `handle_sequence`.
 */
function runPreChosenMode(
  effect: ExecutableEffect,
  ctx: EffectContext,
  h: EffectHelpers,
  options: { effect: ExecutableEffect }[],
  index: number,
): void {
  if ((effect as { notChosenThisTurn?: boolean }).notChosenThisTurn === true) {
    const sourceId = ctx.sourceCardId as Parameters<typeof ctx.cards.getCardOwner>[0];
    const currentTurn = (ctx.draft as { turn?: { number?: number } }).turn?.number ?? 0;
    const meta = ctx.cards.getCardMeta?.(sourceId) as ChosenModesMeta | undefined;
    const instance = modeInstanceKey(effect);
    // rule 517.2.b — the record is turn-stamped, so a stale one lapses.
    const prior = meta?.modesChosenTurn === currentTurn ? readChosenModes(meta, instance) : [];
    ctx.cards.updateCardMeta?.(sourceId, {
      ...chosenModesPatch(meta, instance, [...prior, index]),
      modesChosenTurn: currentTurn,
    } as never);
  }
  const picked = options[index]?.effect;
  if (!picked) {
    return;
  }
  // rule 355.8 / 820.2 — the target chosen for this mode while the card was
  // played travels with it.
  const chosenTargets = (effect as { _chosenTargets?: string[] })._chosenTargets;
  // rule 359.3.e.5 / 359.3.e.9 — a mode locked in at finalization keeps the
  // object chosen then (355.15): if it is no longer legal as the item resolves
  // the whole instruction does nothing, and no other object is substituted.
  const locked = chosenTargets ?? ctx.boundTargets;
  const lockedTarget = (picked as { target?: unknown }).target;
  if (locked && locked.length > 0 && lockedTarget && typeof lockedTarget === "object") {
    const legal = resolveTarget(
      { ...(lockedTarget as object), quantity: "all" } as Parameters<typeof resolveTarget>[0],
      { ...ctx, choosing: true } as Parameters<typeof resolveTarget>[1],
    ) as string[];
    const survivors = locked.filter((id) => legal.includes(id));
    if (survivors.length === 0) {
      return;
    }
    h.executeEffect(picked, { ...ctx, boundTargets: survivors });
  } else {
    h.executeEffect(picked, chosenTargets ? { ...ctx, boundTargets: chosenTargets } : ctx);
  }
  const parked = ctx.draft.pendingChoice as { then?: unknown } | undefined;
  if (parked && parked.then === undefined) {
    ctx.draft.pendingChoice = { ...(parked as object), fromChosenMode: true } as typeof ctx.draft.pendingChoice;
  }
}

export function handle_choice(effect: ExecutableEffect, ctx: EffectContext, h: EffectHelpers): void {
  const executeEffect = h.executeEffect;
  const { options } = effect as unknown as { options?: { effect: ExecutableEffect }[] };
  if (!options || options.length === 0) {
    return;
  }
  const preChosen = (effect as { _chosenIndex?: number })._chosenIndex;
  if (typeof preChosen === "number") {
    runPreChosenMode(effect, ctx, h, options, preChosen);
    return;
  }
  // rule 355.8 (ogn-157-298): "Choose one you've not chosen this turn" — modes
  // already picked this turn (recorded on the source card's
  // `meta.modesChosenThisTurn`) are no longer legal choices. The record is
  // turn-stamped so it lapses on its own next turn (rule 517.2.b).
  const notChosenThisTurn = (effect as { notChosenThisTurn?: boolean }).notChosenThisTurn === true;
  const sourceId = ctx.sourceCardId as Parameters<typeof ctx.cards.getCardOwner>[0];
  const currentTurn = (ctx.draft as { turn?: { number?: number } }).turn?.number ?? 0;
  const instance = modeInstanceKey(effect);
  let alreadyChosen: number[] = [];
  if (notChosenThisTurn) {
    const meta = ctx.cards.getCardMeta?.(sourceId) as ChosenModesMeta | undefined;
    if (meta?.modesChosenTurn === currentTurn) {
      alreadyChosen = readChosenModes(meta, instance);
    } else if (meta?.modesChosenThisTurn?.length || meta?.modesChosenThisTurnByInstance) {
      ctx.cards.updateCardMeta?.(sourceId, {
        modesChosenThisTurn: [],
        modesChosenThisTurnByInstance: {},
      });
    }
    ctx.cards.updateCardMeta?.(sourceId, { modesChosenTurn: currentTurn });
  }
  let availableIndices = options.map((_, i) => i).filter((i) => !alreadyChosen.includes(i));
  if (availableIndices.length === 0) {
    return;
  }
  // rule 355.3 / 355.8 (sfd-077-221) — drop modes with no legal target.
  const targetable = availableIndices.filter((i) =>
    modeHasLegalTarget(options[i] as { effect?: ExecutableEffect }, ctx),
  );
  // rule 355.8 + 358.3.a (sfd-039-221 Royal Entourage with an EMPTY Legend
  // Zone) — when NO mode has a legal object there is nothing to offer: a modal
  // instruction whose every mode is unchoosable is simply SKIPPED as it
  // resolves. Offering the menu anyway raises a prompt with an empty answer
  // set, which no seat can answer and no `settle()` can drain — the game hangs
  // there. (The harness invariant `noEmptyPrompt` fails any future regression.)
  if (targetable.length === 0) {
    return;
  }
  // rule-id: ven-035-166 — whether an unchoosable mode was dropped here; the
  // survivor's own target is then still declared through the modal prompt.
  const prunedAMode = targetable.length < availableIndices.length;
  availableIndices = targetable;
  // rule-id: sfd-091-221 (rule 355.8) — "draw 1 or buff me": the controller
  // picks which mode resolves. With ≥2 modes and no other prompt in flight,
  // pause via a `choose-mode` pending choice; `resolvePendingChoice` runs the
  // picked option. A single mode (or a nested prompt) resolves inline.
  // rule-id: ven-035-166 — a menu that pruning narrowed to one mode is still
  // offered as a menu: the controller sees WHICH modes are legal, and the
  // survivor's own target is then declared through the normal modal prompt.
  if ((availableIndices.length >= 2 || prunedAMode) && !ctx.draft.pendingChoice) {
    // rule 355.10.e (ogn-071-298): "each other player chooses" — the opponent
    // picks the mode as the spell resolves, but it still resolves for "you".
    // rule-id: ogn-033-298 (rule 355.10.e) — "Deal 6 to it unless its
    // controller has you draw 2": the chosen unit's CONTROLLER decides.
    const targetController = (): string | undefined => {
      const targetId = ctx.boundTargets?.[0] ?? h.getTargetIds(effect, ctx)[0];
      if (!targetId) {
        return undefined;
      }
      const id = targetId as Parameters<typeof ctx.cards.getCardOwner>[0];
      return ctx.cards.getCardController?.(id) ?? ctx.cards.getCardOwner(id);
    };
    const anyOpponent = (): string =>
      Object.keys(ctx.draft.players).find((p) => p !== ctx.playerId) ?? ctx.playerId;
    const chooser =
      effect.player === "opponent"
        ? anyOpponent()
        : (effect.player === "target-controller"
          ? (targetController() ?? anyOpponent())
          : ctx.playerId);
    ctx.draft.pendingChoice = {
      effect,
      options: availableIndices,
      playerId: chooser,
      sourceCardId: ctx.sourceCardId,
      type: "choose-mode",
      ...(notChosenThisTurn ? { notChosenThisTurn: true } : {}),
      ...(chooser !== ctx.playerId ? { controllerId: ctx.playerId } : {}),
      ...(ctx.boundTargets ? { boundTargets: ctx.boundTargets } : {}),
    };
    return;
  }
  const soleIndex = availableIndices[0] as number;
  if (options[soleIndex]?.effect) {
    if (notChosenThisTurn) {
      ctx.cards.updateCardMeta?.(
        sourceId,
        chosenModesPatch(
          ctx.cards.getCardMeta?.(sourceId) as ChosenModesMeta | undefined,
          instance,
          [...alreadyChosen, soleIndex],
        ) as never,
      );
    }
    chargeAutoBoundDeflect(options[soleIndex].effect, ctx);
    executeEffect(options[soleIndex].effect, ctx);
  }
}

/**
 * rule 349 / 820.2 (unl-182-219) — the mode menu as offered during the Make
 * Relevant Choices step of playing a card. Applies the same filters
 * `handle_choice` uses at resolution; `excluded` names the modes already locked
 * in for earlier executions of this same play ("choose one you haven't already
 * chosen").
 */
export function playTimeModeOptions(
  effect: ExecutableEffect,
  ctx: EffectContext,
  excluded: readonly number[],
): number[] {
  const { options } = effect as unknown as { options?: { effect: ExecutableEffect }[] };
  if (!options || options.length === 0) {
    return [];
  }
  const notChosen = (effect as { notChosenThisTurn?: boolean }).notChosenThisTurn === true;
  const indices = options.map((_unused, i) => i).filter((i) => !(notChosen && excluded.includes(i)));
  // rule 355.8 (unl-044-219) — "Counter a spell" with no spell on the chain, a
  // sequence whose mandatory step has nothing to choose …: judged with the same
  // gate that decides whether a spell naming only that instruction could be played.
  const gateCtx = {
    cards: ctx.cards,
    choosing: true,
    draft: ctx.draft,
    playerId: ctx.playerId,
    sameZone: ctx.sameZone,
    sourceCardId: ctx.sourceCardId,
    sourceZone: ctx.sourceZone,
    triggerSourceId: ctx.triggerSourceId,
    zones: ctx.zones,
  } as Parameters<typeof resolveTarget>[1];
  const CHAIN_OR_COMPOUND = ["counter", "gain-control-of-spell", "conditional", "sequence"];
  const targetable = indices.filter(
    (i) =>
      modeHasLegalTarget(options[i] as { effect?: ExecutableEffect }, ctx) &&
      (!CHAIN_OR_COMPOUND.includes(String(options[i]?.effect?.type)) ||
        spellEffectHasLegalTargets(options[i]?.effect as SpellEffectTargetShape | undefined, gateCtx)),
  );
  // rule 355.8 / 358.3.a — the same rule the resolution-time menu follows: a
  // mode with no legal object is NOT offered, and when no mode has one there is
  // nothing to offer at all. The caller reads the empty list as "no mode choice
  // belongs to this play" and the instruction is skipped when it resolves —
  // never a menu whose every entry is unanswerable.
  return targetable.length > 0 ? targetable : [];
}
