/**
 * CHOSEN PLAYERS (rule 355.10 — "Choose an opponent. They reveal their hand …").
 *
 * A player named by an instruction is a target: it is picked when the item is
 * FINALIZED and it sticks. Two consequences the engine needs it recorded for:
 *   - rule 751.1 / 752.1 / 753.1 — a new controller making new choices may
 *     remake the chosen player, evaluated from THEIR seat (their opponents).
 *   - rule 359.3.e.2 / 359.3.e.5 — a chosen player kept through a control
 *     change may be illegal at resolution (a player is no opponent of himself):
 *     the instructions that read it are then skipped, nothing else changes.
 *
 * With exactly one legal player the choice is auto-bound (402.2), which is
 * every 1v1 game; with several the caster is prompted by the normal targeting
 * path and nothing is recorded here.
 *
 * Leaf module: no engine imports.
 */

/** The `which` of the first `{ type: "player" }` target descriptor in an effect tree. */
export function playerTargetWhich(effect: unknown): string | undefined {
  if (effect === null || typeof effect !== "object") {
    return undefined;
  }
  const node = effect as Record<string, unknown>;
  const target = node.target as { type?: string; which?: string } | undefined;
  if (target?.type === "player") {
    return target.which ?? "player";
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = playerTargetWhich(entry);
        if (found !== undefined) {
          return found;
        }
      }
    } else if (value !== null && typeof value === "object") {
      const found = playerTargetWhich(value);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * The players `which` may legally name, read from `chooser`'s seat (753.1).
 * "opponent"/"enemy" = everybody else; "self"/"you" = the chooser; anything
 * else = any player.
 */
export function legalChosenPlayers(which: string, chooser: string, allPlayers: readonly string[]): string[] {
  if (which === "opponent" || which === "enemy") {
    return allPlayers.filter((p) => p !== chooser);
  }
  if (which === "self" || which === "you" || which === "controller") {
    return allPlayers.filter((p) => p === chooser);
  }
  return [...allPlayers];
}
