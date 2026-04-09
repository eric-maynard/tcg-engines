/**
 * Riftbound Game Modes Tests
 *
 * Verifies that all sanctioned modes of play (rules 640-648)
 * are correctly defined with proper player counts, battlefield counts,
 * victory scores, team settings, and first-turn rules.
 */

import { describe, expect, test } from "bun:test";
import type { GameMode, GameModeConfig } from "../modes/game-modes";
import { GAME_MODES, getGameModeConfig } from "../modes/game-modes";

const ALL_MODES: GameMode[] = ["duel", "match", "ffa3", "ffa4", "magmaChamber"];

describe("GAME_MODES constant", () => {
  test("defines all five sanctioned modes", () => {
    expect(Object.keys(GAME_MODES)).toHaveLength(5);
    for (const mode of ALL_MODES) {
      expect(GAME_MODES[mode]).toBeDefined();
    }
  });

  test("each mode has a matching id field", () => {
    for (const mode of ALL_MODES) {
      expect(GAME_MODES[mode].id).toBe(mode);
    }
  });

  test("each mode has a non-empty name", () => {
    for (const mode of ALL_MODES) {
      expect(GAME_MODES[mode].name.length).toBeGreaterThan(0);
    }
  });

  test("each mode has a positive victory score", () => {
    for (const mode of ALL_MODES) {
      expect(GAME_MODES[mode].victoryScore).toBeGreaterThan(0);
    }
  });

  test("each mode has a positive battlefield count", () => {
    for (const mode of ALL_MODES) {
      expect(GAME_MODES[mode].battlefieldCount).toBeGreaterThan(0);
    }
  });
});

describe("1v1 Duel (rule 644)", () => {
  const { duel } = GAME_MODES;

  test("requires 2 players", () => {
    expect(duel.playerCount).toBe(2);
  });

  test("has 2 battlefields", () => {
    expect(duel.battlefieldCount).toBe(2);
  });

  test("victory score is 8", () => {
    expect(duel.victoryScore).toBe(8);
  });

  test("is not team-based", () => {
    expect(duel.teamBased).toBe(false);
  });

  test("first player does not skip draw", () => {
    expect(duel.firstPlayerSkipsDraw).toBe(false);
  });
});

describe("1v1 Match (rule 645)", () => {
  const { match } = GAME_MODES;

  test("requires 2 players", () => {
    expect(match.playerCount).toBe(2);
  });

  test("has 2 battlefields", () => {
    expect(match.battlefieldCount).toBe(2);
  });

  test("victory score is 8", () => {
    expect(match.victoryScore).toBe(8);
  });

  test("is not team-based", () => {
    expect(match.teamBased).toBe(false);
  });

  test("first player does not skip draw", () => {
    expect(match.firstPlayerSkipsDraw).toBe(false);
  });

  test("shares same victory score and battlefield count as duel", () => {
    expect(match.victoryScore).toBe(GAME_MODES.duel.victoryScore);
    expect(match.battlefieldCount).toBe(GAME_MODES.duel.battlefieldCount);
  });
});

describe("FFA3 Skirmish (rule 646)", () => {
  const { ffa3 } = GAME_MODES;

  test("requires 3 players", () => {
    expect(ffa3.playerCount).toBe(3);
  });

  test("has 3 battlefields", () => {
    expect(ffa3.battlefieldCount).toBe(3);
  });

  test("victory score is 8", () => {
    expect(ffa3.victoryScore).toBe(8);
  });

  test("is not team-based", () => {
    expect(ffa3.teamBased).toBe(false);
  });

  test("first player skips draw", () => {
    expect(ffa3.firstPlayerSkipsDraw).toBe(true);
  });
});

describe("FFA4 War (rule 647)", () => {
  const { ffa4 } = GAME_MODES;

  test("requires 4 players", () => {
    expect(ffa4.playerCount).toBe(4);
  });

  test("has 3 battlefields (first player contributes none)", () => {
    expect(ffa4.battlefieldCount).toBe(3);
  });

  test("victory score is 8", () => {
    expect(ffa4.victoryScore).toBe(8);
  });

  test("is not team-based", () => {
    expect(ffa4.teamBased).toBe(false);
  });

  test("first player skips draw", () => {
    expect(ffa4.firstPlayerSkipsDraw).toBe(true);
  });
});

describe("2v2 Magma Chamber (rule 648)", () => {
  const magma = GAME_MODES.magmaChamber;

  test("requires 4 players", () => {
    expect(magma.playerCount).toBe(4);
  });

  test("has 3 battlefields (first player contributes none)", () => {
    expect(magma.battlefieldCount).toBe(3);
  });

  test("team victory score is 11", () => {
    expect(magma.victoryScore).toBe(11);
  });

  test("is team-based", () => {
    expect(magma.teamBased).toBe(true);
  });

  test("first player skips draw", () => {
    expect(magma.firstPlayerSkipsDraw).toBe(true);
  });

  test("is the only team-based mode", () => {
    const teamModes = ALL_MODES.filter((m) => GAME_MODES[m].teamBased);
    expect(teamModes).toEqual(["magmaChamber"]);
  });
});

describe("getGameModeConfig", () => {
  test("returns the correct config for each mode", () => {
    for (const mode of ALL_MODES) {
      const config = getGameModeConfig(mode);
      expect(config).toBe(GAME_MODES[mode]);
    }
  });

  test("returned config matches expected structure", () => {
    const config = getGameModeConfig("duel");
    expect(config).toHaveProperty("id");
    expect(config).toHaveProperty("name");
    expect(config).toHaveProperty("playerCount");
    expect(config).toHaveProperty("battlefieldCount");
    expect(config).toHaveProperty("victoryScore");
    expect(config).toHaveProperty("teamBased");
    expect(config).toHaveProperty("firstPlayerSkipsDraw");
  });
});

describe("mode relationships", () => {
  test("all FFA modes have firstPlayerSkipsDraw", () => {
    expect(GAME_MODES.ffa3.firstPlayerSkipsDraw).toBe(true);
    expect(GAME_MODES.ffa4.firstPlayerSkipsDraw).toBe(true);
  });

  test("1v1 modes do not have firstPlayerSkipsDraw", () => {
    expect(GAME_MODES.duel.firstPlayerSkipsDraw).toBe(false);
    expect(GAME_MODES.match.firstPlayerSkipsDraw).toBe(false);
  });

  test("4-player modes have 3 battlefields", () => {
    expect(GAME_MODES.ffa4.battlefieldCount).toBe(3);
    expect(GAME_MODES.magmaChamber.battlefieldCount).toBe(3);
  });

  test("all modes have victory score of at least 8", () => {
    for (const mode of ALL_MODES) {
      expect(GAME_MODES[mode].victoryScore).toBeGreaterThanOrEqual(8);
    }
  });

  test("team mode has a higher victory score than solo modes", () => {
    const soloModes = ALL_MODES.filter((m) => !GAME_MODES[m].teamBased);
    const maxSoloScore = Math.max(...soloModes.map((m) => GAME_MODES[m].victoryScore));
    expect(GAME_MODES.magmaChamber.victoryScore).toBeGreaterThan(maxSoloScore);
  });
});
