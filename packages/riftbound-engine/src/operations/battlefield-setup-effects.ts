/**
 * Battlefield Setup Effects
 *
 * Applies permanent static effects from battlefield cards once at game
 * start. The set of in-play battlefields is fixed after setup, so any
 * effect whose rules text is a global property of the battlefield (e.g.
 * "Increase the points needed to win the game by 1.", "You may hide an
 * additional card here.") can be baked into initial state here instead
 * of being re-evaluated by the runtime static-ability layer every pass.
 *
 * Supported static effect types:
 * - `increase-hidden-capacity`: bumps the source battlefield's
 *   `hiddenCapacityBonus` by `amount`. Used by Bandle Tree.
 *
 * `increase-victory-score` (Aspirant's Climb) is NOT baked in here: rule 365.1
 * makes a passive active only while its source is on the board, so the bonus is
 * derived from the current board by `getBattlefieldVictoryScoreBonus`.
 */

import type { RiftboundGameState } from "../types";
import { getGlobalCardRegistry } from "./card-lookup";

interface StaticBattlefieldEffect {
  readonly type?: string;
  readonly amount?: number;
}

/**
 * Scan every battlefield in `state.battlefields` for static abilities
 * whose effect type matches one of the supported permanent-effect types
 * and apply them to `state` in place. Safe to call on an Immer draft.
 */
export function applyBattlefieldPermanentEffects(state: RiftboundGameState): void {
  const registry = getGlobalCardRegistry();

  for (const battlefieldId of Object.keys(state.battlefields)) {
    const abilities = registry.getAbilities(battlefieldId) ?? [];
    for (const ability of abilities) {
      if (ability.type !== "static") {
        continue;
      }
      const effect = ability.effect as StaticBattlefieldEffect | undefined;
      if (!effect) {
        continue;
      }

      if (effect.type === "increase-hidden-capacity") {
        const amount = effect.amount ?? 1;
        const bf = state.battlefields[battlefieldId];
        if (bf) {
          bf.hiddenCapacityBonus = (bf.hiddenCapacityBonus ?? 0) + amount;
        }
      }
    }
  }
}

/**
 * rule 194.3.a / 365.1 — the effective Victory Score bonus contributed by the
 * battlefields currently in play. A battlefield reading "Increase the points
 * needed to win the game by 1." is a passive: it only counts while that
 * battlefield is on the board, so the bonus is derived here rather than baked
 * into a player's `victoryScoreModifier` at setup.
 */
export function getBattlefieldVictoryScoreBonus(state: {
  readonly battlefields?: Record<string, unknown>;
}): number {
  const registry = getGlobalCardRegistry();
  let bonus = 0;
  for (const battlefieldId of Object.keys(state.battlefields ?? {})) {
    for (const ability of registry.getAbilities(battlefieldId) ?? []) {
      if (ability.type !== "static") {
        continue;
      }
      const effect = ability.effect as StaticBattlefieldEffect | undefined;
      if (effect?.type === "increase-victory-score") {
        bonus += effect.amount ?? 1;
      }
    }
  }
  return bonus;
}
