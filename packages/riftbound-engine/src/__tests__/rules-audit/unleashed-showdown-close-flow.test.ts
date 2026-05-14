/**
 * Rules Audit (Unleashed / CR 2026-03-30): the Steps of Combat as real flow
 * steps + the Non-Combat-Showdown close hook (tick-9).
 *
 * Targets:
 *   - Rule 458-461 / 348.1 — the Combat Showdown Step (Step 1) IS the Focus
 *     window of a Combat Showdown. When all players pass Focus (rule 347.3.a),
 *     the Combat Showdown closes and the engine proceeds with the remaining
 *     Steps of Combat (Step 2 Combat Damage + Step 3 Resolution) automatically:
 *     damage resolves, units die, the winner Establishes Control / Conquers,
 *     the Contested status clears. Previously combat only resolved via the
 *     explicit `resolveFullCombat` move; now closing the Combat Showdown does
 *     it — so Reactions played *during* the Combat Showdown happen before
 *     Combat Damage, as the rules require.
 *   - Rule 348.2 / 348.2.a.1 — when a *Non-Combat* Showdown closes (all
 *     players passed Focus): if exactly one player's Units remain at the
 *     battlefield and they don't already Control it, that player Establishes
 *     Control — a Conquer (1 VP) if they haven't scored that battlefield this
 *     turn.
 *   - Rule 461.1.a.1 / 461.7.b — combat-damage healing + "this combat"
 *     expiry still happen on the showdown-close path (same shared core as
 *     `resolveFullCombat`).
 *
 * Methodology: minimal state → pass focus to close the showdown → assert the
 * rules-correct downstream state → cite the rule number.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getCardMeta,
  getCardZone,
  getState,
  setInteractionStateForTest,
} from "./helpers";
import { createInteractionState, getActiveShowdown, startShowdown } from "../../chain/chain-state";

/** Pass Focus by both players in sequence so the active showdown closes. */
function closeShowdown(engine: ReturnType<typeof createMinimalGameState>): void {
  const sd1 = getActiveShowdown(getState(engine).interaction!);
  const first = sd1!.focusPlayer;
  const second = sd1!.relevantPlayers.find((p) => p !== first)!;
  const r1 = applyMove(engine, "passShowdownFocus", { playerId: first });
  expect(r1.success).toBe(true);
  const r2 = applyMove(engine, "passShowdownFocus", { playerId: second });
  expect(r2.success).toBe(true);
}

// ===========================================================================
// Rule 458-461 / 348.1 — closing a Combat Showdown proceeds with Combat
//                        Damage + Resolution automatically.
// ===========================================================================

describe("Rule 348.1 / 458-461: closing a Combat Showdown resolves combat", () => {
  it("attacker (3 Might) vs defender (2 Might): closing the combat showdown kills the defender and conquers the bf", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "def", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });

    // A Combat Showdown is open at bf-1 (rule 459: opened as Step 1 of Combat).
    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P1, [P1, P2], true, P1, P2),
    );

    closeShowdown(engine);

    const st = getState(engine);
    // Defender (2 Might) takes 3 → lethal → dead → trash.
    expect(getCardZone(engine, "def")).toBe("trash");
    // Attacker survives (3 Might took 2 < 3) and conquers (rule 461.5.d).
    expect(getCardZone(engine, "atk")).toBe("battlefield-bf-1");
    expect(st.battlefields["bf-1"].controller).toBe(P1);
    // Contested cleared (rule 461.5.a) — combat is over.
    expect(st.battlefields["bf-1"].contested).toBe(false);
    // Conquer awarded 1 VP (rule 630.1 / 464.1).
    expect(st.players[P1].victoryPoints).toBe(1);
    // The showdown was popped.
    expect(getActiveShowdown(st.interaction!)).toBeNull();
  });

  it("mutual kill (3 v 3): closing the combat showdown kills both, no winner; battlefield stays uncontrolled, no VP", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "def", { cardType: "unit", might: 3, owner: P2, zone: "battlefield-bf-1" });

    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P1, [P1, P2], true, P1, P2),
    );

    closeShowdown(engine);

    const st = getState(engine);
    // Both 3-Might units take 3 → lethal → both leave the battlefield (dead).
    expect(getCardZone(engine, "atk")).not.toBe("battlefield-bf-1");
    expect(getCardZone(engine, "def")).not.toBe("battlefield-bf-1");
    // "No Result" (rule 461.3.d) — combat over, control unchanged, no VP.
    expect(st.battlefields["bf-1"].contested).toBe(false);
    expect(st.battlefields["bf-1"].controller).toBeNull();
    expect(st.players[P1].victoryPoints).toBe(0);
    expect(st.players[P2].victoryPoints).toBe(0);
    expect(getActiveShowdown(st.interaction!)).toBeNull();
  });

  it("rule 461.7.b: a duration:'combat' granted keyword on a surviving combatant is cleared when the combat showdown closes", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk", {
      cardType: "unit",
      meta: { grantedKeywords: [{ duration: "combat", keyword: "Tank" }] },
      might: 5,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "def", { cardType: "unit", might: 1, owner: P2, zone: "battlefield-bf-1" });

    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P1, [P1, P2], true, P1, P2),
    );

    closeShowdown(engine);

    const st = getState(engine);
    // Attacker (5 Might) survives; its "this combat" Tank keyword is gone.
    expect(getCardZone(engine, "atk")).toBe("battlefield-bf-1");
    void st;
    const gks = (getCardMeta(engine, "atk")?.grantedKeywords ?? []) as { duration?: string }[];
    expect(gks.some((k) => k.duration === "combat")).toBe(false);
  });
});

// ===========================================================================
// Rule 348.2 — closing a Non-Combat Showdown: sole survivor Establishes
//              Control (Conquer if not yet scored this turn).
// ===========================================================================

describe("Rule 348.2: closing a Non-Combat Showdown establishes control / conquers", () => {
  it("sole survivor that doesn't control the bf: closing the non-combat showdown conquers it (1 VP)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: false, controller: null });
    createCard(engine, "u1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });

    // A non-combat showdown is open at bf-1 (e.g. unit moved to an uncontrolled bf).
    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P1, [P1, P2], false, P1, P2),
    );

    closeShowdown(engine);

    const st = getState(engine);
    expect(st.battlefields["bf-1"].controller).toBe(P1);
    expect(st.players[P1].victoryPoints).toBe(1); // Rule 348.2.a.1 Conquer
    expect((st.scoredThisTurn[P1] ?? []).includes("bf-1")).toBe(true);
    expect(getActiveShowdown(st.interaction!)).toBeNull();
  });

  it("sole survivor that ALREADY controls the bf: closing the non-combat showdown does not re-conquer (no VP)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: false, controller: P1 });
    createCard(engine, "u1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });

    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P1, [P1, P2], false, P1, P2),
    );

    closeShowdown(engine);

    const st = getState(engine);
    expect(st.battlefields["bf-1"].controller).toBe(P1);
    expect(st.players[P1].victoryPoints).toBe(0);
  });

  it("both players still have units: closing the non-combat showdown does NOT change control (rule 348.2.a)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: false, controller: null });
    createCard(engine, "u1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "u2", { cardType: "unit", might: 2, owner: P2, zone: "battlefield-bf-1" });

    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P1, [P1, P2], false, P1, P2),
    );

    closeShowdown(engine);

    const st = getState(engine);
    expect(st.battlefields["bf-1"].controller).toBeNull();
    expect(st.players[P1].victoryPoints).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Remaining (spec'd, not yet modelled): the Steps of Combat as *discrete
  // Flow phases* with their own Outstanding-Tasks lists, rather than the
  // Current shared `runCombatResolution` core invoked by a move / showdown
  // Close. Today: Step 1 (Combat Showdown) = the showdown Focus window;
  // Steps 2-3 (Combat Damage + Resolution) = `runCombatResolution`, run
  // Atomically when the Combat Showdown closes. A fuller model would make each
  // An addressable flow phase so a `.todo()` can pin the inter-step chain
  // Windows (rule 459.2.d, 460.2.c order-of-assignment effects).
  // -------------------------------------------------------------------------
  it.todo("Step 2: Combat Damage as a discrete flow phase with its own task list (rule 460)", () => {
    expect(true).toBe(true);
  });
  it.todo("Step 3: Resolution as a discrete flow phase with its own task list (rule 461)", () => {
    expect(true).toBe(true);
  });

  it("non-combat showdown closing does NOT touch a battlefield with a real staged combat (units from both players)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    // A real staged combat needs units from two opposing players present
    // (rule 456 / 323.10) — otherwise the stale Contested flag is destaged.
    createCard(engine, "u1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });
    createCard(engine, "u2", { cardType: "unit", might: 3, owner: P2, zone: "battlefield-bf-1" });

    // Edge: a non-combat showdown stack entry pointing at a Contested bf.
    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P1, [P1, P2], false, P1, P2),
    );

    closeShowdown(engine);

    const st = getState(engine);
    // EstablishNonCombatShowdownControl is a no-op when bf.contested, and the
    // Combat stays staged because both opposing players are still present.
    expect(st.battlefields["bf-1"].controller).toBeNull();
    expect(st.battlefields["bf-1"].contested).toBe(true);
    expect(st.players[P1].victoryPoints).toBe(0);
  });

  it("a stale Contested flag (no opposing units) is destaged by rule 323.10 / 456.2 on the next cleanup", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "u1", { cardType: "unit", might: 3, owner: P1, zone: "battlefield-bf-1" });

    setInteractionStateForTest(
      engine,
      startShowdown(createInteractionState(), "bf-1", P1, [P1, P2], false, P1, P2),
    );

    closeShowdown(engine);

    // The staged combat stopped being staged before it opened: no opposing
    // Units are present (rule 323.10 / 456.2).
    expect(getState(engine).battlefields["bf-1"].contested).toBe(false);
  });
});
