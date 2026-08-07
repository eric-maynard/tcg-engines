/**
 * rule 349 / 820.2 — modal choices belong to the Make Relevant Choices step of
 * PLAYING a card, not to its resolution: the caster locks a mode for every
 * execution before anyone gets priority, and the chain item carries the picks.
 * Leaf module: must not import move defs.
 */
import { playTimeModeOptions } from "../../../abilities/effects/choice";
import type { EffectContext, ExecutableEffect } from "../../../abilities/effect-executor";
import { resolveTarget } from "../../../abilities/target-resolver";

type AnyEffect = Record<string, unknown>;

const isChoiceNode = (node: AnyEffect): boolean =>
  node.type === "choice" && Array.isArray(node.options);

/**
 * Every `choice` node in `effect`, in execution order. A node's own modes are
 * not descended into: a mode's nested choice only exists once that mode is
 * picked.
 */
export function collectChoiceNodes(effect: unknown, out: AnyEffect[] = []): AnyEffect[] {
  if (!effect || typeof effect !== "object") {
    return out;
  }
  if (Array.isArray(effect)) {
    for (const item of effect) {
      collectChoiceNodes(item, out);
    }
    return out;
  }
  const node = effect as AnyEffect;
  if (isChoiceNode(node)) {
    out.push(node);
    return out;
  }
  for (const value of Object.values(node)) {
    collectChoiceNodes(value, out);
  }
  return out;
}

/** The effect of mode `index` on a `choice` node. */
function modeEffect(node: AnyEffect, index: number): ExecutableEffect | undefined {
  const options = node.options as { effect?: ExecutableEffect }[] | undefined;
  return options?.[index]?.effect;
}

/**
 * rule 355.8 — the caster-chosen candidates for a locked-in mode, or [] when
 * the mode names no single board object (players, tokens created, "all …").
 */
function modeTargetOptions(node: AnyEffect, index: number, ctx: EffectContext): string[] {
  const effect = modeEffect(node, index) as { target?: unknown } | undefined;
  const tgt = effect?.target as { type?: string; quantity?: unknown } | undefined;
  if (!tgt || typeof tgt !== "object") {
    return [];
  }
  // rule 355.10 (sfd-039-221 "ready or exhaust a legend") — any single board
  // object the mode names is the caster's choice; fixed referents are not.
  if (
    typeof tgt.type !== "string" ||
    ["self", "trigger-source", "player", "battlefield", "pending-value"].includes(tgt.type)
  ) {
    return [];
  }
  if (tgt.quantity !== undefined && tgt.quantity !== 1) {
    return [];
  }
  return resolveTarget({ ...(tgt as object), quantity: "all" } as Parameters<typeof resolveTarget>[0], {
    ...(ctx as unknown as Parameters<typeof resolveTarget>[1]),
    choosing: true,
  }) as string[];
}

/** Modes already locked in for earlier executions of this same play. */
export function lockedModeIndices(effect: unknown): number[] {
  return collectChoiceNodes(effect)
    .map((n) => n._chosenIndex)
    .filter((i): i is number => typeof i === "number");
}

/**
 * rule 349 / 820.2 — park the next unmade mode choice for a chain item, if any.
 * Only choices that belong to the CASTER are made now; "each other player
 * chooses" modes (rule 355.10.e) are still made as the spell resolves, by that
 * player. Returns true when a prompt was parked.
 */
export function raisePlayTimeModeChoice(
  draft: { pendingChoice?: unknown },
  itemId: string,
  rootEffect: unknown,
  playerId: string,
  sourceCardId: string,
  ctx: EffectContext,
): boolean {
  const nodes = collectChoiceNodes(rootEffect);
  const locked = () =>
    nodes.map((n) => n._chosenIndex).filter((i): i is number => typeof i === "number");
  for (const [nodeIndex, next] of nodes.entries()) {
    if (next._chosenIndex !== undefined) {
      // rule 355.8 / 820.2 — the mode's own target is chosen in the same step,
      // right after the mode, so the caster picks mode/target per execution.
      if (next._chosenTargets === undefined) {
        const options = modeTargetOptions(next, next._chosenIndex as number, ctx);
        if (options.length >= 2) {
          draft.pendingChoice = {
            bindToChainItemId: itemId,
            choiceNodeIndex: nodeIndex,
            effect: modeEffect(next, next._chosenIndex as number),
            options,
            playerId,
            sourceCardId,
            type: "choose-target",
          };
          return true;
        }
      }
      continue;
    }
    // rule 355.10.e — "each other player chooses" stays a resolution-time
    // choice made by that player, not part of playing the card.
    if (next.player !== undefined) {
      return false;
    }
    // rule 355.8 (sfd-049-221) — "choose one you've not chosen this turn": modes
    // recorded on the source this turn are excluded alongside those locked for
    // earlier executions of this same play (turn-stamped record, rule 517.2.b).
    const meta = ctx.cards.getCardMeta?.(sourceCardId as Parameters<typeof ctx.cards.getCardOwner>[0]) as
      | { modesChosenThisTurn?: number[]; modesChosenTurn?: number }
      | undefined;
    const currentTurn = (ctx.draft as { turn?: { number?: number } }).turn?.number ?? 0;
    const chosenThisTurn =
      next.notChosenThisTurn === true && meta?.modesChosenTurn === currentTurn
        ? (meta.modesChosenThisTurn ?? [])
        : [];
    const options = playTimeModeOptions(next as unknown as ExecutableEffect, ctx, [
      ...locked(),
      ...chosenThisTurn,
    ]);
    if (options.length === 0) {
      return false;
    }
    // A forced mode is still a choice made now — lock it and move on, so the
    // last [Repeat] execution does not re-open the menu as it resolves.
    if (options.length === 1) {
      next._chosenIndex = options[0] as number;
      continue;
    }
    draft.pendingChoice = {
      bindToChainItemId: itemId,
      effect: next,
      options,
      playerId,
      sourceCardId,
      type: "choose-mode",
      ...(next.notChosenThisTurn === true ? { notChosenThisTurn: true } : {}),
    };
    return true;
  }
  return false;
}
