/**
 * Combat Resolver Tests
 *
 * Tests the MUTUAL SIMULTANEOUS DAMAGE model per rule 626:
 * Both sides deal their FULL Might as damage to the opposing side.
 */

import { describe, expect, test } from "bun:test";
import type { CombatUnit } from "../combat";
import { calculateSideMight, distributeDamage, resolveCombat } from "../combat";

function unit(
  id: string,
  might: number,
  keywords: string[] = [],
  damage = 0,
  owner = "p1",
  keywordValues?: Record<string, number>,
): CombatUnit {
  return { baseMight: might, currentDamage: damage, id, keywordValues, keywords, owner };
}

describe("Combat: Might Calculation", () => {
  test("sums base Might for defenders", () => {
    const defenders = [unit("a", 3), unit("b", 4)];
    expect(calculateSideMight(defenders, false)).toBe(7);
  });

  test("adds Assault bonus for attackers", () => {
    const attackers = [unit("a", 3, ["Assault"], 0, "p1", { Assault: 2 }), unit("b", 4)];
    expect(calculateSideMight(attackers, true)).toBe(9); // (3+2) + 4
  });

  test("Assault does not apply to defenders", () => {
    const defenders = [unit("a", 3, ["Assault"], 0, "p1", { Assault: 2 })];
    expect(calculateSideMight(defenders, false)).toBe(3);
  });

  test("Shield adds Might for defenders (rule 726)", () => {
    const defenders = [unit("a", 3, ["Shield"], 0, "p1", { Shield: 2 })];
    expect(calculateSideMight(defenders, false)).toBe(5); // 3 + 2
  });

  test("Shield does not apply to attackers", () => {
    const attackers = [unit("a", 3, ["Shield"], 0, "p1", { Shield: 2 })];
    expect(calculateSideMight(attackers, true)).toBe(3);
  });

  test("keyword value fallback counts occurrences when no keywordValues", () => {
    const attackers = [unit("a", 3, ["Assault"])];
    // No keywordValues → falls back to counting occurrences (1)
    expect(calculateSideMight(attackers, true)).toBe(4); // 3 + 1
  });
});

describe("Combat: Damage Distribution", () => {
  test("distributes full damage to units", () => {
    const units = [unit("a", 3), unit("b", 4)];
    const result = distributeDamage(units, 7);
    // Should distribute exactly 7 damage total
    const total = Object.values(result).reduce((sum, d) => sum + d, 0);
    expect(total).toBe(7);
  });

  test("Tank units receive damage first", () => {
    const units = [unit("a", 3), unit("b", 4, ["Tank"])];
    const result = distributeDamage(units, 5);
    // Tank unit (b) should receive lethal damage (4) first
    expect(result["b"]).toBe(4);
    expect(result["a"]).toBe(1);
  });

  test("lethal assigned before moving to next unit", () => {
    const units = [unit("a", 2), unit("b", 3)];
    const result = distributeDamage(units, 4);
    // First unit needs 2 to be lethal, then 2 remains for second
    expect(result["a"]).toBe(2);
    expect(result["b"]).toBe(2);
  });

  test("pre-existing damage reduces lethal threshold", () => {
    const units = [unit("a", 5, [], 3)]; // 5 might, 3 existing damage → needs 2 more
    const result = distributeDamage(units, 2);
    expect(result["a"]).toBe(2);
  });
});

describe("Combat: Mutual Simultaneous Damage (rule 626)", () => {
  test("both sides deal full Might as damage", () => {
    const attackers = [unit("a1", 5, [], 0, "p1")];
    const defenders = [unit("d1", 3, [], 0, "p2")];
    const result = resolveCombat(attackers, defenders);

    // Attacker deals full 5 Might to defender (even though defender only has 3 health)
    // Defender deals full 3 Might to attacker
    expect(result.damageAssignment["d1"]).toBe(5); // Full attacker Might
    expect(result.damageAssignment["a1"]).toBe(3); // Full defender Might
  });

  test("attacker wins when all defenders die and attacker survives", () => {
    const attackers = [unit("a1", 5, [], 0, "p1")];
    const defenders = [unit("d1", 3, [], 0, "p2")];
    const result = resolveCombat(attackers, defenders);

    // Defender takes 5 damage (>= 3 might) → killed
    // Attacker takes 3 damage (< 5 might) → survives
    expect(result.killed).toContain("d1");
    expect(result.killed).not.toContain("a1");
    expect(result.winner).toBe("attacker");
    expect(result.winningSurvivors).toContain("a1");
  });

  test("defender wins when all attackers die", () => {
    const attackers = [unit("a1", 2, [], 0, "p1")];
    const defenders = [unit("d1", 6, [], 0, "p2")];
    const result = resolveCombat(attackers, defenders);

    // Attacker deals 2 to defender (< 6 might) → defender survives
    // Defender deals 6 to attacker (>= 2 might) → attacker killed
    expect(result.killed).toContain("a1");
    expect(result.killed).not.toContain("d1");
    expect(result.winner).toBe("defender");
  });

  test("both sides survive → defender wins (attacker recalled)", () => {
    const attackers = [unit("a1", 5, [], 0, "p1")];
    const defenders = [unit("d1", 8, [], 0, "p2")];
    const result = resolveCombat(attackers, defenders);

    // Attacker deals 5 to defender (< 8) → survives
    // Defender deals 8 to attacker (>= 5) → killed
    expect(result.killed).toContain("a1");
    expect(result.winner).toBe("defender");
  });

  test("mutual kill → tie", () => {
    const attackers = [unit("a1", 3, [], 0, "p1")];
    const defenders = [unit("d1", 3, [], 0, "p2")];
    const result = resolveCombat(attackers, defenders);

    // Both deal 3 to each other, both have 3 might → both die
    expect(result.killed).toContain("a1");
    expect(result.killed).toContain("d1");
    expect(result.winner).toBe("tie");
  });

  test("Assault increases attacker damage dealt", () => {
    const attackers = [unit("a1", 3, ["Assault"], 0, "p1", { Assault: 2 })]; // 3+2=5 total
    const defenders = [unit("d1", 4, [], 0, "p2")];
    const result = resolveCombat(attackers, defenders);

    expect(result.attackerTotal).toBe(5);
    // Attacker deals 5 to defender (>= 4 might) → defender killed
    expect(result.killed).toContain("d1");
    // Defender deals 4 to attacker (>= 3 might) → attacker also killed
    expect(result.killed).toContain("a1");
  });

  test("Shield increases defender Might total (rule 726)", () => {
    const attackers = [unit("a1", 5, [], 0, "p1")];
    const defenders = [unit("d1", 3, ["Shield"], 0, "p2", { Shield: 2 })]; // 3+2=5 total

    const result = resolveCombat(attackers, defenders);

    expect(result.defenderTotal).toBe(5); // 3 base + 2 Shield
    // Defender deals 5 to attacker (>= 5 might) → attacker killed
    expect(result.killed).toContain("a1");
    // Attacker deals 5 to defender (>= 3 might) → defender also killed
    expect(result.killed).toContain("d1");
  });

  test("multiple units: damage distributed with Tank priority", () => {
    const attackers = [unit("a1", 6, [], 0, "p1")];
    const defenders = [unit("d1", 2, [], 0, "p2"), unit("d2", 3, ["Tank"], 0, "p2")];
    const result = resolveCombat(attackers, defenders);

    // Attacker total: 6, deals to defenders. Tank d2 first: 3 lethal, then d1: 2 lethal, 1 overflow to d2
    expect(result.damageAssignment["d2"]).toBeGreaterThanOrEqual(3); // Tank gets lethal first
    expect(result.damageAssignment["d1"]).toBeGreaterThanOrEqual(2); // D1 gets lethal
    expect(result.killed).toContain("d1");
    expect(result.killed).toContain("d2");
    expect(result.winner).toBe("attacker");
  });

  test("pre-existing damage counts toward kills", () => {
    const attackers = [unit("a1", 5, [], 0, "p1")];
    const defenders = [unit("d1", 5, [], 3, "p2")]; // 3 existing damage
    const result = resolveCombat(attackers, defenders);

    // Attacker deals 5 to defender → 3 + some of 5 → needs only 2 more for lethal
    // Defender deals 5 to attacker → attacker killed too
    expect(result.killed).toContain("d1");
    expect(result.killed).toContain("a1");
  });
});
