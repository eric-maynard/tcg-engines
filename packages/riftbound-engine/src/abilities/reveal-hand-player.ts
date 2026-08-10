/**
 * rule 355.10 — "Choose an opponent. They reveal their hand …" (ogn-156-298
 * Sabotage, ogn-192-298 Mindsplitter, unl-139-219 Bone Skewer): the revealing
 * player is a choice made as the item is played/finalized, not at resolution.
 *
 * This leaf module names the one effect shape that carries such a choice so the
 * finalization sweep and the `reveal-hand` handler agree on when a seat has to
 * be named. Leaf module: no engine imports.
 */

/** The `which` of a `reveal-hand` effect's player target, when it has one and no seat is bound yet. */
export function revealHandChosenPlayerWhich(effect: unknown): string | undefined {
  if (effect === null || typeof effect !== "object") {
    return undefined;
  }
  const node = effect as {
    _chosenPlayer?: unknown;
    revealer?: unknown;
    target?: { type?: string; which?: string };
    type?: string;
  };
  if (node.type !== "reveal-hand") {
    return undefined;
  }
  if (typeof node._chosenPlayer === "string" || typeof node.revealer === "string") {
    return undefined;
  }
  return node.target?.type === "player" ? (node.target.which ?? "player") : undefined;
}
