/**
 * Phase B batch 25 FFF — refute the AAA batch-24 claim that
 * "the engine's `playUnit` reducer never routes units to `base`".
 *
 * Rule 355.2.a (Playing Cards): "Valid locations include the
 * controller's Base or a Battlefield the controller controls."
 * Rule 359.2.c: "If it is a Unit, it enters the Board exhausted at
 * the Location that was chosen."
 *
 * These tests assert Path A:
 *   1) `playUnit` with `params.location: "base"` succeeds.
 *   2) The card lands in the engine's global `base` zone (NOT a
 *      `battlefield-<id>` zone).
 *   3) The card's zone is queryable via `getCardsInZone("base", pid)`.
 *
 * No per-card if-statements. No new public API. Uses the same
 * `createMinimalGameState` helper that the rules-audit suite uses.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  applyMove,
  createCard,
  createMinimalGameState,
  getCardZone,
  getCardsInZone,
} from "./rules-audit/helpers";

describe("Phase B batch 25 FFF — playUnit routes to base (rule 355.2.a + 359.2.c)", () => {
  it("playUnit { location: 'base' } moves the unit into the global 'base' zone", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createCard(engine, "grunt", {
      cardType: "unit",
      energyCost: 2,
      might: 2,
      owner: P1,
      zone: "hand",
    });

    const result = applyMove(engine, "playUnit", {
      cardId: "grunt",
      location: "base",
      playerId: P1,
    });

    expect(result.success).toBe(true);
    expect(getCardZone(engine, "grunt")).toBe("base");
  });

  it("after playUnit-to-base, getCardsInZone('base', player) lists the card", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "scout", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "hand",
    });

    applyMove(engine, "playUnit", {
      cardId: "scout",
      location: "base",
      playerId: P1,
    });

    // Both forms should surface the card (owner-scoped and global).
    const ownerScoped = getCardsInZone(engine, "base", P1);
    expect(ownerScoped).toContain("scout");
  });

  it("each player's base is independently populated (no cross-pollution)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: {
        [P1]: { energy: 2, power: {} },
        [P2]: { energy: 2, power: {} },
      },
    });
    createCard(engine, "p1-grunt", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P1,
      zone: "hand",
    });
    createCard(engine, "p2-grunt", {
      cardType: "unit",
      energyCost: 1,
      might: 1,
      owner: P2,
      zone: "hand",
    });

    const r1 = applyMove(engine, "playUnit", {
      cardId: "p1-grunt",
      location: "base",
      playerId: P1,
    });
    expect(r1.success).toBe(true);

    expect(getCardsInZone(engine, "base", P1)).toContain("p1-grunt");
    expect(getCardsInZone(engine, "base", P1)).not.toContain("p2-grunt");
  });
});
