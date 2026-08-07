/**
 * rule 355.5 / 808.1.d.2 — a triggered ability chooses its Game Objects as the
 * Pending Item is FINALIZED (i.e. when it goes on the Chain), not when it
 * resolves. Two copies of the same trigger (Karthus doubling a [Deathknell])
 * are therefore independent items, each with its own chosen target, and each
 * separately counterable.
 *
 * Only genuinely caster-chosen single targets with more than one legal option
 * are locked here: with a single candidate (or none) nothing is chosen early,
 * so resolution keeps its existing behaviour.
 */
import type { CardId as CoreCardId } from "@tcg/core";
import type { RiftboundGameState } from "../types";
import type { TargetDescriptor } from "./target-resolver";
import { resolveTarget } from "./target-resolver";
import { continueRevealSlotLock } from "../game-definition/moves/play/reveal-target-lock";

interface LockContext {
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  readonly cards: any;
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  readonly zones: any;
}

/**
 * The single target a triggered ability's controller chooses ("deal 4 to an
 * enemy unit"). `undefined` for fixed referents (self, "it", a player, a
 * battlefield), for mass effects (`quantity: "all"`), for the multi-pick
 * shapes ("any number of", "up to N", split damage) and for effects that
 * gather their own candidates from a private zone.
 */
export function casterChosenTarget(effect: unknown): TargetDescriptor | undefined {
  if (typeof effect !== "object" || effect === null) {
    return undefined;
  }
  const e = effect as { type?: string; target?: unknown; split?: boolean; from?: unknown };
  if (e.type === "play" || (e.type === "damage" && e.split === true)) {
    return undefined;
  }
  const target = e.target;
  if (typeof target !== "object" || target === null) {
    return undefined;
  }
  const t = target as { type?: unknown; quantity?: unknown };
  if (typeof t.type !== "string") {
    return undefined;
  }
  if (
    t.type === "self" ||
    t.type === "trigger-source" ||
    t.type === "player" ||
    t.type === "battlefield"
  ) {
    return undefined;
  }
  if (t.quantity !== undefined && t.quantity !== 1) {
    return undefined;
  }
  return target as TargetDescriptor;
}

/**
 * rule 402.4 — a triggered ability that names SEVERAL Game Objects is removed
 * from the Chain unless a legal choice exists for every slot: "return another
 * friendly unit and an enemy unit" (sfd-132-221 Beast Below) does nothing at
 * all when either half has no candidate, rather than resolving the half that
 * does. Single-slot triggers are left alone — finding nothing at resolution
 * already fizzles, which is observationally the same.
 */
export function triggerTargetsSatisfiable(
  effect: unknown,
  draft: RiftboundGameState,
  ctx: LockContext,
  cardId: string,
  controller: string,
): boolean {
  const e = effect as { type?: string; effects?: readonly unknown[] } | null;
  if (typeof e !== "object" || e === null || e.type !== "sequence" || !Array.isArray(e.effects)) {
    return true;
  }
  const slots: TargetDescriptor[] = [];
  for (const sub of e.effects) {
    const t = casterChosenTarget(sub);
    if (t) {
      slots.push(t);
    }
  }
  if (slots.length < 2) {
    return true;
  }
  const sourceZone = ctx.zones.getCardZone?.(cardId as CoreCardId);
  return slots.every(
    (target) =>
      resolveTarget({ ...target, quantity: "all" }, {
        cards: ctx.cards,
        choosing: true,
        draft,
        playerId: controller,
        sourceCardId: cardId,
        sourceZone,
        zones: ctx.zones,
      } as Parameters<typeof resolveTarget>[1]).length > 0,
  );
}

/**
 * Prompt the controller of the first pending triggered item that still needs a
 * target (rule 355.5). Answering re-enters here from `pending-choice.ts`, so
 * several simultaneous triggers are targeted one after another, in chain order
 * (rule 337.1.b), before anyone receives priority.
 */
export function lockTriggerTargets(draft: RiftboundGameState, ctx: LockContext): void {
  if (draft.pendingChoice) {
    return;
  }
  // rule-id: ogn-220-298 (rule 355.5 / 811.1.b) — a card played from [Hidden]
  // naming several caster-chosen targets asks one prompt per slot; the answer
  // to the previous slot lands here, so continue that lock before any trigger.
  continueRevealSlotLock(draft, ctx);
  if (draft.pendingChoice) {
    return;
  }
  const items = draft.interaction?.chain?.items as
    | ({ readonly id: string } & Record<string, unknown>)[]
    | undefined;
  if (!items) {
    return;
  }
  const choosesOwnTarget = (item: Record<string, unknown> | undefined): boolean =>
    item !== undefined &&
    item.triggered === true &&
    item.type === "ability" &&
    item.countered !== true &&
    // rule 583: a "you may" trigger opts in at resolution; it chooses there too.
    item.optional !== true &&
    casterChosenTarget(item.effect) !== undefined;
  // rule 808.1.d.2 / rule 355.5 — a dies-trigger is finalized while the board
  // still holds the units it may choose, so its Game Object is chosen there
  // (and two copies of a doubled [Deathknell] choose independently). Other
  // event kinds keep the engine's resolution-time convention.
  const locksAtFinalization = (item: Record<string, unknown> | undefined): boolean =>
    (item?.triggerEvent as { type?: string } | undefined)?.type === "die";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!choosesOwnTarget(item) || item?.targets !== undefined || !locksAtFinalization(item)) {
      continue;
    }
    const target = casterChosenTarget(item?.effect);
    if (!target || !item) {
      continue;
    }
    const cardId = item.cardId as string;
    const controller = item.controller as string;
    // rule 428.1.a.1.b — a dies-trigger sees the board as it was: "here" means
    // where the unit died, not the trash it now sits in.
    const trigEvt = item.triggerEvent as { cardId?: string; diedAt?: string } | undefined;
    const sourceZone =
      typeof trigEvt?.diedAt === "string" && trigEvt.cardId === cardId
        ? trigEvt.diedAt
        : ctx.zones.getCardZone?.(cardId as CoreCardId);
    const options = resolveTarget({ ...target, quantity: "all" }, {
      cards: ctx.cards,
      choosing: true,
      draft,
      playerId: controller,
      sourceCardId: cardId,
      sourceZone,
      zones: ctx.zones,
    } as Parameters<typeof resolveTarget>[1]);
    if (options.length < 2) {
      continue;
    }
    draft.pendingChoice = {
      bindToChainItemId: item.id,
      effect: item.effect as never,
      options: options as never,
      playerId: controller as never,
      remaining: 1,
      sourceCardId: cardId as never,
      type: "choose-target",
    };
    return;
  }
}
