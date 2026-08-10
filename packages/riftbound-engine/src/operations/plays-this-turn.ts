/**
 * Per-turn ledger of WHICH cards each player played this turn.
 *
 * `state.cardsPlayedThisTurn` only counts plays (rule 724 Legion). Cost
 * modifiers phrased "the first friendly non-token gear played each turn"
 * (rule 356.4 restriction riders) need the identities of those plays so the
 * slot can be scoped to a card shape, so every play site that bumps the
 * Legion counter also appends the card id here.
 *
 * Reset for the turn player at the start of their turn, alongside
 * `cardsPlayedThisTurn`.
 */

interface PlaysLedgerHolder {
  cardsPlayedIdsThisTurn?: Record<string, string[]>;
}

/** Append `cardId` to `playerId`'s list of cards played this turn. */
export function notePlayThisTurn(
  draft: unknown,
  playerId: string,
  cardId: string,
): void {
  const holder = draft as PlaysLedgerHolder;
  holder.cardsPlayedIdsThisTurn ??= {};
  const list = (holder.cardsPlayedIdsThisTurn[playerId] ??= []);
  list.push(cardId);
}

/**
 * rule 412 (ruling 5807cc9df8627167) — a COUNTERED spell never resolves, so a
 * "when you play your Nth card in a turn" trigger skips over it: the next card
 * played is again that turn's Nth. Its play still COUNTS as a play for
 * non-triggered bookkeeping (rule 419.4.b — Legion, "an opponent has played
 * another spell this turn"), so the tally itself is left alone and only the
 * play's ORDINAL is recorded here as void.
 */
export function noteCounteredPlay(
  draft: unknown,
  playerId: string,
  ordinal: number,
): void {
  const holder = draft as { counteredPlayOrdinalsThisTurn?: Record<string, number[]> };
  holder.counteredPlayOrdinalsThisTurn ??= {};
  (holder.counteredPlayOrdinalsThisTurn[playerId] ??= []).push(ordinal);
}

/** How many of `playerId`'s countered plays this turn came before `ordinal`. */
export function counteredPlaysBefore(
  state: unknown,
  playerId: string,
  ordinal: number,
): number {
  const voided = (state as { counteredPlayOrdinalsThisTurn?: Record<string, readonly number[]> })
    .counteredPlayOrdinalsThisTurn?.[playerId];
  return voided ? voided.filter((o) => o < ordinal).length : 0;
}

/** The card ids `playerId` has played so far this turn (oldest first). */
export function playedIdsThisTurn(
  state: unknown,
  playerId: string,
): readonly string[] {
  return (state as PlaysLedgerHolder).cardsPlayedIdsThisTurn?.[playerId] ?? [];
}

/** Clear one player's ledger (start of their turn). */
export function resetPlaysThisTurn(draft: unknown, playerId: string): void {
  const holder = draft as PlaysLedgerHolder & {
    counteredPlayOrdinalsThisTurn?: Record<string, number[]>;
  };
  if (holder.cardsPlayedIdsThisTurn) {
    holder.cardsPlayedIdsThisTurn[playerId] = [];
  }
  if (holder.counteredPlayOrdinalsThisTurn) {
    holder.counteredPlayOrdinalsThisTurn[playerId] = [];
  }
}
