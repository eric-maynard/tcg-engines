/**
 * Scoring Rules
 *
 * Helpers that read battlefield card abilities at runtime to answer
 * "can this player score at this battlefield right now?". Used by
 * battlefields like Forgotten Monument ("Players can't score here until
 * their third turn.") whose rules gate scoring on per-player state.
 *
 * This module intentionally consults the card registry directly so win
 * checks in movereducers and flow hooks can gate scoring without
 * plumbing card-registry contexts through every call site.
 */

import type { PlayerId, RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "./card-lookup";

/**
 * A battlefield card ability with a static `prevent-score` effect blocks
 * scoring at the battlefield for any player whose state fails the ability's
 * condition. Conditions are matched by type below.
 */
interface PreventScoreCondition {
  readonly type?: string;
  readonly threshold?: number;
  readonly player?: "controller" | "any";
}

/**
 * Returns `true` if `playerId` is allowed to score at the battlefield
 * identified by `battlefieldId`, given the battlefield card's abilities.
 *
 * Defaults to `true` when no gating ability is present.
 */
export function canPlayerScoreAtBattlefield(
  state: RiftboundGameState,
  playerId: PlayerId,
  battlefieldId: string,
): boolean {
  // Battlefield cards share their card-instance ID with the battlefield key
  // In `state.battlefields`, so we can look up the card registry directly.
  const registry = getGlobalCardRegistry();
  const abilities = registry.getAbilities(battlefieldId) ?? [];

  for (const ability of abilities) {
    if (ability.type !== "static") {
      continue;
    }
    const effect = ability.effect as { type?: string } | undefined;
    if (effect?.type !== "prevent-score") {
      continue;
    }
    const condition = ability.condition as PreventScoreCondition | undefined;
    if (!condition) {
      // Unconditional prevent-score: always blocks.
      return false;
    }
    if (isBlockedBy(condition, state, playerId)) {
      return false;
    }
  }

  // Not blocked by this battlefield; other battlefields cannot block
  // Scoring at a different battlefield (rules text is "here"-scoped).
  return true;
}

/**
 * Returns `true` when the condition indicates scoring should be blocked
 * for the given player. Used by static `prevent-score` abilities.
 *
 * Supported condition types:
 *
 * - `turn-count-at-least`: blocks scoring until `player.turnsTaken >= threshold`.
 *   Used by Forgotten Monument ("Players can't score here until their third turn.")
 */
function isBlockedBy(
  condition: PreventScoreCondition,
  state: RiftboundGameState,
  playerId: PlayerId,
): boolean {
  const condType = condition.type ?? "";
  if (condType === "turn-count-at-least") {
    const threshold = condition.threshold ?? 0;
    const player = state.players[playerId];
    const turnsTaken = player?.turnsTaken ?? 0;
    // Block while below threshold.
    return turnsTaken < threshold;
  }
  // Unknown condition type: fail closed (do not block) so novel
  // Abilities don't silently hard-stop scoring.
  return false;
}
