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
import {
  hasCasterChosenDestination,
  keepLegalArrivals,
  moveDestinationOptions,
  openBattlefieldOptions,
  singleLocationOptions,
} from "../../../abilities/move-destinations";
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
  if (hasCasterChosenDestination(node) && !destinationFeedsFollowUp(node)) {
    out.push(node);
  }
  return out;
}

/**
 * rule-id: ogn-258-298 (ruling 25b00b80ac336276) — Dragon's Rage "Move an enemy
 * unit. Then do this: Choose another enemy unit at its destination." A move
 * whose reflexive follow-up picks from the units AT THE DESTINATION cannot have
 * that destination fixed at play time (rule 355.4): the follow-up's candidates
 * are the units standing there when the spell RESOLVES, so a response that
 * rearranges the board (Flash) must be able to change what the caster can pick.
 * Only the target unit is declared at play; the destination is asked as the
 * move executes.
 */
function dependsOnDestination(effect: unknown): boolean {
  if (Array.isArray(effect)) {
    return effect.some((e) => dependsOnDestination(e));
  }
  if (!effect || typeof effect !== "object") {
    return false;
  }
  const node = effect as AnyEffect;
  // rule 355.10.d (rule-id: ven-148-166 Shadow Dash) — a follow-up that reads
  // EVERY card at the destination ("if you have exactly two units there, THEY
  // each get +1") is a programmatic count, never a choice, so it gives the
  // caster nothing to re-decide: the destination stays a Relevant Choice of
  // playing (355.4). Only a follow-up whose candidates the caster PICKS among
  // (ogn-258-298) needs the destination left open until resolution.
  if (
    (node.location === "same" || node.location === "move-to-or-from") &&
    node.quantity !== "all"
  ) {
    return true;
  }
  return Object.values(node).some((v) => dependsOnDestination(v));
}

function destinationFeedsFollowUp(node: AnyEffect): boolean {
  return node.then !== undefined && dependsOnDestination(node.then);
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

/**
 * rule 135.2.b.5.a — true when the destination carries a condition under which
 * the move is performed ("…if my Might is greater than the total Might of enemy
 * units there", unl-144-219 Maduli). Such a clause is part of the
 * INSTRUCTION's complement, read as the move executes — so an option set it
 * empties at choice time must not be frozen as "no destination".
 */
function destinationConditionIsReadOnExecution(node: AnyEffect): boolean {
  const to = node.to;
  return typeof to === "object" && to !== null && to.requireSourceMightExceedsEnemyTotal === true;
}

function isSingleChoice(target: AnyEffect): boolean {
  const q = target.quantity;
  return q === undefined || q === 1;
}

/** Whether `needle` sits anywhere inside `haystack` (object identity). */
function containsNode(haystack: unknown, needle: AnyEffect): boolean {
  if (haystack === needle) {
    return true;
  }
  if (!haystack || typeof haystack !== "object") {
    return false;
  }
  return Object.values(haystack as Record<string, unknown>).some((v) => containsNode(v, needle));
}

/**
 * rule 820.2.a — a [Repeat]ed spell is stored as a `_repeatExecutions` sequence
 * of identical copies of the SAME instructions, so every copy restates the same
 * target descriptor and the shared slot list collapses to one entry: read
 * positionally, all executions would move the first target. Execution i moves
 * the target it was declared with — `targets[i]` when the caster named one per
 * execution, or the execution's own `boundTargetsOverride` group.
 */
function repeatExecutionMover(item: ChainItemLike, root: unknown, node: AnyEffect): string | undefined {
  const seq = root as AnyEffect | undefined;
  if (!seq || seq.type !== "sequence" || seq._repeatExecutions !== true || !Array.isArray(seq.effects)) {
    return undefined;
  }
  const i = (seq.effects as AnyEffect[]).findIndex((e) => containsNode(e, node));
  if (i < 0) {
    return undefined;
  }
  const exec = (seq.effects as AnyEffect[])[i] as AnyEffect;
  const override = exec?.boundTargetsOverride as readonly string[] | undefined;
  if (Array.isArray(override)) {
    return moverForNode({ ...item, targets: [...override] } as ChainItemLike, exec, node);
  }
  if (seq.independentTargets !== true) {
    return undefined;
  }
  return ((item.targets as readonly string[] | undefined) ?? [])[i];
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
  const repeated = repeatExecutionMover(item, root, node);
  if (repeated !== undefined) {
    return repeated;
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
    // rule 355.4 (rule-id: unl-054-219 Tricksy Tentacles) — "Move any number of
    // enemy units … to a single location": the whole chosen group shares ONE
    // destination, so it is named at finalization like a single mover's.
    // rule 355.4 (rule-id: sfd-079-221 Bard, Mercurial) — "…to an open
    // battlefield" is likewise one destination for the whole group (170.11.c).
    if (node.to === "single-location" || node.to === "open-battlefield") {
      const movers = ((item.targets as readonly string[] | undefined) ?? []).filter((m) =>
        isOnBoard(ctx, m),
      );
      if (movers.length === 0) {
        continue;
      }
      const options =
        node.to === "open-battlefield"
          ? openBattlefieldOptions(ctx)
          : singleLocationOptions(movers, ctx);
      if (options.length === 0) {
        node._dest = null;
        continue;
      }
      if (options.length === 1) {
        node._dest = options[0] as string;
        continue;
      }
      draft.pendingChoice = {
        bindToChainItemId: item.id,
        cardId: movers[0] as string,
        destinationNodeIndex: index,
        options,
        playerId: item.controller as string,
        sourceCardId: item.cardId as string,
        type: "choose-destination",
      };
      return true;
    }
    const mover = moverForNode(item, item.effect, node);
    if (mover === undefined || !isOnBoard(ctx, mover)) {
      continue; // not determinable now — the move asks as it executes
    }
    const worded = moveDestinationOptions(node, mover, ctx);
    if (worded === undefined) {
      continue;
    }
    // rule 447.2.b / 462.3 — a battlefield the mover may not become present at
    // (teammate there, or units of two other players) is never offered.
    const options = keepLegalArrivals(worded, mover, ctx);
    if (options.length === 0) {
      // rule 135.2.b.5.a — when the wording's own "…if X" clause is what
      // emptied the list, nothing is chosen yet and nothing is ruled out: the
      // clause is read as the instruction EXECUTES, so a board change before
      // then can hand the move a destination after all (unl-144-219 Maduli).
      if (!destinationConditionIsReadOnExecution(node)) {
        node._dest = null;
      }
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

/** Every `swap-locations` instruction of `effect`, root or sequence step. */
function collectSwapNodes(effect: unknown, out: AnyEffect[] = []): AnyEffect[] {
  if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
    return out;
  }
  const node = effect as AnyEffect;
  if (node.type === "sequence" && Array.isArray(node.effects)) {
    for (const sub of node.effects) {
      collectSwapNodes(sub, out);
    }
    return out;
  }
  if (node.type === "swap-locations") {
    out.push(node);
  }
  return out;
}

/**
 * rule 355.4 / 355.15 (rule-id: unl-083-219 Smoke and Mirrors) — "move each to
 * the other's location" performs two moves, and their destinations are Relevant
 * Choices of PLAYING the spell: each unit is bound for where its partner stands
 * when the pair is named. Freeze the pair's locations on the instruction
 * (`_swapZones`, positional with `item.targets`) so a partner moved in response
 * cannot drag its counterpart along — "the other's location" is never re-derived
 * at resolution (446.3).
 */
export function lockSwapDestinations(item: ChainItemLike, ctx: EffectContext): void {
  if (item.countered === true || item.effect === undefined) {
    return;
  }
  let nodes = collectSwapNodes(item.effect);
  if (nodes.length === 0 || nodes.every((n) => n._swapZones !== undefined)) {
    return;
  }
  if (!nodes.every((n) => Object.isExtensible(n))) {
    item.effect = JSON.parse(JSON.stringify(item.effect));
    nodes = collectSwapNodes(item.effect);
  }
  const targets = (item.targets as readonly string[] | undefined) ?? [];
  for (const node of nodes) {
    if (node._swapZones !== undefined) {
      continue;
    }
    const zones = targets
      .slice(0, 2)
      .map((id) => ctx.zones.getCardZone(id as CoreCardId) as string | undefined);
    if (zones.length !== 2 || zones.some((z) => z === undefined)) {
      continue; // the pair is not on the board yet — nothing to lock
    }
    node._swapZones = zones;
  }
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
    lockSwapDestinations(item, makeCtx(item));
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
