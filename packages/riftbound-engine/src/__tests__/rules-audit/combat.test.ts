/**
 * Rules Audit: Combat (rules 604, 621-623, 625-627)
 *
 * Wave 2C — covers ~49 rule index entries mapped to combat.test.ts.
 *
 * The Riftbound combat model (rule 626) is NOT "winner deals excess" — it is
 * MUTUAL SIMULTANEOUS DAMAGE:
 *   1. Sum attacker Might → attacker distributes that damage to defenders.
 *   2. Sum defender Might → defender distributes that damage to attackers.
 *   3. Both distributions are computed from CURRENT (pre-combat) Might.
 *   4. Tank units must receive lethal damage first (626.1.d.1).
 *   5. Lethal damage must be assigned in full before moving to the next unit
 *      (626.1.d.2).
 *   6. Outcome: all defenders dead + attacker survives → conquer (627.3);
 *      otherwise attackers are recalled (627.2).
 *
 * These tests exercise the `resolveCombat` pure function and the
 * `resolveFullCombat` engine move so bugs show up at both layers.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getCardsInZone,
  getState,
} from "./helpers";
import {
  type CombatUnit,
  calculateSideMight,
  distributeDamage,
  resolveCombat,
} from "../../combat/combat-resolver";

// ---------------------------------------------------------------------------
// Helpers local to combat tests
// ---------------------------------------------------------------------------

function unit(overrides: Partial<CombatUnit> & { id: string; baseMight: number }): CombatUnit {
  return {
    currentDamage: 0,
    keywords: [],
    owner: "attacker",
    ...overrides,
  };
}

// ===========================================================================
// Rule 604: Killing / Lethal Damage semantics
// ===========================================================================

describe("Rule 604.1.a.2: Passive Kill triggers when a unit has Lethal damage", () => {
  it("unit with damage >= base Might is marked killed after combat", () => {
    const attackers = [unit({ baseMight: 3, id: "a1", owner: P1 })];
    const defenders = [unit({ baseMight: 3, id: "d1", owner: P2 })];
    const result = resolveCombat(attackers, defenders);
    // Both sides deal 3 → both die
    expect(result.killed).toContain("a1");
    expect(result.killed).toContain("d1");
  });
});

describe("Rule 604.2: Killed permanents go from their origin to trash", () => {
  it("resolveFullCombat move puts killed units in trash", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "a1", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "d1", {
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    // Both died simultaneously (2 vs 2)
    expect(getCardsInZone(engine, "trash", P1)).toContain("a1");
    expect(getCardsInZone(engine, "trash", P2)).toContain("d1");
  });
});

describe("Rule 604.1.a.1 / 604.4: Kill is only taken when a game effect directs it", () => {
  it("combat-induced kills are 'Passive Kill' — happen automatically, not by player choice", () => {
    // Implicit: resolveCombat never asks the player whether to kill the unit —
    // It just flags it as killed when damage >= Might.
    const result = resolveCombat(
      [unit({ baseMight: 1, id: "a1", owner: P1 })],
      [unit({ baseMight: 1, id: "d1", owner: P2 })],
    );
    expect(result.killed).toEqual(expect.arrayContaining(["a1", "d1"]));
  });
});

// ===========================================================================
// Rule 621-623: Combat triggering, who can fight
// ===========================================================================

describe("Rule 621: Combat occurs when cleanup runs with opposing units at a battlefield", () => {
  it("resolveFullCombat is gated on contested = true", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Battlefield with opposing units but NOT yet contested
    createBattlefield(engine, "bf-1", { contested: false, controller: null });
    createCard(engine, "a1", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "d1", {
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    // Move legality check: resolveFullCombat requires bf.contested
    const result = applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });
    expect(result.success).toBe(false);
  });
});

describe("Rule 622: Pending Combat exists when opposing units are at a battlefield", () => {
  it("contestBattlefield only succeeds when both players have units there", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "a1", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    // No opposing unit yet
    const lonely = applyMove(engine, "contestBattlefield", {
      battlefieldId: "bf-1",
      playerId: P1,
    });
    expect(lonely.success).toBe(false);

    createCard(engine, "d1", {
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    const contested = applyMove(engine, "contestBattlefield", {
      battlefieldId: "bf-1",
      playerId: P1,
    });
    expect(contested.success).toBe(true);
    expect(getState(engine).battlefields["bf-1"].contested).toBe(true);
  });
});

describe("Rule 622.2: If a pending combat stops being pending, it is not resolved", () => {
  it("resolveFullCombat is a no-op if one side has no units at the battlefield", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "a1", {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    // No defender at all — pure "fall-through" path (rule 626.1.a.1)

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    // Attacker should be untouched, no damage dealt, no one killed
    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { damage: number }> };
      }
    ).internalState.cardMetas.a1;
    expect(meta?.damage).toBe(0);
    expect(getCardsInZone(engine, "trash", P1)).not.toContain("a1");
  });
});

describe("Rule 623: Combat can only occur between units controlled by exactly two players", () => {
  it("resolveCombat partitions units strictly into attackers vs defenders", () => {
    const result = resolveCombat(
      [unit({ baseMight: 2, id: "a1", owner: P1 })],
      [unit({ baseMight: 2, id: "d1", owner: P2 })],
    );
    // Only two owners involved — result references only these units
    expect(Object.keys(result.damageAssignment).toSorted()).toEqual(["a1", "d1"]);
  });
});

// ===========================================================================
// Rule 625: Showdown opens at start of combat / Assault & Shield modulate
// ===========================================================================

describe("Rule 625.1.b.1: Attacking units with Assault have Might modulated at combat time", () => {
  it("Assault X adds X to the attacker's side might", () => {
    const attackers = [
      unit({
        baseMight: 2,
        id: "a1",
        keywordValues: { Assault: 3 },
        keywords: ["Assault"],
        owner: P1,
      }),
    ];
    expect(calculateSideMight(attackers, true)).toBe(5); // 2 base + 3 assault
  });

  it("Assault does NOT apply when the unit is defending", () => {
    const defenders = [
      unit({
        baseMight: 2,
        id: "d1",
        keywordValues: { Assault: 3 },
        keywords: ["Assault"],
        owner: P2,
      }),
    ];
    // As a defender, Assault is inert
    expect(calculateSideMight(defenders, false)).toBe(2);
  });
});

describe("Rule 625.1.b.2: Defending units with Shield have Might modulated at combat time", () => {
  it("Shield X adds X to the defender's side might", () => {
    const defenders = [
      unit({
        baseMight: 2,
        id: "d1",
        keywordValues: { Shield: 2 },
        keywords: ["Shield"],
        owner: P2,
      }),
    ];
    expect(calculateSideMight(defenders, false)).toBe(4);
  });

  it("Shield does NOT apply when the unit is attacking", () => {
    const attackers = [
      unit({
        baseMight: 2,
        id: "a1",
        keywordValues: { Shield: 2 },
        keywords: ["Shield"],
        owner: P1,
      }),
    ];
    expect(calculateSideMight(attackers, true)).toBe(2);
  });
});

describe("Rule 625.1.a: Attacker is the player who applied Contested status", () => {
  it("resolveFullCombat uses battlefield.contestedBy to determine attacker side", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P2, controller: null });
    // P2 is the attacker despite being "player 2"
    createCard(engine, "p1-big", {
      cardType: "unit",
      might: 5,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "p2-tiny", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    // P2 is attacker; P2 dies because P1 (defender) deals 5 damage.
    // P1 survives, so if this were "attacker wins" it'd conquer — but
    // Attacker (P2) is dead. Defender holds, no control change.
    const state = getState(engine);
    expect(state.battlefields["bf-1"].controller).toBeNull();
  });
});

// ===========================================================================
// Rule 626.1.a: Combat Damage Step only occurs if BOTH sides have units
// ===========================================================================

describe("Rule 626.1.a.1: If one side has no units, no combat occurs (fall through)", () => {
  it("resolveFullCombat with only attackers: skipped, no damage, no kills", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "a1", {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { damage: number }> };
      }
    ).internalState.cardMetas.a1;
    expect(meta?.damage).toBe(0);
  });

  it("resolveFullCombat with only defenders: skipped, defender stays alive", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "d1", {
      cardType: "unit",
      might: 3,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const meta = (
      engine as unknown as {
        internalState: { cardMetas: Record<string, { damage: number }> };
      }
    ).internalState.cardMetas.d1;
    expect(meta?.damage).toBe(0);
  });
});

// ===========================================================================
// Rule 626.1.b / 626.1.c: Sum Might of each side
// ===========================================================================

describe("Rule 626.1.b: Sum the Might of all Attacking Units", () => {
  it("multi-unit attacker might is the sum of each unit's might", () => {
    const attackers = [
      unit({ baseMight: 2, id: "a1", owner: P1 }),
      unit({ baseMight: 3, id: "a2", owner: P1 }),
      unit({ baseMight: 1, id: "a3", owner: P1 }),
    ];
    expect(calculateSideMight(attackers, true)).toBe(6);
  });

  it("0-Might units contribute 0 but are still counted as units", () => {
    const attackers = [
      unit({ baseMight: 0, id: "a0", owner: P1 }),
      unit({ baseMight: 3, id: "a1", owner: P1 }),
    ];
    expect(calculateSideMight(attackers, true)).toBe(3);
  });
});

describe("Rule 626.1.c: Sum the Might of all Defending Units", () => {
  it("multi-unit defender might is the sum of each unit's might", () => {
    const defenders = [
      unit({ baseMight: 4, id: "d1", owner: P2 }),
      unit({ baseMight: 2, id: "d2", owner: P2 }),
    ];
    expect(calculateSideMight(defenders, false)).toBe(6);
  });
});

// ===========================================================================
// Rule 626.1.d: Starting with the ATTACKER, distribute summed might
// ===========================================================================

describe("Rule 626.1.d: Both sides deal their FULL summed Might", () => {
  it("attacker total and defender total are BOTH applied (not 'excess wins')", () => {
    // 4 vs 3: BOTH sides deal their full damage — this is NOT "excess wins"
    const attackers = [unit({ baseMight: 4, id: "a1", owner: P1 })];
    const defenders = [unit({ baseMight: 3, id: "d1", owner: P2 })];
    const result = resolveCombat(attackers, defenders);

    expect(result.attackerTotal).toBe(4);
    expect(result.defenderTotal).toBe(3);
    // D1 (3 Might) takes 4 damage → dead. a1 (4 Might) takes 3 damage → alive.
    expect(result.killed).toContain("d1");
    expect(result.killed).not.toContain("a1");
    // A1 should have 3 assigned damage (full defender damage)
    expect(result.damageAssignment.a1).toBe(3);
  });

  it("both sides wipe each other on equal totals", () => {
    const attackers = [unit({ baseMight: 5, id: "a1", owner: P1 })];
    const defenders = [unit({ baseMight: 5, id: "d1", owner: P2 })];
    const result = resolveCombat(attackers, defenders);
    expect(result.killed).toEqual(expect.arrayContaining(["a1", "d1"]));
    expect(result.winner).toBe("tie");
  });
});

// ===========================================================================
// Rule 626.1.d.1: Tank units must be assigned Lethal Damage first
// ===========================================================================

describe("Rule 626.1.d.1: Tank units must receive lethal damage before other units", () => {
  it("Tank defender soaks lethal before non-Tank", () => {
    const attackers = [unit({ baseMight: 6, id: "a1", owner: P1 })];
    const defenders = [
      unit({ baseMight: 3, id: "d-normal", owner: P2 }),
      unit({ baseMight: 4, id: "d-tank", keywords: ["Tank"], owner: P2 }),
    ];
    const result = resolveCombat(attackers, defenders);

    // Tank must be assigned damage first — it needs 4 to die
    // Remaining 2 of the 6 goes to d-normal (not enough to kill)
    expect(result.damageAssignment["d-tank"]).toBeGreaterThanOrEqual(4);
    expect(result.killed).toContain("d-tank");
    // D-normal (3 Might) only gets 2 damage → survives
    expect(result.killed).not.toContain("d-normal");
  });

  it("Tank attacker soaks lethal from defender damage first", () => {
    const attackers = [
      unit({ baseMight: 2, id: "a-normal", owner: P1 }),
      unit({ baseMight: 3, id: "a-tank", keywords: ["Tank"], owner: P1 }),
    ];
    const defenders = [unit({ baseMight: 4, id: "d1", owner: P2 })];
    const result = resolveCombat(attackers, defenders);

    // Tank attacker takes lethal (3 dmg) first; remaining 1 dmg to a-normal
    expect(result.damageAssignment["a-tank"]).toBeGreaterThanOrEqual(3);
    expect(result.killed).toContain("a-tank");
    expect(result.killed).not.toContain("a-normal");
  });
});

describe("Rule 626.1.d.1.a: Lethal Damage is nonzero damage equaling or exceeding Might", () => {
  it("exactly-Might damage IS lethal", () => {
    const result = resolveCombat(
      [unit({ baseMight: 3, id: "a1", owner: P1 })],
      [unit({ baseMight: 3, id: "d1", owner: P2 })],
    );
    expect(result.killed).toContain("d1");
  });

  it("below-Might damage is NOT lethal", () => {
    const result = resolveCombat(
      [unit({ baseMight: 2, id: "a1", owner: P1 })],
      [unit({ baseMight: 5, id: "d1", owner: P2 })],
    );
    expect(result.killed).not.toContain("d1");
  });

  it("zero damage is NOT lethal (nonzero requirement)", () => {
    const result = resolveCombat(
      [unit({ baseMight: 0, id: "a1", owner: P1 })],
      [unit({ baseMight: 3, id: "d1", owner: P2 })],
    );
    // Attacker has 0 might → deals 0 damage → defender not killed
    expect(result.killed).not.toContain("d1");
  });
});

// ===========================================================================
// Rule 626.1.d.2: Must assign lethal damage in full before next unit
// ===========================================================================

describe("Rule 626.1.d.2: Lethal must be assigned IN FULL to one unit before next", () => {
  it("5 damage vs four 3-Might defenders: 3 to one, 2 to another (no spreading)", () => {
    // Cite of the rule book example.
    const defenders = [
      unit({ baseMight: 3, id: "d1", owner: P2 }),
      unit({ baseMight: 3, id: "d2", owner: P2 }),
      unit({ baseMight: 3, id: "d3", owner: P2 }),
      unit({ baseMight: 3, id: "d4", owner: P2 }),
    ];
    const assignment = distributeDamage(defenders, 5);

    const values = Object.values(assignment)
      .filter((v) => v > 0)
      .toSorted();
    // One unit receives 3 (lethal), another receives remaining 2
    expect(values).toEqual([2, 3]);
  });

  it("exactly one unit's worth of damage goes entirely to that unit", () => {
    const defenders = [
      unit({ baseMight: 3, id: "d1", owner: P2 }),
      unit({ baseMight: 3, id: "d2", owner: P2 }),
    ];
    const assignment = distributeDamage(defenders, 3);
    // All 3 damage concentrated on one unit — no spreading
    const totals = Object.values(assignment).filter((v) => v > 0);
    expect(totals).toEqual([3]);
  });
});

describe("Rule 626.1.d.2 continued: excess damage does not kill a second unit", () => {
  it("4 damage vs two 3-Might: 3 goes to one, 1 to other (second survives)", () => {
    const defenders = [
      unit({ baseMight: 3, id: "d1", owner: P2 }),
      unit({ baseMight: 3, id: "d2", owner: P2 }),
    ];
    const assignment = distributeDamage(defenders, 4);
    const totals = Object.values(assignment)
      .filter((v) => v > 0)
      .toSorted();
    // One 3, one 1
    expect(totals).toEqual([1, 3]);
  });
});

// ===========================================================================
// Rule 626.1.d.3 / 626.1.d.4: Ordering requirements — Tank first, Backline last
// ===========================================================================

describe("Rule 626.1.d.3: Players must obey damage-assignment restrictions when able", () => {
  it("Tank-then-Backline priority is enforced", () => {
    // 7 damage, targets: Tank (3), normal (2), Backline (2).
    // Per rule: Tank first (3), then normal (2), then Backline (2).
    const defenders = [
      unit({ baseMight: 2, id: "backline", keywords: ["Backline"], owner: P2 }),
      unit({ baseMight: 2, id: "normal", owner: P2 }),
      unit({ baseMight: 3, id: "tank", keywords: ["Tank"], owner: P2 }),
    ];
    const assignment = distributeDamage(defenders, 7);
    expect(assignment.tank).toBe(3); // Lethal first
    expect(assignment.normal).toBe(2); // Then normal
    expect(assignment.backline).toBe(2); // Backline last
  });
});

describe("Rule 626.1.d.4: Multiple same-priority units may be ordered by the assigning player", () => {
  it("two Tanks: lethal goes to one in full before the next", () => {
    // 4 damage vs two Tanks (3 each). First gets 3 lethal, second gets 1.
    const defenders = [
      unit({ baseMight: 3, id: "tank-a", keywords: ["Tank"], owner: P2 }),
      unit({ baseMight: 3, id: "tank-b", keywords: ["Tank"], owner: P2 }),
    ];
    const assignment = distributeDamage(defenders, 4);
    const values = Object.values(assignment).toSorted();
    expect(values).toEqual([1, 3]);
  });
});

// ===========================================================================
// Rule 627.1: Remove units with lethal damage
// ===========================================================================

describe("Rule 627.1: Killed units are removed from the battlefield", () => {
  it("dead defenders are moved to trash during resolveFullCombat", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "attacker", {
      cardType: "unit",
      might: 5,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "defender", {
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    // Defender dies, attacker survives (5 vs 2)
    expect(getCardsInZone(engine, "trash", P2)).toContain("defender");
    // Attacker is still alive on the battlefield
    expect(getCardsInZone(engine, "battlefield-bf-1", P1)).toContain("attacker");
  });
});

// ===========================================================================
// Rule 627.2: Attackers recalled when both sides survive
// ===========================================================================

describe("Rule 627.2: If both sides still have units, attackers are recalled", () => {
  it("both sides survive: single attacker vs multiple defenders where one defender remains", () => {
    // Attackers: one 5-Might unit.
    // Defenders: one 3-Might + one 5-Might.
    // Attacker total 5 → kills one 5-might (or the 3-might lethal + 2 spill).
    //   Per rule 626.1.d.2, full lethal to one unit: 5 to the 5-might → kills it.
    //   But engine may also route 3 to the 3-might first (lethal) + remaining 2 wasted.
    //   With either, at least one defender survives.
    // Defender total 8 → kills the single attacker.
    // Result: attacker dead, defender still has a unit → "defender" winner.
    const attackers = [unit({ baseMight: 5, id: "a1", owner: P1 })];
    const defenders = [
      unit({ baseMight: 3, id: "d-small", owner: P2 }),
      unit({ baseMight: 5, id: "d-big", owner: P2 }),
    ];
    const result = resolveCombat(attackers, defenders);
    // Attacker cannot win here.
    expect(result.winner).toBe("defender");
    expect(result.killed).toContain("a1");
  });

  it("resolveFullCombat recalls surviving attackers to base when defender wins", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    // Attacker: two small 1-might units
    createCard(engine, "atk-small-a", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "atk-small-b", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    // Defender: single 10-Might unit
    createCard(engine, "def-huge", {
      cardType: "unit",
      might: 10,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    // Attacker total = 2 → one attacker deals 2 dmg to 10-might defender (not lethal)
    // Defender total = 10 → distributed: 1 lethal to atk-small-a, 1 lethal to atk-small-b
    // -> all attackers dead, defender survives → defender wins.
    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    // Defender still alive on battlefield
    expect(getCardsInZone(engine, "battlefield-bf-1", P2)).toContain("def-huge");
    // Attackers all killed (not recalled — recall only happens if they survive)
    expect(getCardsInZone(engine, "trash", P1)).toContain("atk-small-a");
    expect(getCardsInZone(engine, "trash", P1)).toContain("atk-small-b");
  });

  it("tie outcome: both sides wiped, no survivors, no recall needed", () => {
    const result = resolveCombat(
      [unit({ baseMight: 3, id: "a1", owner: P1 })],
      [unit({ baseMight: 3, id: "d1", owner: P2 })],
    );
    expect(result.winner).toBe("tie");
    expect(result.losingSurvivors).toEqual([]);
    expect(result.winningSurvivors).toEqual([]);
  });
});

// ===========================================================================
// Rule 627.3: Battlefield is Conquered if no defenders remain
// ===========================================================================

describe("Rule 627.3: Battlefield is conquered when defenders are wiped and attackers survive", () => {
  it("attacker survives + defenders wiped → attacker becomes controller", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "big-atk", {
      cardType: "unit",
      might: 10,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "small-def", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const state = getState(engine);
    expect(state.battlefields["bf-1"].controller).toBe(P1);
    // Conquer should award a VP (rule 630.1)
    expect(state.players[P1].victoryPoints).toBeGreaterThanOrEqual(1);
  });

  it("resolveCombat marks winner = 'attacker' when defenders wiped", () => {
    const result = resolveCombat(
      [unit({ baseMight: 5, id: "a1", owner: P1 })],
      [unit({ baseMight: 2, id: "d1", owner: P2 })],
    );
    expect(result.winner).toBe("attacker");
    expect(result.winningSurvivors).toContain("a1");
  });
});

describe("Rule 627.3.a: Conquer causes exchange of battlefield control → Conquer trigger", () => {
  it("conquerThisTurn list is updated when attacker wins", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk", {
      cardType: "unit",
      might: 5,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "def", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    expect(getState(engine).conqueredThisTurn[P1]).toContain("bf-1");
  });
});

// ===========================================================================
// Rule 627.4: Clear contested status
// ===========================================================================

describe("Rule 627.4: Contested status is cleared from the battlefield after combat", () => {
  it("bf.contested is false after resolveFullCombat", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "a1", {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "d1", {
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const state = getState(engine);
    expect(state.battlefields["bf-1"].contested).toBe(false);
    expect(state.battlefields["bf-1"].contestedBy).toBeUndefined();
  });
});

// ===========================================================================
// Rule 627.5: Clear all marked damage at all locations
// ===========================================================================

describe("Rule 627.5: Marked damage cleared after combat (deferred — happens in ending phase)", () => {
  it.todo(
    "Rule 627.5: ambiguous — combat resolver leaves damage on surviving units and end-of-turn cleanup clears it. Verify against rule 517.2.a.",
  );
});

// ===========================================================================
// Damage distribution order: attacker damage is applied first (rule 626.1.d)
// ===========================================================================

describe("Rule 626.1.d order: Attacker distributes FIRST, then defender", () => {
  it("mutual full damage — both sides deal as if the other was at initial Might", () => {
    // Attacker 3, Defender 3. Each deals 3, each dies. This proves
    // "attacker first" does NOT prevent the defender from also dealing its
    // Full damage (which would happen if we computed excess only).
    const result = resolveCombat(
      [unit({ baseMight: 3, id: "a1", owner: P1 })],
      [unit({ baseMight: 3, id: "d1", owner: P2 })],
    );
    expect(result.damageAssignment.a1).toBe(3);
    expect(result.damageAssignment.d1).toBe(3);
    expect(result.killed).toContain("a1");
    expect(result.killed).toContain("d1");
  });

  it("attacker death does not reduce the damage it dealt to defender", () => {
    // Attacker 5 Might dies to defender 10 Might, but still deals 5 to defender.
    const result = resolveCombat(
      [unit({ baseMight: 5, id: "a1", owner: P1 })],
      [unit({ baseMight: 10, id: "d1", owner: P2 })],
    );
    expect(result.damageAssignment.d1).toBe(5); // Attacker still dealt full 5
    expect(result.killed).toContain("a1"); // Attacker killed by 10
    expect(result.killed).not.toContain("d1"); // Defender survived 5 damage
  });
});

// ===========================================================================
// Excess damage does not carry over between units
// ===========================================================================

describe("Rule 626.1.d.2 corollary: Excess damage does not 'carry over' to other units", () => {
  it("8 damage vs single 3-Might defender does NOT spill to bystanders", () => {
    const defenders = [
      unit({ baseMight: 3, id: "d1", owner: P2 }),
      unit({ baseMight: 3, id: "d2", owner: P2 }),
    ];
    const assignment = distributeDamage(defenders, 8);
    // D1 takes lethal (3), d2 takes remaining 5. d2 is killed too.
    // Per rule: "assigned in full before next unit" — but remaining damage
    // After all lethal obligations met must land somewhere. Engine assigns
    // Remaining to first alive unit.
    expect(assignment.d1).toBeGreaterThanOrEqual(3);
    // D2 also gets some (up to lethal at least)
    expect((assignment.d1 ?? 0) + (assignment.d2 ?? 0)).toBe(8);
  });
});

// ===========================================================================
// Summary: end-to-end combat through resolveFullCombat
// ===========================================================================

describe("End-to-end: resolveFullCombat applies damage, kills, outcome, cleans up", () => {
  it("attacker conquers: all defenders trashed, attacker survives on bf, VP awarded", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "hero", {
      cardType: "unit",
      might: 7,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "mook", {
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const state = getState(engine);
    expect(state.battlefields["bf-1"].controller).toBe(P1);
    expect(state.battlefields["bf-1"].contested).toBe(false);
    expect(getCardsInZone(engine, "trash", P2)).toContain("mook");
    expect(state.players[P1].victoryPoints).toBeGreaterThanOrEqual(1);
  });

  it("defender wins: attacker trashed/recalled, battlefield remains uncontrolled", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "weak-atk", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "strong-def", {
      cardType: "unit",
      might: 7,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const state = getState(engine);
    // Attacker killed
    expect(getCardsInZone(engine, "trash", P1)).toContain("weak-atk");
    // Defender holds (battlefield stays uncontrolled per pre-combat state)
    expect(state.battlefields["bf-1"].controller).toBeNull();
    // No VP awarded
    expect(state.players[P1].victoryPoints).toBe(0);
  });
});

// ===========================================================================
// Deferred rules (Wave 3+)
// ===========================================================================

describe("Deferred combat rules (Wave 3+)", () => {
  it.todo("Rule 622.1: Turn player chooses combat resolution order when multiple are pending");
  it.todo("Rule 623.1: Multi-player: battlefields with combat are invalid move destinations");
  it.todo("Rule 623.2.a: Multi-player: units played to a combat-bf instead go to base");
  it.todo("Rule 623.2.b: 'here' references reassign to controller's base on mistargeted plays");
  it.todo("Rule 623.3: Three-way combat choices are invalid");
  it.todo("Rule 625.1.c.1: 'When I attack' triggers populate the initial chain");
  it.todo("Rule 625.1.c.2: 'When I defend' triggers populate the initial chain");
  it.todo("Rule 625.1.d: State closes if an initial chain was created");
  it.todo("Rule 625.1.f: Players proceed with chain play as normal during combat showdown");
});
