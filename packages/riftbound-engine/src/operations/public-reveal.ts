/**
 * The shared public-reveal record (rule 424.1): a reveal presents the card to
 * ALL players. Every reveal path — effect reveals, and rule 421.4 (a facedown
 * card that changes zones is revealed by its owner as it leaves) — writes here
 * so the identity is on the state for the log / UI / a spectator to name,
 * whether or not the reveal parks a prompt.
 *
 * Lives in `operations/` (not the effect helpers) so zone-change code can
 * record a reveal without importing the effect-handler graph.
 */

/** How many past reveals the shared record keeps (rule 424.1 is about the moment, not a permanent log). */
const PUBLIC_REVEAL_HISTORY = 20;

export function recordPublicReveal(
  ctx: { draft: unknown },
  playerId: string,
  cardIds: readonly string[],
): void {
  if (cardIds.length === 0) return;
  const draft = ctx.draft as {
    activeReveals?: string[];
    publicReveals?: { playerId: string; cardIds: readonly string[]; turn: number }[];
    turn?: { number?: number };
  };
  const entries = draft.publicReveals ?? [];
  entries.push({ cardIds: [...cardIds], playerId, turn: draft.turn?.number ?? 0 });
  draft.publicReveals = entries.slice(-PUBLIC_REVEAL_HISTORY);
  // rule 424.1.a.3 — open the reveal window: while it is open the card is
  // public to EVERY seat wherever it sits (a revealed card stays in its zone,
  // rule 424.1.a.2), not just to whoever the reveal prompted.
  const active = draft.activeReveals ?? [];
  for (const id of cardIds) {
    if (!active.includes(id)) active.push(id);
  }
  draft.activeReveals = active;
}

/**
 * rule 424.1.a.3 — close the reveal window once the effect that revealed the
 * cards has finished resolving. The `publicReveals` log keeps the historical
 * record; the cards themselves stop being public where they sit.
 */
export function clearActiveReveals(draft: unknown): void {
  const d = draft as { activeReveals?: string[] };
  if (d.activeReveals !== undefined && d.activeReveals.length > 0) {
    d.activeReveals = [];
  }
}
