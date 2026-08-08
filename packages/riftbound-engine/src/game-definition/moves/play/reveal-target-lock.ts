/**
 * Play-time target locking for spells played from [Hidden] that name MORE than
 * one caster-chosen target ("Stun a friendly unit and an enemy unit at the same
 * battlefield" — ogn-220-298).
 *
 * rule 355.5 / 811.1.b — a card played from facedown follows the normal play
 * process, so every one of its targets is chosen as it is PLAYED, before anyone
 * receives Priority. `playSpell` does this by enumerating one Play per legal
 * pair; the reveal move has no `targets` parameter, so the slots are asked for
 * one prompt at a time here and locked onto the chain item as `targets`
 * [slot0, slot1, …] — the shape the sequence handler routes per step.
 * rule 811.1.d.2 — candidates are restricted to the facedown battlefield.
 *
 * Answers come back through the generic play-time branch in `pending-choice.ts`,
 * which writes only the LAST pick onto the item and then calls
 * `lockTriggerTargets`; `continueRevealSlotLock` runs from there, re-merges the
 * accumulated picks and asks for the next slot.
 */

import type { CardId as CoreCardId, ZoneId as CoreZoneId } from "@tcg/core";
import type { RiftboundGameState } from "../../../types";
import { resolveTarget } from "../../../abilities/target-resolver";
import { getBattlefieldZoneId } from "../../../zones/zone-configs";

/** Minimal move-context surface these helpers need. */
export interface RevealLockContext {
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  readonly cards: any;
  // biome-ignore lint/suspicious/noExplicitAny: engine move context is framework-typed
  readonly zones: any;
}

/** In-flight multi-slot lock for one chain item, keyed by that item's id. */
export interface RevealSlotLock {
  playerId: string;
  cardId: string;
  battlefieldId: string;
  slots: readonly unknown[];
  picked: string[];
}

type WithLocks = RiftboundGameState & {
  revealSlotLocks?: Record<string, RevealSlotLock>;
};

/** A descriptor the caster picks exactly one card for. */
export function isSinglePickSlot(slot: unknown): boolean {
  const d = slot as { type?: string; quantity?: unknown } | null;
  if (!d || typeof d !== "object" || typeof d.type !== "string") {
    return false;
  }
  return (
    d.type !== "player" &&
    d.type !== "battlefield" &&
    d.type !== "self" &&
    (d.quantity === undefined || d.quantity === 1)
  );
}

// biome-ignore lint/suspicious/noExplicitAny: chain items are framework-typed
type ChainItem = { readonly id: string } & Record<string, any>;

function chainItems(draft: RiftboundGameState): ChainItem[] | undefined {
  return draft.interaction?.chain?.items as ChainItem[] | undefined;
}

function slotOptions(
  draft: RiftboundGameState,
  ctx: RevealLockContext,
  lock: RevealSlotLock,
  slot: unknown,
): string[] {
  const bfZone = getBattlefieldZoneId(lock.battlefieldId);
  const ids = resolveTarget({ ...(slot as object), quantity: "all" } as never, {
    cards: ctx.cards,
    choosing: true,
    draft,
    playerId: lock.playerId,
    // rule 811.1.d.2 — "the same battlefield" for a revealed card is the
    // battlefield it was hidden at.
    sameZone: bfZone,
    sourceCardId: lock.cardId,
    sourceZone: bfZone,
    zones: ctx.zones,
  } as Parameters<typeof resolveTarget>[1]) as string[];
  return ids.filter(
    (id) =>
      ctx.zones.getCardZone(id as CoreCardId) === (bfZone as CoreZoneId) && !lock.picked.includes(id),
  );
}

/**
 * Settle the remaining slots of `lock`. Prompts as soon as a slot has two or
 * more legal candidates; a slot with exactly one candidate is bound without
 * asking, and a slot with none stops the walk (rule 355.8 already gated the
 * play, so the item simply does nothing for that step). Returns true while the
 * lock is still open.
 */
function advance(
  draft: RiftboundGameState,
  itemId: string,
  lock: RevealSlotLock,
  ctx: RevealLockContext,
): boolean {
  for (let i = lock.picked.length; i < lock.slots.length; i++) {
    const options = slotOptions(draft, ctx, lock, lock.slots[i]);
    if (options.length >= 2) {
      writeLockedTargets(draft, itemId, lock);
      draft.pendingChoice = {
        bindToChainItemId: itemId,
        effect: chainItems(draft)?.find((it) => it.id === itemId)?.effect as never,
        options: options as never,
        playerId: lock.playerId as never,
        remaining: 1,
        sourceCardId: lock.cardId as never,
        type: "choose-target",
      };
      return true;
    }
    if (options.length === 1) {
      lock.picked.push(options[0] as string);
      continue;
    }
    break;
  }
  writeLockedTargets(draft, itemId, lock);
  return false;
}

/** Write the picks locked so far onto the still-pending chain item. */
function writeLockedTargets(
  draft: RiftboundGameState,
  itemId: string,
  lock: RevealSlotLock,
): void {
  if (lock.picked.length === 0) {
    return;
  }
  const items = chainItems(draft);
  const idx = items?.findIndex((it) => it.id === itemId) ?? -1;
  if (!items || idx < 0 || items[idx]?.cardId !== lock.cardId) {
    return;
  }
  items[idx] = { ...items[idx], targets: [...lock.picked] } as ChainItem;
}

/**
 * Start the multi-slot lock for a spell just played from [Hidden] (called from
 * the `revealHidden` reducer).
 */
export function beginRevealSlotLock(
  draft: RiftboundGameState,
  args: {
    playerId: string;
    cardId: string;
    itemId: string;
    battlefieldId: string;
    slots: readonly unknown[];
  },
  ctx: RevealLockContext,
): void {
  const lock: RevealSlotLock = { ...args, picked: [] };
  if (advance(draft, args.itemId, lock, ctx)) {
    const d = draft as WithLocks;
    d.revealSlotLocks = { ...(d.revealSlotLocks ?? {}), [args.itemId]: lock };
  }
}

/**
 * rule-id: sfd-145-221 (rule 355.5 / 811.1.d.2) — a `swap-might` /
 * `swap-locations` played from [Hidden] names its two objects at once ("swap
 * the Might of TWO units at the same battlefield"), so it is ONE choice of a
 * pair, not two ordered slots: the caster answers with both cards in a single
 * pick. A board where exactly one legal pair exists is bound without asking
 * (rule 402.2).
 */
export function beginRevealPairLock(
  draft: RiftboundGameState,
  args: {
    playerId: string;
    cardId: string;
    itemId: string;
    battlefieldId: string;
    slots: readonly unknown[];
  },
  ctx: RevealLockContext,
): void {
  const lock: RevealSlotLock = { ...args, picked: [] };
  const pools = args.slots.map((slot) => slotOptions(draft, ctx, lock, slot));
  const pairs: [string, string][] = [];
  for (const a of pools[0] ?? []) {
    for (const b of pools[1] ?? []) {
      if (a !== b && !pairs.some(([x, y]) => x === b && y === a)) {
        pairs.push([a, b]);
      }
    }
  }
  if (pairs.length === 0) {
    return;
  }
  // rule 402.2 — a forced pair is not a decision; bind it and move on.
  if (pairs.length === 1) {
    lock.picked = [...(pairs[0] as [string, string])];
    writeLockedTargets(draft, args.itemId, lock);
    return;
  }
  // Several legal pairs: ask for the two objects one prompt at a time, exactly
  // like a two-slot sequence (rule 355.5).
  beginRevealSlotLock(draft, args, ctx);
}

/**
 * Continue an open lock after `pending-choice.ts` answered one slot: the answer
 * branch overwrote the item's `targets` with that single pick, so merge it back
 * into the accumulated list and ask for the next slot.
 */
export function continueRevealSlotLock(draft: RiftboundGameState, ctx: RevealLockContext): void {
  const d = draft as WithLocks;
  const locks = d.revealSlotLocks;
  if (!locks) {
    return;
  }
  for (const [itemId, lock] of Object.entries(locks)) {
    const item = chainItems(draft)?.find((it) => it.id === itemId);
    if (!item) {
      delete locks[itemId];
      continue;
    }
    for (const id of (item.targets ?? []) as string[]) {
      if (!lock.picked.includes(id)) {
        lock.picked.push(id);
      }
    }
    if (!advance(draft, itemId, lock, ctx)) {
      delete locks[itemId];
      continue;
    }
    return;
  }
  if (Object.keys(locks).length === 0) {
    d.revealSlotLocks = undefined;
  }
}
