// rule 702.2.b / 703 — every Buff on an object is its OWN counter worth +1
// [Might]. The FIRST one is tracked by `meta.buffed` (and the mirrored
// "buffed" counter flag); every additional one by `meta.extraBuffs`. Any code
// that pays a buff must remove exactly ONE counter, so a unit that can hold
// several (Lee Sin, Ascetic) stays buffed while it still has some.
import type { CardId as CoreCardId } from "@tcg/core";

export interface BuffCardsIo {
  getCardMeta?: (cardId: CoreCardId) => { buffed?: boolean; extraBuffs?: number } | undefined;
  updateCardMeta?: (cardId: CoreCardId, patch: Record<string, unknown>) => void;
}

export interface BuffCountersIo {
  getFlag?: (cardId: CoreCardId, flag: string) => boolean | undefined;
  setFlag?: (cardId: CoreCardId, flag: string, value: boolean) => void;
}

/** rule 703 — how many Buff counters the object currently has. */
export function buffCounterCount(
  cards: BuffCardsIo | undefined,
  counters: BuffCountersIo | undefined,
  id: string,
): number {
  const meta = cards?.getCardMeta?.(id as CoreCardId);
  const first =
    meta?.buffed === true || counters?.getFlag?.(id as CoreCardId, "buffed") === true ? 1 : 0;
  return first + (meta?.extraBuffs ?? 0);
}

/** rule 702.2.b — the object has at least one Buff counter to spend. */
export function hasBuffCounter(
  cards: BuffCardsIo | undefined,
  counters: BuffCountersIo | undefined,
  id: string,
): boolean {
  return buffCounterCount(cards, counters, id) > 0;
}

/**
 * rule 702.2.b / 745.1 — spend a SINGLE Buff counter. Extra counters go first
 * so `meta.buffed` (what every Might reader checks) only clears with the last
 * one. Returns false when there was nothing to spend.
 */
export function removeOneBuffCounter(
  cards: BuffCardsIo | undefined,
  counters: BuffCountersIo | undefined,
  id: string,
): boolean {
  const meta = cards?.getCardMeta?.(id as CoreCardId);
  const extra = meta?.extraBuffs ?? 0;
  if (extra > 0) {
    cards?.updateCardMeta?.(id as CoreCardId, { extraBuffs: extra - 1 });
    return true;
  }
  if (meta?.buffed !== true && counters?.getFlag?.(id as CoreCardId, "buffed") !== true) {
    return false;
  }
  counters?.setFlag?.(id as CoreCardId, "buffed", false);
  cards?.updateCardMeta?.(id as CoreCardId, { buffed: false });
  return true;
}
