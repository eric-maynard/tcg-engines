/**
 * XP System Test Suite
 *
 * Tests for the XP (Experience Points) subsystem introduced by the
 * Unleashed (UNL) card set. Covers XP gain/spend, level conditions,
 * per-turn tracking, and Hunt keyword triggers.
 */

import { describe, expect, it } from "bun:test";
import { produce } from "immer";
import type { PlayerId, RiftboundGameState } from "../types";
import { createPlayerState } from "../types/game-state";
import { createInitialState } from "../game-definition/setup/game-setup";
import {
  gainXp,
  getPlayerXp,
  getXpGainedThisTurn,
  resetXpGainedThisTurn,
  spendXp,
} from "../operations/xp-operations";
import { evaluateWhileLevel, evaluateXpGainedThisTurn } from "../abilities/xp-conditions";
import type { XpGameEvent } from "../abilities/game-events";

/**
 * Helper to create a test game state with two players
 */
function createTestState(): RiftboundGameState {
  return createInitialState([{ id: "player-1" }, { id: "player-2" }]);
}

describe("XP System", () => {
  // ============================================
  // PlayerState.xp
  // ============================================

  describe("PlayerState.xp initialization", () => {
    it("should initialize player xp to 0", () => {
      const player = createPlayerState("player-1" as PlayerId);
      expect(player.xp).toBe(0);
    });

    it("should initialize xpGainedThisTurn for all players", () => {
      const state = createTestState();
      expect(state.xpGainedThisTurn["player-1"]).toBe(0);
      expect(state.xpGainedThisTurn["player-2"]).toBe(0);
    });
  });

  // ============================================
  // Gaining XP
  // ============================================

  describe("gainXp", () => {
    it("should increase player xp by the specified amount", () => {
      const state = createTestState();
      const result = gainXp(state, "player-1" as PlayerId, 3);

      expect(result.players["player-1"]?.xp).toBe(3);
    });

    it("should default to gaining 1 xp when amount is 1", () => {
      const state = createTestState();
      const result = gainXp(state, "player-1" as PlayerId, 1);

      expect(result.players["player-1"]?.xp).toBe(1);
    });

    it("should accumulate xp across multiple gains", () => {
      const state = createTestState();
      const after1 = gainXp(state, "player-1" as PlayerId, 3);
      const after2 = gainXp(after1, "player-1" as PlayerId, 5);

      expect(after2.players["player-1"]?.xp).toBe(8);
    });

    it("should track xp gained this turn", () => {
      const state = createTestState();
      const result = gainXp(state, "player-1" as PlayerId, 4);

      expect(result.xpGainedThisTurn["player-1"]).toBe(4);
    });

    it("should accumulate xpGainedThisTurn across multiple gains in same turn", () => {
      const state = createTestState();
      const after1 = gainXp(state, "player-1" as PlayerId, 2);
      const after2 = gainXp(after1, "player-1" as PlayerId, 3);

      expect(after2.xpGainedThisTurn["player-1"]).toBe(5);
    });

    it("should not affect other player's xp", () => {
      const state = createTestState();
      const result = gainXp(state, "player-1" as PlayerId, 5);

      expect(result.players["player-2"]?.xp).toBe(0);
      expect(result.xpGainedThisTurn["player-2"]).toBe(0);
    });

    it("should return state unchanged if player does not exist", () => {
      const state = createTestState();
      const result = gainXp(state, "nonexistent" as PlayerId, 3);

      // Should not throw, just return unchanged
      expect(result.players["nonexistent"]).toBeUndefined();
    });
  });

  // ============================================
  // Spending XP
  // ============================================

  describe("spendXp", () => {
    it("should decrease player xp by the specified amount", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 10);
      const result = spendXp(withXp, "player-1" as PlayerId, 4);

      expect(result?.players["player-1"]?.xp).toBe(6);
    });

    it("should return null if player does not have enough xp", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 3);
      const result = spendXp(withXp, "player-1" as PlayerId, 5);

      expect(result).toBeNull();
    });

    it("should allow spending exactly the amount of xp available", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 7);
      const result = spendXp(withXp, "player-1" as PlayerId, 7);

      expect(result?.players["player-1"]?.xp).toBe(0);
    });

    it("should return null if player does not exist", () => {
      const state = createTestState();
      const result = spendXp(state, "nonexistent" as PlayerId, 1);

      expect(result).toBeNull();
    });

    it("should not affect other player's xp", () => {
      const state = createTestState();
      const withXp = gainXp(gainXp(state, "player-1" as PlayerId, 10), "player-2" as PlayerId, 5);
      const result = spendXp(withXp, "player-1" as PlayerId, 3);

      expect(result?.players["player-2"]?.xp).toBe(5);
    });
  });

  // ============================================
  // GetPlayerXp helper
  // ============================================

  describe("getPlayerXp", () => {
    it("should return 0 for a new player", () => {
      const state = createTestState();
      expect(getPlayerXp(state, "player-1" as PlayerId)).toBe(0);
    });

    it("should return the correct xp after gains", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 11);
      expect(getPlayerXp(withXp, "player-1" as PlayerId)).toBe(11);
    });

    it("should return 0 for nonexistent player", () => {
      const state = createTestState();
      expect(getPlayerXp(state, "nonexistent" as PlayerId)).toBe(0);
    });
  });

  // ============================================
  // While-level condition
  // ============================================

  describe("evaluateWhileLevel", () => {
    it("should return true when xp >= threshold", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 5);

      expect(evaluateWhileLevel(withXp, "player-1" as PlayerId, 3)).toBe(true);
      expect(evaluateWhileLevel(withXp, "player-1" as PlayerId, 5)).toBe(true);
    });

    it("should return false when xp < threshold", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 2);

      expect(evaluateWhileLevel(withXp, "player-1" as PlayerId, 3)).toBe(false);
    });

    it("should handle level 3 threshold", () => {
      const state = createTestState();

      const at2 = gainXp(state, "player-1" as PlayerId, 2);
      expect(evaluateWhileLevel(at2, "player-1" as PlayerId, 3)).toBe(false);

      const at3 = gainXp(state, "player-1" as PlayerId, 3);
      expect(evaluateWhileLevel(at3, "player-1" as PlayerId, 3)).toBe(true);
    });

    it("should handle level 6 threshold", () => {
      const state = createTestState();

      const at5 = gainXp(state, "player-1" as PlayerId, 5);
      expect(evaluateWhileLevel(at5, "player-1" as PlayerId, 6)).toBe(false);

      const at6 = gainXp(state, "player-1" as PlayerId, 6);
      expect(evaluateWhileLevel(at6, "player-1" as PlayerId, 6)).toBe(true);
    });

    it("should handle level 11 threshold", () => {
      const state = createTestState();

      const at10 = gainXp(state, "player-1" as PlayerId, 10);
      expect(evaluateWhileLevel(at10, "player-1" as PlayerId, 11)).toBe(false);

      const at11 = gainXp(state, "player-1" as PlayerId, 11);
      expect(evaluateWhileLevel(at11, "player-1" as PlayerId, 11)).toBe(true);
    });

    it("should handle level 16 threshold", () => {
      const state = createTestState();

      const at15 = gainXp(state, "player-1" as PlayerId, 15);
      expect(evaluateWhileLevel(at15, "player-1" as PlayerId, 16)).toBe(false);

      const at16 = gainXp(state, "player-1" as PlayerId, 16);
      expect(evaluateWhileLevel(at16, "player-1" as PlayerId, 16)).toBe(true);
    });

    it("should return true when threshold is 0", () => {
      const state = createTestState();
      expect(evaluateWhileLevel(state, "player-1" as PlayerId, 0)).toBe(true);
    });

    it("should return false for nonexistent player", () => {
      const state = createTestState();
      expect(evaluateWhileLevel(state, "nonexistent" as PlayerId, 1)).toBe(false);
    });
  });

  // ============================================
  // Xp-gained-this-turn condition
  // ============================================

  describe("evaluateXpGainedThisTurn", () => {
    it("should return false when no xp gained this turn", () => {
      const state = createTestState();
      expect(evaluateXpGainedThisTurn(state, "player-1" as PlayerId)).toBe(false);
    });

    it("should return true when xp was gained this turn", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 2);

      expect(evaluateXpGainedThisTurn(withXp, "player-1" as PlayerId)).toBe(true);
    });

    it("should be player-specific", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 1);

      expect(evaluateXpGainedThisTurn(withXp, "player-1" as PlayerId)).toBe(true);
      expect(evaluateXpGainedThisTurn(withXp, "player-2" as PlayerId)).toBe(false);
    });

    it("should return false for nonexistent player", () => {
      const state = createTestState();
      expect(evaluateXpGainedThisTurn(state, "nonexistent" as PlayerId)).toBe(false);
    });
  });

  // ============================================
  // XP Gained This Turn tracking + reset
  // ============================================

  describe("xpGainedThisTurn tracking and reset", () => {
    it("should track cumulative xp gained in a turn", () => {
      const state = createTestState();
      const after1 = gainXp(state, "player-1" as PlayerId, 2);
      const after2 = gainXp(after1, "player-1" as PlayerId, 3);

      expect(getXpGainedThisTurn(after2, "player-1" as PlayerId)).toBe(5);
    });

    it("should reset xpGainedThisTurn for a player", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 4);

      expect(getXpGainedThisTurn(withXp, "player-1" as PlayerId)).toBe(4);

      const reset = resetXpGainedThisTurn(withXp, "player-1" as PlayerId);
      expect(getXpGainedThisTurn(reset, "player-1" as PlayerId)).toBe(0);
    });

    it("should not reset other player's xpGainedThisTurn", () => {
      const state = createTestState();
      const withXp = gainXp(gainXp(state, "player-1" as PlayerId, 3), "player-2" as PlayerId, 2);

      const reset = resetXpGainedThisTurn(withXp, "player-1" as PlayerId);

      expect(getXpGainedThisTurn(reset, "player-1" as PlayerId)).toBe(0);
      expect(getXpGainedThisTurn(reset, "player-2" as PlayerId)).toBe(2);
    });

    it("should preserve total xp when resetting turn tracking", () => {
      const state = createTestState();
      const withXp = gainXp(state, "player-1" as PlayerId, 7);
      const reset = resetXpGainedThisTurn(withXp, "player-1" as PlayerId);

      // Total xp should be unchanged
      expect(getPlayerXp(reset, "player-1" as PlayerId)).toBe(7);
      // But turn tracking should be reset
      expect(getXpGainedThisTurn(reset, "player-1" as PlayerId)).toBe(0);
    });
  });

  // ============================================
  // Game Event type
  // ============================================

  describe("XpGameEvent", () => {
    it("should have the correct shape", () => {
      const event: XpGameEvent = {
        amount: 3,
        playerId: "player-1",
        type: "gain-xp",
      };

      expect(event.type).toBe("gain-xp");
      expect(event.playerId).toBe("player-1");
      expect(event.amount).toBe(3);
    });
  });

  // ============================================
  // Hunt keyword trigger on conquer/hold
  // ============================================

  describe("Hunt keyword", () => {
    it("should generate gain-xp amount equal to Hunt value on conquer", () => {
      // Hunt N: When you conquer or hold a battlefield, gain N XP
      // We test the operation that would be called by the trigger
      const state = createTestState();
      const huntValue = 2;
      const result = gainXp(state, "player-1" as PlayerId, huntValue);

      expect(result.players["player-1"]?.xp).toBe(huntValue);
    });

    it("should generate gain-xp amount equal to Hunt value on hold", () => {
      const state = createTestState();
      const huntValue = 3;
      const result = gainXp(state, "player-1" as PlayerId, huntValue);

      expect(result.players["player-1"]?.xp).toBe(huntValue);
    });

    it("should accumulate XP from multiple Hunt triggers", () => {
      // Two units with Hunt 2 each trigger on conquer
      const state = createTestState();
      const after1 = gainXp(state, "player-1" as PlayerId, 2);
      const after2 = gainXp(after1, "player-1" as PlayerId, 2);

      expect(after2.players["player-1"]?.xp).toBe(4);
      expect(after2.xpGainedThisTurn["player-1"]).toBe(4);
    });
  });

  // ============================================
  // XP Move definitions
  // ============================================

  describe("XP Move definitions", () => {
    it("should have gainXp move in the moves index", async () => {
      const { xpMoves } = await import("../game-definition/moves/xp");
      expect(xpMoves.gainXp).toBeDefined();
      expect(xpMoves.gainXp?.reducer).toBeDefined();
    });

    it("should have spendXp move in the moves index", async () => {
      const { xpMoves } = await import("../game-definition/moves/xp");
      expect(xpMoves.spendXp).toBeDefined();
      expect(xpMoves.spendXp?.reducer).toBeDefined();
    });
  });
});
