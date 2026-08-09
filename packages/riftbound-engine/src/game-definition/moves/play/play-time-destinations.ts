/**
 * rule 355.4 — "For Spells and Abilities that Move one or more Units, choose a
 * valid Location as the Move Destination for each Move that will be
 * performed." Destinations are Relevant Choices of PLAYING the card /
 * FINALIZING the ability (349 / 402.2): made by the controller right after the
 * mover is chosen and before anyone receives priority, carried on the chain
 * item — recorded as `_dest` on the move instruction, the way a mode's
 * `_chosenIndex` is (`play-time-modes.ts`) — and re-checked as the move
 * executes (355.4.a / 359.3.e.5: no longer valid ⇒ that move does nothing;
 * `effects/move.ts`).
 *
 * Only a SINGLE caster-chosen (or fixed: "me", the pending value, the
 * triggering unit) mover already on the board qualifies. "Up to N" / "any
 * number" groups, movers chosen by another player or only known as the effect
 * resolves, and cards an effect is about to play keep their resolution-time
 * prompt. A destination inside a "Choose one —" mode is not lifted either (no
 * printed card needs it).
 * Leaf module: must not import move defs.
 */
import type { CardId as CoreCardId } from "@tcg/core";
import type { EffectContext } from "../../../abilities/effect-executor";
import { hasCasterChosenDestination, moveDestinationOptions } from "../../../abilities/move-destinations";
import { collectSequenceTargetSlots, isRestatementOf, type SpellEffectTargetShape } from "./targeting";

// biome-ignore lint/suspicious/noExplicitAny: effect nodes are loosely typed JSON
type AnyEffect = Record<string, any>;
// biome-ignore lint/suspicious/noExplicitAny: chain items are framework-typed
type ChainItemLike = { readonly id: string } & Record<string, any>;

/** `null` = no valid destination existed when the choice was due (the move will do nothing). */
export type BoundDestination = string | null;

function chainItemsOf(draft: unknown): ChainItemLike[] | undefined {
  return (draft as { interaction?: { chain?: { items?: ChainItemLike[] } } }).interaction?.chain?.items;
}

/**
 * Every move instruction of `effect` whose destination its controller chooses,
 * in execution order: the effect itself, or the steps of a (nested) sequence.
 */
export function collectDestinationNodes(effect: unknown, out: AnyEffect[] = []): AnyEffect[] {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    return out;
  }
  const node = effect as AnyEffect;
  if (node.type === "sequence" && Array.isArray(node.effects)) {
    for (const sub of node.effects) {
      collectDestinationNodes(sub, out);
    }
    return out;
  }
  if (hasCasterChosenDestination(node)) {
    out.push(node);
  }
  return out;
}

/**
 * rule-id: ogn-259-298 — a chain item's `effect` is often the card
 * definition's OWN ability object, shared by every activation of that card and
 * frozen once it has been part of a finished state. Writing `_dest` onto it in
 * place throws ("object is not extensible") on a later activation, and would
 * leak one activation's destination into the next, so swap in a private deep
 * copy before the first write. Effects are plain JSON data.
 */
function writableDestinationNodes(item: ChainItemLike): AnyEffect[] {
  const nodes = collectDestinationNodes(item.effect);
  if (nodes.every((n) => Object.isExtensible(n))) {
    return nodes;
  }
  item.effect = JSON.parse(JSON.stringify(item.effect));
  return collectDestinationNodes(item.effect);
}

function isSingleChoice(target: AnyEffect): boolean {
  const q = target.quantity;
  return q === undefined || q === 1;
}

/**
 * The unit `node` will move, when it is already determined: the source itself
 * ("move me"), the triggering unit, the sequence's pending value, or the target
 * bound on the item for the node's descriptor slot. Undefined otherwise.
 */
export function moverForNode(item: ChainItemLike, root: unknown, node: AnyEffect): string | undefined {
  const t = node.target;
  if (t === undefined || t === "self" || t?.type === "self") {
    return item.cardId as string;
  }
  if (typeof t !== "object" || t === null) {
    return undefined;
  }
  if (t.type === "trigger-source") {
    return (item.triggerEvent as { cardId?: string } | undefined)?.cardId;
  }
  const bound = (item.targets as readonly string[] | undefined) ?? [];
  if (t.type === "pending-value") {
    // rule 354.2 (ogn-270-298 Showstopper "buff a unit …, then move IT") — the
    // pending value is what the source step chose: the item's lead target.
    return bound[0];
  }
  if (!isSingleChoice(t)) {
    return undefined;
  }
  if (root === node) {
    return bound[0];
  }
  const slots = collectSequenceTargetSlots(root as SpellEffectTargetShape);
  if (!slots) {
    return bound[0];
  }
  const j = slots.findIndex((s) => s === t || isRestatementOf(s as { type: string }, t as { type: string }));
  return j >= 0 ? bound[j] : undefined;
}

function isOnBoard(ctx: EffectContext, cardId: string): boolean {
  const zone = ctx.zones.getCardZone(cardId as CoreCardId) as string | undefined;
  return zone === "base" || (zone ?? "").startsWith("battlefield-");
}

/**
 * Park the next unmade destination choice of chain item `item`, if any: a sole
 * valid destination is bound without asking (402.2), none at all binds `null`.
 * Returns true when a prompt was parked on `draft.pendingChoice`.
 */
export function raisePlayTimeDestinationChoice(
  draft: { pendingChoice?: unknown },
  item: ChainItemLike,
  ctx: EffectContext,
): boolean {
  if (item.countered === true || item.effect === undefined) {
    return false;
  }
  const nodes = writableDestinationNodes(item);
  for (const [index, node] of nodes.entries()) {
    if (node._dest !== undefined) {
      continue;
    }
    const mover = moverForNode(item, item.effect, node);
    if (mover === undefined || !isOnBoard(ctx, mover)) {
      continue; // not determinable now — the move asks as it executes
    }
    const options = moveDestinationOptions(node, mover, ctx);
    if (options === undefined) {
      continue;
    }
    if (options.length === 0) {
      node._dest = null;
      continue;
    }
    // rule 355.13 — a "you MAY move" instruction keeps its prompt even with a
    // single destination: declining is an answer.
    if (options.length === 1 && node.optional !== true) {
      node._dest = options[0] as string;
      continue;
    }
    draft.pendingChoice = {
      bindToChainItemId: item.id,
      cardId: mover,
      destinationNodeIndex: index,
      ...(node.optional === true ? { optional: true } : {}),
      options,
      playerId: item.controller as string,
      sourceCardId: item.cardId as string,
      type: "choose-destination",
    };
    return true;
  }
  return false;
}

/**
 * The finalization checkpoint (run at the end of every move, before anyone
 * gets priority): raise the first unmade destination choice on any FINALIZED
 * chain item, oldest first. Pending trigger items wait until their "you may" /
 * targets are settled (their turn comes once they are finalized).
 */
export function raiseChainDestinationChoices(
  draft: { pendingChoice?: unknown },
  makeCtx: (item: ChainItemLike) => EffectContext,
): boolean {
  const items = chainItemsOf(draft) ?? [];
  for (const item of items) {
    if (!item || item.status === "pending") {
      continue;
    }
    if (collectDestinationNodes(item.effect).every((n) => n._dest !== undefined)) {
      continue;
    }
    if (raisePlayTimeDestinationChoice(draft, item, makeCtx(item))) {
      return true;
    }
  }
  return false;
}

/**
 * Record the controller's answer to a parked destination choice on the chain
 * item (`declined` for a "you may move" turned down — the move will do nothing).
 */
export function bindDestinationOnItem(
  draft: unknown,
  itemId: string,
  nodeIndex: number | undefined,
  zoneId: string | null,
): void {
  const item = chainItemsOf(draft)?.find((it) => it?.id === itemId);
  if (!item) {
    return;
  }
  const node = writableDestinationNodes(item)[nodeIndex ?? 0];
  if (node) {
    node._dest = zoneId;
  }
}
