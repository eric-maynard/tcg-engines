/**
 * Rules Audit: staged-combat housekeeping during a Cleanup (Core Rules
 * 2026-03-30) — rules 323.2 and 323.10 / 456.2.
 *
 *   323.2  — "Assign or Remove the Attacker or Defender designation from
 *             Units as needed if there is a Combat in progress."
 *   323.2.a — units present at the combat battlefield with no designation gain
 *             their controller's designation now.
 *   323.2.b — units present with the *opposite* designation of their
 *             controller lose it and gain the correct one.
 *   323.2.c — units at *other* battlefields holding an Attacker/Defender
 *             designation lose it now.
 *   323.10 / 456.2 — a staged Combat that has *not yet opened* (no Combat
 *             Showdown active there) stops being staged once units of two
 *             opposing players are no longer both present; clear the Contested
 *             status so a stale staged combat is never resolved.
 *
 * These run inside `performCleanup` (the engine's state-based check loop,
 * invoked after every move and at phase transitions).
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getCardMeta,
  getState,
  runCleanup,
} from "./helpers";
import type { CardId } from "../../types";

describe("Rule 323.2 — (re)assign Attacker/Defender designations during a Cleanup", () => {
  it("assigns a unit with no designation the same designation as its controller (323.2.a)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    // A real staged combat: Contested applied by P1 (Attacker), units from
    // Both players present.
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk-1" as CardId, {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "def-1" as CardId, {
      cardType: "unit",
      might: 3,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    // A unit that arrived after combat opened — no combatRole yet.
    createCard(engine, "atk-late" as CardId, {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    runCleanup(engine);

    expect(getCardMeta(engine, "atk-1" as CardId)?.combatRole).toBe("attacker");
    expect(getCardMeta(engine, "atk-late" as CardId)?.combatRole).toBe("attacker");
    expect(getCardMeta(engine, "def-1" as CardId)?.combatRole).toBe("defender");
  });

  it("corrects a unit holding the opposite designation of its controller (323.2.b)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk-1" as CardId, {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "def-1" as CardId, {
      cardType: "unit",
      might: 3,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    // P2's unit somehow holds the "attacker" designation — should be flipped.
    createCard(engine, "stray" as CardId, {
      cardType: "unit",
      meta: { combatRole: "attacker" },
      might: 2,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    runCleanup(engine);

    expect(getCardMeta(engine, "stray" as CardId)?.combatRole).toBe("defender");
  });

  it("clears a designation on a unit that is at a battlefield with no combat (323.2.c)", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-quiet", { controller: P1 });
    // A unit at a quiet battlefield that still carries a stale "attacker" role.
    createCard(engine, "wanderer" as CardId, {
      cardType: "unit",
      meta: { combatRole: "attacker" },
      might: 2,
      owner: P1,
      zone: "battlefield-bf-quiet",
    });

    runCleanup(engine);

    expect(getCardMeta(engine, "wanderer" as CardId)?.combatRole ?? null).toBeNull();
  });

  it("leaves a unit's designation untouched at a battlefield with an ongoing combat when it's already correct", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk-1" as CardId, {
      cardType: "unit",
      meta: { combatRole: "attacker" },
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "def-1" as CardId, {
      cardType: "unit",
      meta: { combatRole: "defender" },
      might: 3,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    const before = runCleanup(engine);
    expect(getCardMeta(engine, "atk-1" as CardId)?.combatRole).toBe("attacker");
    expect(getCardMeta(engine, "def-1" as CardId)?.combatRole).toBe("defender");
    // Combat is still staged — both opposing players present (323.10).
    expect(getState(engine).battlefields["bf-1"].contested).toBe(true);
    // (We don't assert `before.stateChanged` — other state-based passes may
    // Have run; the point is the designations are correct.)
    void before;
  });
});

describe("Rule 323.10 / 456.2 — a not-yet-opened staged combat ceases being staged", () => {
  it("clears Contested when only one player's units remain at the battlefield", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    // Only P1's unit present — the opposing units left before combat opened.
    createCard(engine, "atk-1" as CardId, {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    runCleanup(engine);

    const bf = getState(engine).battlefields["bf-1"];
    expect(bf.contested).toBe(false);
    expect(bf.contestedBy).toBeUndefined();
  });

  it("clears Contested when NO units remain at the battlefield", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    // No units present at all.

    runCleanup(engine);

    expect(getState(engine).battlefields["bf-1"].contested).toBe(false);
  });

  it("keeps Contested while units from two opposing players are both present", () => {
    const engine = createMinimalGameState({ phase: "main" });
    createBattlefield(engine, "bf-1", { contested: true, contestedBy: P1, controller: null });
    createCard(engine, "atk-1" as CardId, {
      cardType: "unit",
      might: 3,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "def-1" as CardId, {
      cardType: "unit",
      might: 3,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    runCleanup(engine);

    expect(getState(engine).battlefields["bf-1"].contested).toBe(true);
  });
});
