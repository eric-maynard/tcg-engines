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
    publicReveals?: { playerId: string; cardIds: readonly string[]; turn: number }[];
    turn?: { number?: number };
  };
  const entries = draft.publicReveals ?? [];
  entries.push({ cardIds: [...cardIds], playerId, turn: draft.turn?.number ?? 0 });
  draft.publicReveals = entries.slice(-PUBLIC_REVEAL_HISTORY);
}
