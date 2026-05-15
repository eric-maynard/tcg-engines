/**
 * Rules Audit (Unleashed / CR 2026-03-30): showdown↔combat unification —
 * tick-8 deltas.
 *
 * Targets:
 *   - Rule 455 — a Combat occurs only when no Showdown or Combat is ongoing
 *     at any *other* Battlefield. `resolveFullCombat` at bf-A must be illegal
 *     while a showdown is active at bf-B.
 *   - Rule 456.1 — when more than one Battlefield has a Staged Combat at the
 *     same time, the Turn Player decides which to resolve first: both staged
 *     combats are enumerated (the move's `battlefieldId` param is the choice).
 *   - Rule 455.1 / 459.2 — if a Showdown is already ongoing at the battlefield
 *     where a combat is staged, that Showdown becomes a Combat Showdown
 *     (attacker = the player who applied Contested gains the designation and
 *     Focus).
 *   - Rule 461.7.b — all "this combat" effects expire simultaneously when the
 *     combat ends: `duration:"combat"` granted keywords AND the
 *     `combatMightModifier` accumulator are cleared by `resolveFullCombat`.
 *   - Rule 460.2.a/b + 140.x — combat damage is summed from each side's
 *     *current* Might (buffs / equipment / mightModifier / combatMightModifier),
 *     not printed Might.
 *
 * Methodology: minimal state → one input → assert rules-correct output → cite
 * the rule number.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  enumerateLegalMoves,
  getCardMeta,
  getEffectiveMight,
  getInteractionState,
  getState,
  setInteractionStateForTest,
} from "./helpers";
import { createInteractionState, getActiveShowdown, startShowdown } from "../../chain/chain-state";

function stagedCombatBfs(
  engine: ReturnType<typeof createMinimalGameState>,
): string[] {
  return enumerateLegalMoves(engine, P1)
    .filter((m) => m.moveId === "resolveFullCombat")
    .map((m) => (m.params as { battlefieldId: string }).battlefieldId)
    .toSorted();
}

// ===========================================================================
// Rule 455 — a Combat occurs only when no Showdown or Combat is ongoing
//            At any *other* Battlefield.
// ===========================================================================

describe("Rule 455: no Combat at a Battlefield while a Showdown is ongoing at another", () => {
  it("resolveFullCombat at bf-1 is illegal while a showdown is active at bf-2", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createBattlefield(engine, "bf-2", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "a1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "d1", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "a2", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-2" });
    createCard(engine, "d2", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-2" });

    // A showdown is ongoing at bf-2.
    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-2", P1, [P1, P2], true, P1, P2),
    );

    const r = applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });
    expect(r.success).toBe(false);
  });

  it("resolveFullCombat at the same battlefield as the active showdown IS legal", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "a1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "d1", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });

    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P1, [P1, P2], true, P1, P2),
    );

    const r = applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });
    expect(r.success).toBe(true);
  });

  it("with NO showdown anywhere, both staged combats are enumerated (rule 456.1: turn player picks)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createBattlefield(engine, "bf-2", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "a1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "d1", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "a2", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-2" });
    createCard(engine, "d2", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-2" });

    expect(stagedCombatBfs(engine)).toEqual(["bf-1", "bf-2"]);
  });

  it("with a showdown at bf-2, ONLY bf-2 is enumerated as a resolvable combat", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createBattlefield(engine, "bf-2", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "a1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "d1", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    createCard(engine, "a2", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-2" });
    createCard(engine, "d2", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-2" });

    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-2", P1, [P1, P2], true, P1, P2),
    );

    expect(stagedCombatBfs(engine)).toEqual(["bf-2"]);
  });
});

// ===========================================================================
// Rule 455.1 / 459.2 — a Showdown at the bf where a combat is staged becomes
//                      A Combat Showdown.
// ===========================================================================

describe("Rule 455.1 / 459.2: staging a combat at a bf with an ongoing Showdown promotes it to a Combat Showdown", () => {
  it("contestBattlefield flips a non-combat showdown at that bf to a combat showdown with attacker = contester", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: null });
    createCard(engine, "u1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "u2", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });

    // A non-combat showdown is ongoing at bf-1 (e.g. opened by an earlier move
    // To the empty bf), with P2 having Focus.
    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P2, [P1, P2], false),
    );
    expect(getActiveShowdown(getInteractionState(engine)!)?.isCombatShowdown).toBe(false);

    // P1 (turn player) applies Contested — combat is staged at bf-1.
    const r = applyMove(engine, "contestBattlefield", { battlefieldId: "bf-1", playerId: P1 });
    expect(r.success).toBe(true);

    const sd = getActiveShowdown(getInteractionState(engine)!);
    expect(sd?.isCombatShowdown).toBe(true);
    expect(sd?.attackingPlayer).toBe(P1);
    expect(sd?.defendingPlayer).toBe(P2);
    // Rule 459.2.b.1.a: the Attacker (P1) gains Focus as the combat showdown begins.
    expect(sd?.focusPlayer).toBe(P1);
  });

  it("contestBattlefield does NOT touch a showdown at a different battlefield", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { controller: null });
    createBattlefield(engine, "bf-2", { controller: null });
    createCard(engine, "u1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "u2", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });

    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-2", P2, [P1, P2], false),
    );

    applyMove(engine, "contestBattlefield", { battlefieldId: "bf-1", playerId: P1 });

    const sd = getActiveShowdown(getInteractionState(engine)!);
    expect(sd?.battlefieldId).toBe("bf-2");
    expect(sd?.isCombatShowdown).toBe(false);
  });
});

// ===========================================================================
// Rule 461.7.b — "this combat" effects expire when combat ends.
// ===========================================================================

describe("Rule 461.7.b: all 'this combat' effects expire simultaneously when combat ends", () => {
  it("a duration:'combat' granted keyword is cleared from a surviving combatant after resolveFullCombat", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk", {
      cardType: "unit",
      meta: { grantedKeywords: [{ duration: "combat", keyword: "Tank" }] },
      might: 5,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "def", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    // Atk survives (5 might beats 2). Its "this combat" Tank keyword is gone.
    const meta = getCardMeta(engine, "atk") as { grantedKeywords?: { keyword: string }[] };
    expect((meta.grantedKeywords ?? []).some((k) => k.keyword === "Tank")).toBe(false);
  });

  it("a duration:'turn' granted keyword SURVIVES combat end (only 'combat'-scoped expires)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk", {
      cardType: "unit",
      meta: { grantedKeywords: [{ duration: "turn", keyword: "Assault", value: 2 }] },
      might: 5,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "def", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const meta = getCardMeta(engine, "atk") as { grantedKeywords?: { keyword: string }[] };
    expect((meta.grantedKeywords ?? []).some((k) => k.keyword === "Assault")).toBe(true);
  });

  it("a 'this combat' Might modifier on a unit at a DIFFERENT battlefield also expires", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createBattlefield(engine, "bf-2", { controller: P1 });
    createCard(engine, "atk", { cardType: "unit", might: 5, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "def", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });
    // Bystander at another bf, buffed "this combat" by a Reaction during the showdown.
    createCard(engine, "bystander", {
      cardType: "unit",
      meta: { combatMightModifier: 3 },
      might: 2,
      owner: P1,
      zone: "battlefield-bf-2",
    });

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const meta = getCardMeta(engine, "bystander") as { combatMightModifier?: number };
    expect(meta.combatMightModifier ?? 0).toBe(0);
  });
});

// ===========================================================================
// Rule 460.2.a/b + 140.x — combat damage uses current (effective) Might.
// ===========================================================================

describe("Rule 460.2.a/b + 140.x: combat damage is summed from each side's current Might", () => {
  it("a buffed defender (printed 1, +1 buff = 2 Might) survives a 1-Might attacker that would kill the unbuffed unit", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    // Attacker: printed 1 Might → assigns 1 damage. Defender: printed 1 Might
    // But buffed (+1) = effective 2 → 1 damage is NOT lethal → survives.
    createCard(engine, "atk", { cardType: "unit", might: 1, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "def", {
      cardType: "unit",
      meta: { buffed: true },
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    expect(getEffectiveMight(engine, "def")).toBe(2);
    // Defender (effective 2 Might) assigns 2 to the attacker (printed 1) → lethal → atk dies.

    applyMove(engine, "resolveFullCombat", { battlefieldId: "bf-1" });

    const st = getState(engine);
    // Def survived → recalled? No: def is the defender, stays. atk killed.
    expect(st.battlefields["bf-1"].controller).toBe(P2);
  });

  it("getEffectiveMight folds combatMightModifier into the unit's Might", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createCard(engine, "u", {
      cardType: "unit",
      meta: { combatMightModifier: 2, mightModifier: 1 },
      might: 3,
      owner: P1,
      zone: "base",
    });
    expect(getEffectiveMight(engine, "u")).toBe(6);
  });
});
