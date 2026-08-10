/**
 * rule 416.5 — two or more cards recycled to a Main Deck at the same time are
 * put on the bottom in a RANDOM order: no player chooses it, and no player
 * learns it (416.5.a: only the Rune Deck lets its owner order them).
 *
 * The game's SEEDED rng draws the order, so the same seed + the same answers
 * still replay to the same deck bottom.
 */
export function randomizedRecycleOrder(
  ids: readonly string[],
  rng: { readonly shuffle: <T>(array: readonly T[]) => T[] } | undefined,
): string[] {
  return ids.length < 2 || rng === undefined ? [...ids] : rng.shuffle(ids);
}
