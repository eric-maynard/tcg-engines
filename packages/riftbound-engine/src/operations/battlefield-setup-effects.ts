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
 * - `increase-victory-score`: bumps every player's `victoryScoreModifier`
 *   by `amount`. Used by Aspirant's Climb.
 * - `increase-hidden-capacity`: bumps the source battlefield's
 *   `hiddenCapacityBonus` by `amount`. Used by Bandle Tree.
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

      if (effect.type === "increase-victory-score") {
        const amount = effect.amount ?? 1;
        for (const pid of Object.keys(state.players)) {
          const player = state.players[pid];
          if (!player) {
            continue;
          }
          player.victoryScoreModifier = (player.victoryScoreModifier ?? 0) + amount;
        }
      } else if (effect.type === "increase-hidden-capacity") {
        const amount = effect.amount ?? 1;
        const bf = state.battlefields[battlefieldId];
        if (bf) {
          bf.hiddenCapacityBonus = (bf.hiddenCapacityBonus ?? 0) + amount;
        }
      }
    }
  }
}
