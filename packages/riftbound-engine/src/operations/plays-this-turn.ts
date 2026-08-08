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

/** The card ids `playerId` has played so far this turn (oldest first). */
export function playedIdsThisTurn(
  state: unknown,
  playerId: string,
): readonly string[] {
  return (state as PlaysLedgerHolder).cardsPlayedIdsThisTurn?.[playerId] ?? [];
}

/** Clear one player's ledger (start of their turn). */
export function resetPlaysThisTurn(draft: unknown, playerId: string): void {
  const holder = draft as PlaysLedgerHolder;
  if (holder.cardsPlayedIdsThisTurn) {
    holder.cardsPlayedIdsThisTurn[playerId] = [];
  }
}
