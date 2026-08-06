/**
 * Riftbound Combat Moves
 *
 * Moves for combat: contesting battlefields, assigning attackers/defenders,
 * dealing damage, resolving combat, and scoring.
 */

import type { GameMoveDefinitions } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../types";
import { assignAttacker } from "./combat/assign-attacker";
import { assignDamage } from "./combat/assign-damage";
import { assignDefender } from "./combat/assign-defender";
import { clearCombatState } from "./combat/clear-combat-state";
import { conquerBattlefield } from "./combat/conquer-battlefield";
import { contestBattlefield } from "./combat/contest-battlefield";
import { resolveCombat } from "./combat/resolve-combat";
import { resolveFullCombat } from "./combat/resolve-full-combat";
import { scorePoint } from "./combat/score-point";

/**
 * Combat move definitions
 */
export const combatMoves: Partial<
  GameMoveDefinitions<RiftboundGameState, RiftboundMoves, RiftboundCardMeta, unknown>
> = {
  contestBattlefield,
  assignAttacker,
  assignDefender,
  assignDamage,
  resolveCombat,
  resolveFullCombat,
  conquerBattlefield,
  scorePoint,
  clearCombatState,
};
