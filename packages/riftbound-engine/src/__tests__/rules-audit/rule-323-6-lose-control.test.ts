/**
 * Rules Audit: rule 323.6 / 187.4.c — lose Control of an empty Battlefield
 *
 *   323.6  — "If the turn is in an Open State, Battlefields with no Units
 *             occupying them and no Showdown or Combat ongoing become
 *             Uncontrolled."
 *   187.4.c — "If a player has no Units at a Battlefield and the turn is in an
 *             Open state, they lose Control of that Battlefield in the
 *             following cleanup, unless there is a Combat or Showdown ongoing
 *             there."
 *
 * The engine resolves this in the end-of-turn Cleanup phase (the canonical
 * Open-State cleanup): a Controlled battlefield that has zero units and is not
 * the active Showdown's battlefield is flipped to Uncontrolled. A battlefield
 * that still has a unit, or has an ongoing showdown, keeps its controller.
 * Note: a *staged* (Contested-but-not-opened) combat with no units present is
 * first destaged by rule 323.10, so the empty battlefield then loses control
 * as normal — only an *ongoing* (opened) combat/showdown locks control.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  advancePhase,
  createBattlefield,
  createCard,
  createMinimalGameState,
  getState,
} from "./helpers";
import type { CardId } from "../../types";

describe("Rule 323.6 / 187.4.c — empty Battlefield loses Control in Cleanup", () => {
  it("a Controlled battlefield with no units becomes Uncontrolled at end-of-turn Cleanup", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "ending" });
    createBattlefield(engine, "bf-empty", { controller: P1 });
    // No units placed at bf-empty.
    advancePhase(engine, "cleanup");
    expect(getState(engine).battlefields["bf-empty"]?.controller).toBeNull();
  });

  it("a Controlled battlefield that still has a friendly unit keeps its controller (187.4.a)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "ending" });
    createBattlefield(engine, "bf-held", { controller: P1 });
    createCard(engine, "guard" as CardId, {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-held",
    });
    advancePhase(engine, "cleanup");
    expect(getState(engine).battlefields["bf-held"]?.controller).toBe(P1);
  });

  it("a Contested battlefield with units from both players (a real staged combat) keeps its controller (187.4.b)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "ending" });
    createBattlefield(engine, "bf-contested", { contestedBy: P2, controller: P1 });
    // Mark contested explicitly.
    const internal = engine as unknown as {
      currentState: { battlefields: Record<string, { contested?: boolean }> };
    };
    internal.currentState.battlefields["bf-contested"].contested = true;
    // A staged combat needs units from two opposing players present.
    createCard(engine, "p1-unit" as CardId, {
      cardType: "unit",
      might: 2,
      owner: P1,
      zone: "battlefield-bf-contested",
    });
    createCard(engine, "p2-unit" as CardId, {
      cardType: "unit",
      might: 2,
      owner: P2,
      zone: "battlefield-bf-contested",
    });
    advancePhase(engine, "cleanup");
    expect(getState(engine).battlefields["bf-contested"]?.controller).toBe(P1);
    // Combat is still staged — both opposing players still present (rule 323.10).
    expect(getState(engine).battlefields["bf-contested"]?.contested).toBe(true);
  });

  it("an *empty* Contested battlefield destages the stale combat (rule 323.10) then loses control (187.4.c)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "ending" });
    createBattlefield(engine, "bf-stale", { contestedBy: P2, controller: P1 });
    const internal = engine as unknown as {
      currentState: { battlefields: Record<string, { contested?: boolean }> };
    };
    internal.currentState.battlefields["bf-stale"].contested = true;
    // No units present: the staged combat ceased being staged before opening.
    advancePhase(engine, "cleanup");
    const bf = getState(engine).battlefields["bf-stale"];
    expect(bf?.contested).toBe(false);
    expect(bf?.controller).toBeNull();
  });

  it("an already-Uncontrolled battlefield stays Uncontrolled (no spurious change)", () => {
    const engine = createMinimalGameState({ currentPlayer: P1, phase: "ending" });
    createBattlefield(engine, "bf-neutral", { controller: null });
    advancePhase(engine, "cleanup");
    expect(getState(engine).battlefields["bf-neutral"]?.controller ?? null).toBeNull();
  });
});
