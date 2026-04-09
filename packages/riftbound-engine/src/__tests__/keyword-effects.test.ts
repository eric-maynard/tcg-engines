/**
 * Keyword Effects Tests
 *
 * Tests for keyword game mechanics.
 */

import { describe, expect, test } from "bun:test";
import {
  KEYWORD_DEFINITIONS,
  applyShield,
  calculateCombatMight,
  canMoveToLocation,
  canPlaySpellAtTiming,
  getDeflectCost,
  shouldEnterReady,
  sortByTankPriority,
} from "../keywords";

describe("Keyword Definitions", () => {
  test("all keywords are defined", () => {
    expect(Object.keys(KEYWORD_DEFINITIONS).length).toBeGreaterThanOrEqual(14);
  });

  test("Tank is a combat keyword", () => {
    expect(KEYWORD_DEFINITIONS.Tank.category).toBe("combat");
    expect(KEYWORD_DEFINITIONS.Tank.ruleNumber).toBe(727);
  });

  test("Ganking is a movement keyword", () => {
    expect(KEYWORD_DEFINITIONS.Ganking.category).toBe("movement");
    expect(KEYWORD_DEFINITIONS.Ganking.ruleNumber).toBe(722);
  });

  test("Assault is stackable", () => {
    expect(KEYWORD_DEFINITIONS.Assault.stackable).toBe(true);
  });

  test("Tank is not stackable", () => {
    expect(KEYWORD_DEFINITIONS.Tank.stackable).toBe(false);
  });
});

describe("Combat: Assault", () => {
  test("adds bonus Might when attacking", () => {
    expect(calculateCombatMight(4, 2, true)).toBe(6);
  });

  test("no bonus when defending", () => {
    expect(calculateCombatMight(4, 2, false)).toBe(4);
  });

  test("no bonus when Assault is 0", () => {
    expect(calculateCombatMight(4, 0, true)).toBe(4);
  });

  test("stacking Assault values", () => {
    expect(calculateCombatMight(3, 5, true)).toBe(8);
  });
});

describe("Combat: Shield", () => {
  test("reduces incoming damage", () => {
    expect(applyShield(5, 2)).toBe(3);
  });

  test("prevents all damage when shield >= damage", () => {
    expect(applyShield(2, 3)).toBe(0);
  });

  test("no reduction when shield is 0", () => {
    expect(applyShield(5, 0)).toBe(5);
  });

  test("handles exactly equal", () => {
    expect(applyShield(3, 3)).toBe(0);
  });
});

describe("Combat: Tank", () => {
  test("sorts Tank units first", () => {
    const units = [
      { hasTank: false, id: "a" },
      { hasTank: true, id: "b" },
      { hasTank: false, id: "c" },
    ];
    const sorted = sortByTankPriority(units);
    expect(sorted[0].id).toBe("b");
  });

  test("preserves order among non-Tank units", () => {
    const units = [
      { hasTank: false, id: "a" },
      { hasTank: false, id: "b" },
    ];
    const sorted = sortByTankPriority(units);
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
  });

  test("multiple Tank units stay in order", () => {
    const units = [
      { hasTank: true, id: "a" },
      { hasTank: true, id: "b" },
      { hasTank: false, id: "c" },
    ];
    const sorted = sortByTankPriority(units);
    expect(sorted[0].id).toBe("a");
    expect(sorted[1].id).toBe("b");
    expect(sorted[2].id).toBe("c");
  });
});

describe("Movement: Ganking", () => {
  test("base to battlefield always allowed", () => {
    expect(canMoveToLocation(false, "base", "battlefield")).toBe(true);
    expect(canMoveToLocation(true, "base", "battlefield")).toBe(true);
  });

  test("battlefield to base always allowed", () => {
    expect(canMoveToLocation(false, "battlefield", "base")).toBe(true);
    expect(canMoveToLocation(true, "battlefield", "base")).toBe(true);
  });

  test("battlefield to battlefield requires Ganking", () => {
    expect(canMoveToLocation(false, "battlefield", "battlefield")).toBe(false);
    expect(canMoveToLocation(true, "battlefield", "battlefield")).toBe(true);
  });
});

describe("Play: Accelerate", () => {
  test("enters ready when Accelerate paid", () => {
    expect(shouldEnterReady(true)).toBe(true);
  });

  test("enters exhausted without Accelerate", () => {
    expect(shouldEnterReady(false)).toBe(false);
  });
});

describe("Play: Spell Timing", () => {
  test("Reaction can be played any time", () => {
    expect(
      canPlaySpellAtTiming("reaction", { hasChain: false, isOwnerTurn: false, isShowdown: false }),
    ).toBe(true);
    expect(
      canPlaySpellAtTiming("reaction", { hasChain: true, isOwnerTurn: false, isShowdown: true }),
    ).toBe(true);
  });

  test("Action can be played on own turn", () => {
    expect(
      canPlaySpellAtTiming("action", { hasChain: false, isOwnerTurn: true, isShowdown: false }),
    ).toBe(true);
  });

  test("Action can be played during showdown", () => {
    expect(
      canPlaySpellAtTiming("action", { hasChain: false, isOwnerTurn: false, isShowdown: true }),
    ).toBe(true);
  });

  test("Action cannot be played on opponent's turn outside showdown", () => {
    expect(
      canPlaySpellAtTiming("action", { hasChain: false, isOwnerTurn: false, isShowdown: false }),
    ).toBe(false);
  });
});

describe("State: Deflect", () => {
  test("costs 1 rainbow per Deflect", () => {
    expect(getDeflectCost(1)).toBe(1);
  });

  test("stacks", () => {
    expect(getDeflectCost(3)).toBe(3);
  });

  test("no cost without Deflect", () => {
    expect(getDeflectCost(0)).toBe(0);
  });
});
