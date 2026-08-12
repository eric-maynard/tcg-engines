/**
 * Object identity (rule 124 / 124.1) — the single boundary at which a card
 * stops being one game object and starts being another.
 *
 * A card that changes zones to or from a non-board zone becomes a NEW game
 * object, and "nothing about the old object is tracked in any capacity"
 * (124.1). Moving between two board spaces is NOT that boundary (446.1): a
 * Move, a Recall, a swap or a control change keeps the same object and all of
 * its memory.
 *
 * The engine stores that memory in several ledgers, all of them keyed by card
 * id — per-turn ability-use tallies, "the first time I … each turn" trigger
 * tallies, consumed once-each-turn replacement allowances, delayed replacements
 * bound to a chosen object, per-object damage-replacement ordering. Keying by
 * card id is what leaks: the id is the CARD's identity (it survives every zone
 * change), not the OBJECT's. This module supplies the missing instance layer:
 *
 *   - {@link getObjectInstanceId} — which incarnation of a card is on the board;
 *   - {@link resetObjectIdentity} — mint the next instance and tear down every
 *     object-scoped ledger for the departing one, in ONE place.
 *
 * What must NOT reset lives elsewhere on purpose and is never touched here:
 * PLAYER-scoped turn records (`…|p:<player>` tallies, "you've chosen an enemy
 * unit this turn", `cardsPlayedThisTurn`) belong to the player, and CARD-scoped
 * (deck-identity) records belong to the card, not to any object it made.
 */

/** The slice of `RiftboundGameState` this module owns. */
export interface ObjectIdentityDraft {
  objectInstances?: Record<string, number>;
  turnEventCounts?: Record<string, number>;
  gameEventCounts?: Record<string, number>;
  consumedNextReplacements?: Record<string, true>;
  activeReplacements?: unknown[];
  damageReplacementOrder?: Record<string, string[]>;
  damageTimeShieldsAsked?: Record<string, string[]>;
}

/**
 * rule 124 — which incarnation of `cardId` is current. Starts at 0 and is
 * bumped by {@link mintObjectInstance} every time the card crosses the
 * board/non-board boundary, so two reads that straddle a zone change differ.
 */
export function getObjectInstanceId(draft: ObjectIdentityDraft, cardId: string): number {
  return draft.objectInstances?.[cardId] ?? 0;
}

/** rule 124 — the card that comes back is a new object: give it a new instance id. */
export function mintObjectInstance(draft: ObjectIdentityDraft, cardId: string): number {
  const next = getObjectInstanceId(draft, cardId) + 1;
  draft.objectInstances = { ...(draft.objectInstances ?? {}), [cardId]: next };
  return next;
}

/**
 * True when `key` is an OBJECT-scoped tally key for `cardId`.
 *
 * Two shapes carry object scope today:
 *   - `<event>|c:<cardId>` (+ optional `|ch:` / `|bf:` / `|e:` suffixes) —
 *     `turnEventCountKeys` / `triggerFireKey` / "the first time I … each turn";
 *   - `activate|<cardId>|<abilityIndex>` — `abilityUseKey`, the "Use only once
 *     each turn" allowance on an activated ability.
 *
 * `<event>|p:<player>` keys are player-scoped and deliberately do not match.
 */
export function isObjectScopedTallyKey(key: string, cardId: string): boolean {
  if (key.startsWith(`activate|${cardId}|`)) {
    return true;
  }
  const marker = `|c:${cardId}`;
  const at = key.indexOf(marker);
  return at >= 0 && (key.length === at + marker.length || key[at + marker.length] === "|");
}

function purgeTallies(counts: Record<string, number> | undefined, cardIds: readonly string[]): void {
  if (!counts) {
    return;
  }
  for (const key of Object.keys(counts)) {
    if (cardIds.some((cardId) => isObjectScopedTallyKey(key, cardId))) {
      delete counts[key];
    }
  }
}

/**
 * rule 124.1 — drop every OBJECT-scoped ledger entry belonging to `cardId`'s
 * departing incarnation. Idempotent, and safe to call for a card that has no
 * entries at all.
 *
 * Player-scoped and card-scoped records are left alone; so are runtime
 * replacements that merely NAME this card as their source (a "this turn your
 * spells cost 1 less" rider outlives the card that granted it) — only ones
 * BOUND to the departing object as their subject are torn down.
 */
export function forgetObjectScopedMemory(
  draft: ObjectIdentityDraft,
  cardIds: readonly string[],
): void {
  if (cardIds.length === 0) {
    return;
  }
  // "the first time I … each turn", "once each turn" trigger fires, and the
  // per-ability "use only once each turn" allowance.
  purgeTallies(draft.turnEventCounts, cardIds);
  purgeTallies(draft.gameEventCounts, cardIds);
  // rule 371.1 — a once-each-turn replacement's spent allowance is bookkeeping
  // on the object that owns the replacement (`<sourceCardId>|<abilityIndex>`).
  const consumed = draft.consumedNextReplacements as Record<string, true> | undefined;
  if (consumed) {
    for (const key of Object.keys(consumed)) {
      if (cardIds.some((cardId) => key.startsWith(`${cardId}|`))) {
        delete consumed[key];
      }
    }
  }
  // rule 390.3 — a delayed replacement ("Kill it the next time it takes damage
  // this turn") is keyed to the object it chose. That object is gone, so the
  // entry can never apply again: a replayed card is a different object and is
  // never re-acquired (359.3.e.4).
  const active = draft.activeReplacements as { targetCardIds?: unknown }[] | undefined;
  if (active && active.length > 0) {
    const kept = active.filter((entry) => {
      const targets = entry?.targetCardIds;
      return !(
        Array.isArray(targets) &&
        targets.some((t) => typeof t === "string" && cardIds.includes(t))
      );
    });
    if (kept.length !== active.length) {
      draft.activeReplacements = kept;
    }
  }
  // rule 372 / 371.2.b — per-object damage bookkeeping for the NEXT damage the
  // old object would have taken.
  for (const cardId of cardIds) {
    if (draft.damageReplacementOrder?.[cardId] !== undefined) {
      delete draft.damageReplacementOrder[cardId];
    }
    if (draft.damageTimeShieldsAsked?.[cardId] !== undefined) {
      delete draft.damageTimeShieldsAsked[cardId];
    }
  }
}

/**
 * rule 124 / 124.1 — the whole boundary in one call: the departing object's
 * ledgers are torn down and the next incarnation of the card gets a fresh
 * instance id. Called from `leave-board.ts resetObjectState`, i.e. exactly once
 * per crossing of the board/non-board boundary.
 */
export function resetObjectIdentity(draft: ObjectIdentityDraft, cardId: string): void {
  forgetObjectScopedMemory(draft, [cardId]);
  mintObjectInstance(draft, cardId);
}
