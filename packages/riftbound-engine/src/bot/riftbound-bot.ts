/**
 * Riftbound Bot Player
 *
 * An AI player that can play Riftbound using the move enumeration system.
 * Supports multiple strategies from random to heuristic-based.
 *
 * Usage:
 * ```typescript
 * const bot = new RiftboundBot(engine, "player-2", "aggressive");
 * while (!bot.isGameOver()) {
 *   bot.takeTurn();
 * }
 * ```
 */

import type { PlayerId, RuleEngine } from "@tcg/core";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../types";

/**
 * Bot strategy determines how the bot prioritizes moves.
 */
export type BotStrategy = "random" | "aggressive" | "defensive" | "balanced";

/**
 * Move scoring weights per strategy.
 */
const STRATEGY_WEIGHTS: Record<BotStrategy, Record<string, number>> = {
  aggressive: {
    conquerBattlefield: 100,
    endTurn: 5,
    gankingMove: 95,
    playGear: 40,
    playSpell: 70,
    playUnit: 80,
    resolveCombat: 85,
    scorePoint: 100,
    standardMove: 90,
  },
  balanced: {
    conquerBattlefield: 100,
    endTurn: 10,
    gankingMove: 80,
    playGear: 60,
    playSpell: 65,
    playUnit: 70,
    resolveCombat: 85,
    scorePoint: 100,
    standardMove: 75,
  },
  defensive: {
    conquerBattlefield: 100,
    endTurn: 10,
    playGear: 80,
    playSpell: 70,
    playUnit: 60,
    recallUnit: 50,
    scorePoint: 100,
    standardMove: 40,
  },
  random: {},
};

/**
 * Result of a bot action.
 */
export interface BotAction {
  readonly moveId: string;
  readonly params: Record<string, unknown>;
  readonly success: boolean;
  readonly reasoning?: string;
}

/**
 * Riftbound Bot Player
 */
export class RiftboundBot {
  private readonly engine: RuleEngine<
    RiftboundGameState,
    RiftboundMoves,
    unknown,
    RiftboundCardMeta
  >;
  private readonly playerId: string;
  private readonly strategy: BotStrategy;
  private actionsThisTurn = 0;
  private readonly maxActionsPerTurn: number;

  constructor(
    engine: RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>,
    playerId: string,
    strategy: BotStrategy = "balanced",
    maxActionsPerTurn = 20,
  ) {
    this.engine = engine;
    this.playerId = playerId;
    this.strategy = strategy;
    this.maxActionsPerTurn = maxActionsPerTurn;
  }

  /**
   * Check if the game is over.
   */
  isGameOver(): boolean {
    const state = this.engine.getState();
    return state.status === "finished";
  }

  /**
   * Check if it's this bot's turn.
   */
  isMyTurn(): boolean {
    const state = this.engine.getState();
    return state.turn.activePlayer === this.playerId;
  }

  /**
   * Take a single action. Returns the action taken, or null if no action available.
   */
  takeAction(): BotAction | null {
    if (this.isGameOver()) {
      return null;
    }
    if (!this.isMyTurn()) {
      return null;
    }

    // Safety valve: don't infinite loop
    if (this.actionsThisTurn >= this.maxActionsPerTurn) {
      return this.doEndTurn();
    }

    // Try to enumerate moves
    const moves = this.getAvailableMoves();

    if (moves.length === 0) {
      return this.doEndTurn();
    }

    // Score and pick the best move
    const scoredMoves = moves.map((m) => ({
      move: m,
      score: this.scoreMove(m.moveId, m.params),
    }));

    // Sort by score descending
    scoredMoves.sort((a, b) => b.score - a.score);

    // Pick the best (with some randomness for variety)
    const topMoves = scoredMoves.filter((m) => m.score >= scoredMoves[0].score * 0.8);
    const chosen = topMoves[Math.floor(Math.random() * topMoves.length)];

    if (!chosen) {
      return this.doEndTurn();
    }

    const result = this.engine.executeMove(chosen.move.moveId, {
      params: chosen.move.params,
      playerId: this.playerId as PlayerId,
    });

    this.actionsThisTurn++;

    return {
      moveId: chosen.move.moveId,
      params: chosen.move.params as Record<string, unknown>,
      reasoning: `Score: ${chosen.score}, Strategy: ${this.strategy}`,
      success: result.success,
    };
  }

  /**
   * Take all actions for a complete turn.
   */
  takeTurn(): BotAction[] {
    const actions: BotAction[] = [];
    this.actionsThisTurn = 0;

    while (this.isMyTurn() && !this.isGameOver()) {
      const action = this.takeAction();
      if (!action) {
        break;
      }
      actions.push(action);

      // If we ended the turn, stop
      if (action.moveId === "endTurn") {
        break;
      }
    }

    return actions;
  }

  /**
   * Get available moves using the enumeration system.
   */
  private getAvailableMoves(): { moveId: string; params: Record<string, unknown> }[] {
    try {
      const enumerated = this.engine.enumerateMoves(this.playerId as PlayerId, {
        validOnly: true,
      });

      return enumerated.map((m) => ({
        moveId: m.moveId,
        params: (m.params ?? {}) as Record<string, unknown>,
      }));
    } catch {
      // Fallback: return basic moves if enumeration fails
      return this.getFallbackMoves();
    }
  }

  /**
   * Fallback move generation when enumerators aren't available.
   */
  private getFallbackMoves(): { moveId: string; params: Record<string, unknown> }[] {
    const moves: { moveId: string; params: Record<string, unknown> }[] = [];
    const state = this.engine.getState();

    if (state.status !== "playing") {
      return moves;
    }

    // Always can end turn
    moves.push({ moveId: "endTurn", params: { playerId: this.playerId } });

    // Try to conquer uncontrolled battlefields
    for (const [bfId, bf] of Object.entries(state.battlefields)) {
      if (!bf.controller) {
        moves.push({
          moveId: "conquerBattlefield",
          params: { battlefieldId: bfId, playerId: this.playerId },
        });
      }
      if (bf.contested) {
        moves.push({
          moveId: "resolveCombat",
          params: { battlefieldId: bfId },
        });
      }
    }

    // Try to score controlled battlefields
    const scoredThisTurn = state.scoredThisTurn[this.playerId] ?? [];
    for (const [bfId, bf] of Object.entries(state.battlefields || {})) {
      if (bf.controller === this.playerId && !scoredThisTurn.includes(bfId)) {
        moves.push({
          moveId: "scorePoint",
          params: { battlefieldId: bfId, method: "conquer", playerId: this.playerId },
        });
      }
    }

    return moves;
  }

  /**
   * Score a move based on the bot's strategy.
   */
  private scoreMove(moveId: string, params: Record<string, unknown>): number {
    const weights = STRATEGY_WEIGHTS[this.strategy];
    const baseScore = weights[moveId] ?? 50;

    // Add randomness
    const randomFactor = Math.random() * 20;

    return baseScore + randomFactor;
  }

  /**
   * Force end turn.
   */
  private doEndTurn(): BotAction {
    const result = this.engine.executeMove("endTurn", {
      params: { playerId: this.playerId },
      playerId: this.playerId as PlayerId,
    });

    return {
      moveId: "endTurn",
      params: { playerId: this.playerId },
      reasoning: "No better moves available",
      success: result.success,
    };
  }
}
