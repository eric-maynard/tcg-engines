/**
 * Rules Audit (Unleashed / CR 2026-03-30): showdown↔combat unification +
 * Legion-gated activated abilities.
 *
 * This suite targets the showdown↔combat delta items fixed in tick 4:
 *   - Rule 461.1.a.1 — Combat Cleanup "Heal all Units": combat damage does
 *     not persist past the combat that dealt it; survivors heal at the
 *     Resolution Step.
 *   - Rule 461.3.a — a player wins a combat if they are the SOLE player with
 *     units remaining at the battlefield during the Resolution Step (so a
 *     surviving defender, after the attackers are recalled per 461.1.a.2,
 *     wins and Establishes Control).
 *   - Rule 461.5 / 461.5.d — Establishing Control is a Conquer if that player
 *     has not yet scored the battlefield this turn.
 *   - Rule 185 / 461.5 — control of a battlefield cannot change while a
 *     combat (Contested status) is in progress / staged there.
 *   - Rule 564 / 724 / 812 — an activated ability with a `[Legion]` clause
 *     carries `condition:{type:"legion"}`; it can only be activated if its
 *     controller played another card this turn.
 *
 * Methodology: minimal state → one input → assert rules-correct output → cite
 * the rule number.
 */

import { describe, expect, it } from "bun:test";
import type { ActivatedAbility } from "@tcg/riftbound-types";
import {
  P1,
  P2,
  applyMove,
  checkMoveLegal,
  createBattlefield,
  createCard,
  createMinimalGameState,
  enumerateLegalMoves,
  getCardMeta,
  getCardsInZone,
  getState,
  runCleanup,
  setCardsPlayedThisTurn,
} from "./helpers";
import { type CombatUnit, resolveCombat } from "../../combat/combat-resolver";

function unit(overrides: Partial<CombatUnit> & { id: string; baseMight: number }): CombatUnit {
  return { currentDamage: 0, keywords: [], owner: "attacker", ...overrides };
}

/** Legal moves of a given name for a player, with params flattened. */
function legalMovesNamed(
  engine: ReturnType<typeof createMinimalGameState>,
  moveName: string,
  player: typeof P1,
): Record<string, unknown>[] {
  return enumerateLegalMoves(engine, player)
    .filter((m) => m.moveId === moveName)
    .map((m) => m.params ?? {});
}

// ===========================================================================
// Rule 461.1.a.1 — Combat Cleanup "Heal all Units"
// ===========================================================================

describe("Rule 461.1.a.1: Heal all Units after combat (combat damage does not persist)", () => {
  it("a surviving attacker has its combat damage cleared at the Resolution Step", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    // Attacker 5 might: deals 5 to the defender (killed), takes 2 back (survives).
    createCard(engine, "atk", { cardType: "unit", might: 5, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "def", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    // Attacker survived and conquered.
    expect(getCardsInZone(engine, "battlefield-bf-1", P1)).toContain("atk");
    expect(getState(engine).battlefields["bf-1"].controller).toBe(P1);
    // Rule 461.1.a.1: the 2 combat damage it took is healed away.
    const meta = getCardMeta(engine, "atk") as
      | { damage?: number; __counters?: Record<string, number> }
      | undefined;
    expect(meta?.damage ?? 0).toBe(0);
    expect(meta?.__counters?.damage ?? 0).toBe(0);
  });

  it("a surviving defender (after attackers recalled) is healed too", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Defender already controls the battlefield.
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: P2 });
    // Weak attacker 1 might: deals 1 to the 3-might defender (survives), takes 3 (killed).
    createCard(engine, "atk", { cardType: "unit", might: 1, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "def", { cardType: "unit", might: 3, owner: P2, zone: "battlefield-bf-1" });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    expect(getCardsInZone(engine, "trash", P1)).toContain("atk");
    expect(getCardsInZone(engine, "battlefield-bf-1", P2)).toContain("def");
    // Defender keeps control (already controlled it) and is healed (rule 461.1.a.1).
    expect(getState(engine).battlefields["bf-1"].controller).toBe(P2);
    const meta = getCardMeta(engine, "def") as
      | { damage?: number; __counters?: Record<string, number> }
      | undefined;
    expect(meta?.damage ?? 0).toBe(0);
    expect(meta?.__counters?.damage ?? 0).toBe(0);
  });
});

// ===========================================================================
// Rule 461.3 — Resolution Step result determination ("sole remaining player")
// ===========================================================================

describe("Rule 461.3: combat result is decided by who is the SOLE player with units remaining", () => {
  it("resolveCombat returns 'defender' (holds) when defender survives and attacker survives — attackers are recalled", () => {
    // Both 3-might units deal 3 to each other → both die. That's "tie".
    const tieResult = resolveCombat([unit({ baseMight: 3, id: "a" })], [unit({ baseMight: 3, id: "d" })]);
    expect(tieResult.winner).toBe("tie");

    // A 1-might attacker vs a 5-might defender: attacker deals 1 (def survives),
    // Def deals 5 (atk dies). Only defender has units remaining → defender won.
    const defResult = resolveCombat(
      [unit({ baseMight: 1, id: "a" })],
      [unit({ baseMight: 5, id: "d" })],
    );
    expect(defResult.winner).toBe("defender");
    expect(defResult.winningSurvivors).toEqual(["d"]);
  });

  it("resolveCombat returns 'attacker' (conquers) only when defenders are wiped and an attacker survives (rule 461.3.a)", () => {
    const r = resolveCombat([unit({ baseMight: 5, id: "a" })], [unit({ baseMight: 2, id: "d" })]);
    expect(r.winner).toBe("attacker");
    expect(r.winningSurvivors).toEqual(["a"]);
  });
});

describe("Rule 461.5.d: defender Establishing Control over an Uncontrolled battlefield is a Conquer", () => {
  it("defender survives at an Uncontrolled battlefield → gains control + 1 VP", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk", { cardType: "unit", might: 1, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "def", { cardType: "unit", might: 7, owner: P2, zone: "battlefield-bf-1" });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const state = getState(engine);
    expect(getCardsInZone(engine, "trash", P1)).toContain("atk");
    expect(state.battlefields["bf-1"].controller).toBe(P2);
    expect(state.players[P2].victoryPoints).toBeGreaterThanOrEqual(1);
    // Recorded as conquered + scored this turn so it isn't double-scored.
    expect(state.conqueredThisTurn[P2] ?? []).toContain("bf-1");
    expect(state.scoredThisTurn[P2] ?? []).toContain("bf-1");
  });

  it("defender that already controls the battlefield does NOT gain a VP (already scored / held)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: P2 });
    createCard(engine, "atk", { cardType: "unit", might: 1, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "def", { cardType: "unit", might: 7, owner: P2, zone: "battlefield-bf-1" });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const state = getState(engine);
    expect(state.battlefields["bf-1"].controller).toBe(P2);
    expect(state.players[P2].victoryPoints).toBe(0);
  });
});

// ===========================================================================
// Rule 185 / 461.5 — control locked while a combat (Contested) is in progress
// ===========================================================================

describe("Rule 185 / 461.5: control of a battlefield is locked while a combat is staged there", () => {
  it("conquerBattlefield is illegal at a battlefield with the Contested status", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    // P1 has a unit there; no opposing unit (so the `!hasOpponentUnit` test
    // Alone would let the conquer through) — the Contested lock must block it.
    createCard(engine, "u1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });

    expect(checkMoveLegal(engine, "conquerBattlefield", { battlefieldId: "bf-1", playerId: P1 })).toBe(
      false,
    );
    const conquers = legalMovesNamed(engine, "conquerBattlefield", P1);
    expect(conquers.find((m) => m.battlefieldId === "bf-1")).toBeUndefined();
  });

  it("conquerBattlefield IS legal once the battlefield is no longer Contested", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: false, controller: null });
    createCard(engine, "u1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    expect(checkMoveLegal(engine, "conquerBattlefield", { battlefieldId: "bf-1", playerId: P1 })).toBe(
      true,
    );
  });
});

// ===========================================================================
// Rule 564 / 724 / 812 — Legion-gated activated abilities
// ===========================================================================

describe("Rule 564 / 724 / 812: an activated ability with condition:{type:'legion'} requires a prior card-play this turn", () => {
  function makeEngine(playedCount: number): ReturnType<typeof createMinimalGameState> {
    const engine = createMinimalGameState({ phase: "main" });
    const ability: ActivatedAbility = {
      condition: { type: "legion" },
      cost: { exhaust: true },
      effect: { amount: 1, type: "draw" },
      type: "activated",
    };
    createCard(engine, "legionnaire", {
      abilities: [ability],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    setCardsPlayedThisTurn(engine, P1, playedCount);
    return engine;
  }

  it("is NOT legal when the controller has not played another card this turn (rule 724.1.c)", () => {
    const engine = makeEngine(0);
    expect(
      checkMoveLegal(engine, "activateAbility", { abilityIndex: 0, cardId: "legionnaire", playerId: P1 }),
    ).toBe(false);
    const moves = legalMovesNamed(engine, "activateAbility", P1);
    expect(moves.find((m) => m.cardId === "legionnaire")).toBeUndefined();
  });

  it("IS legal once the controller has played another card this turn", () => {
    const engine = makeEngine(1);
    expect(
      checkMoveLegal(engine, "activateAbility", { abilityIndex: 0, cardId: "legionnaire", playerId: P1 }),
    ).toBe(true);
    const moves = legalMovesNamed(engine, "activateAbility", P1);
    expect(moves.find((m) => m.cardId === "legionnaire")).toBeDefined();
  });

  it("an activated ability WITHOUT a Legion condition is unaffected by the prior-play count", () => {
    const engine = createMinimalGameState({ phase: "main" });
    const ability: ActivatedAbility = {
      cost: { exhaust: true },
      effect: { amount: 1, type: "draw" },
      type: "activated",
    };
    createCard(engine, "plain", {
      abilities: [ability],
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "base",
    });
    setCardsPlayedThisTurn(engine, P1, 0);
    expect(
      checkMoveLegal(engine, "activateAbility", { abilityIndex: 0, cardId: "plain", playerId: P1 }),
    ).toBe(true);
  });
});

// ===========================================================================
// Rule 323.2 / 521 — Attacker/Defender designation re-assignment in Cleanup
// ===========================================================================

describe("Rule 323.2/521: combat designations only persist while a combat is ongoing at the battlefield", () => {
  it("a unit at a NON-contested battlefield loses its Attacker designation on cleanup", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // Battlefield exists but no combat staged (not contested).
    createBattlefield(engine, "bf-1", { contested: false, controller: P1 });
    createCard(engine, "atk", {
      cardType: "unit",
      meta: { combatRole: "attacker" },
      might: 4,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    runCleanup(engine);

    const meta = getCardMeta(engine, "atk") as { combatRole?: string | null } | undefined;
    // Rule 323.2: the combat that established the designation is over → cleared.
    expect(meta?.combatRole ?? null).toBeNull();
  });

  it("a unit at a CONTESTED battlefield (combat staged) keeps its Defender designation", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: P2 });
    createCard(engine, "def", {
      cardType: "unit",
      meta: { combatRole: "defender" },
      might: 4,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    // Avoid an opposing-unit pair triggering combatPending side effects.

    runCleanup(engine);

    const meta = getCardMeta(engine, "def") as { combatRole?: string | null } | undefined;
    // The combat at this battlefield is still ongoing → designation persists.
    expect(meta?.combatRole ?? null).toBe("defender");
  });

  it("a unit that moved away from its combat (now at Base) loses its designation", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "wanderer", {
      cardType: "unit",
      meta: { combatRole: "attacker" },
      might: 3,
      owner: P1,
      zone: "base",
    });

    runCleanup(engine);

    const meta = getCardMeta(engine, "wanderer") as { combatRole?: string | null } | undefined;
    expect(meta?.combatRole ?? null).toBeNull();
  });
});
