/**
 * Regression: tcg-test pass 1
 *
 * Bug A — `activeReplacements` was written by the effect executor's
 * `case "replacement"` but never consumed by `playUnit` / `playFromChampionZone`,
 * so Sun Disc (ogn-021-298) "the next unit you play this turn enters ready"
 * had no effect.
 *
 * Bug B — `playUnit` never enumerated the optional-additional-cost variant,
 * so Accelerate (ogn-010-298 Legion Rearguard) and "you may kill a friendly X
 * as an additional cost" (sfd-160-221 Zaun Punk) could never be paid and their
 * `paidAdditionalCost` payoff triggers could never fire.
 */

import { describe, expect, it } from "bun:test";
import {
  type AuditEngine,
  P1,
  applyMove,
  createCard,
  createMinimalGameState,
  enumerateLegalMoves,
  getCardZone,
  getState,
} from "./helpers";

/** Core-engine boolean flags live at `cardMetas[id].__flags.<flag>`. */
function getFlag(engine: AuditEngine, cardId: string, flag: string): boolean {
  const internal = engine as unknown as {
    internalState: { cardMetas: Record<string, { __flags?: Record<string, boolean> }> };
  };
  return internal.internalState.cardMetas[cardId]?.__flags?.[flag] ?? false;
}

// ---------------------------------------------------------------------------
// Bug A: runtime enters-ready replacement (Sun Disc ogn-021-298)
// ---------------------------------------------------------------------------

describe("Bug A: activeReplacements consumed by playUnit", () => {
  const installReplacement = (engine: ReturnType<typeof createMinimalGameState>) => {
    const internal = engine as unknown as { currentState: { activeReplacements?: unknown[] } };
    internal.currentState.activeReplacements = [
      {
        duration: "next",
        owner: P1,
        replaces: "enters-ready",
        sourceCardId: "sun-disc",
        target: { controller: "friendly", type: "unit" },
        type: "replacement",
      },
    ];
  };

  it("next unit enters ready and consumes the 'next'-duration entry", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 4, power: {} } },
    });
    createCard(engine, "grunt-a", { cardType: "unit", energyCost: 1, might: 1, owner: P1, zone: "hand" });
    createCard(engine, "grunt-b", { cardType: "unit", energyCost: 1, might: 1, owner: P1, zone: "hand" });
    installReplacement(engine);

    expect(applyMove(engine, "playUnit", { cardId: "grunt-a", location: "base", playerId: P1 }).success).toBe(true);
    expect(getFlag(engine, "grunt-a", "exhausted")).toBe(false);
    expect(getState(engine).activeReplacements).toHaveLength(0);

    expect(applyMove(engine, "playUnit", { cardId: "grunt-b", location: "base", playerId: P1 }).success).toBe(true);
    expect(getFlag(engine, "grunt-b", "exhausted")).toBe(true);
  });

  // rule-id: unl-052-219 — Nami, Headstrong hold: next unit played this turn
  // enters ready AND buffed; only the next one.
  it("buff rider readies and buffs only the next unit played", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 4, power: {} } },
    });
    createCard(engine, "grunt-a", { cardType: "unit", energyCost: 1, might: 1, owner: P1, zone: "hand" });
    createCard(engine, "grunt-b", { cardType: "unit", energyCost: 1, might: 1, owner: P1, zone: "hand" });
    const internal = engine as unknown as { currentState: { activeReplacements?: unknown[] } };
    internal.currentState.activeReplacements = [
      { buff: true, duration: "next", owner: P1, replaces: "enters-ready", sourceCardId: "nami", type: "replacement" },
    ];

    expect(applyMove(engine, "playUnit", { cardId: "grunt-a", location: "base", playerId: P1 }).success).toBe(true);
    expect(getFlag(engine, "grunt-a", "exhausted")).toBe(false);
    expect(getFlag(engine, "grunt-a", "buffed")).toBe(true);

    expect(applyMove(engine, "playUnit", { cardId: "grunt-b", location: "base", playerId: P1 }).success).toBe(true);
    expect(getFlag(engine, "grunt-b", "exhausted")).toBe(true);
    expect(getFlag(engine, "grunt-b", "buffed")).toBe(false);
  });

  it("does not apply to another player's replacement", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    createCard(engine, "grunt", { cardType: "unit", energyCost: 1, might: 1, owner: P1, zone: "hand" });
    const internal = engine as unknown as { currentState: { activeReplacements?: unknown[] } };
    internal.currentState.activeReplacements = [
      { duration: "next", owner: "player-2", replaces: "enters-ready", target: { type: "unit" } },
    ];

    applyMove(engine, "playUnit", { cardId: "grunt", location: "base", playerId: P1 });
    expect(getFlag(engine, "grunt", "exhausted")).toBe(true);
    expect(getState(engine).activeReplacements).toHaveLength(1);
  });

  it("playFromChampionZone also consumes the replacement", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: {} } },
    });
    createCard(engine, "champ", { cardType: "unit", energyCost: 2, might: 3, owner: P1, zone: "championZone" });
    installReplacement(engine);

    expect(applyMove(engine, "playFromChampionZone", { location: "base", playerId: P1 }).success).toBe(true);
    expect(getFlag(engine, "champ", "exhausted")).toBe(false);
    expect(getState(engine).activeReplacements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bug B: optional additional cost — Accelerate (rule 717)
// ---------------------------------------------------------------------------

describe("Bug B: Accelerate optional additional cost (ogn-010-298)", () => {
  const makeRearguard = (engine: ReturnType<typeof createMinimalGameState>) =>
    createCard(engine, "rearguard", {
      abilities: [
        { cost: { energy: 1, power: ["fury"] }, keyword: "Accelerate", type: "keyword" },
      ],
      cardType: "unit",
      energyCost: 2,
      might: 2,
      owner: P1,
      zone: "hand",
    });

  it("enumerator emits both unpaid and paid variants when affordable", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: { fury: 1 } } },
    });
    makeRearguard(engine);

    const moves = enumerateLegalMoves(engine, P1).filter((m) => m.moveId === "playUnit");
    expect(moves.some((m) => m.params?.paidAdditionalCost !== true)).toBe(true);
    expect(
      moves.some(
        (m) =>
          m.params?.paidAdditionalCost === true &&
          (m.params?.additionalCostSpec as { energy?: number })?.energy === 1,
      ),
    ).toBe(true);
  });

  it("enumerator omits the paid variant when the extra cost is unaffordable", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 2, power: {} } },
    });
    makeRearguard(engine);

    const moves = enumerateLegalMoves(engine, P1).filter((m) => m.moveId === "playUnit");
    expect(moves).toHaveLength(1);
    expect(moves[0]?.params?.paidAdditionalCost).toBeUndefined();
  });

  it("reducer with paidAdditionalCost:true deducts extra and enters ready", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 5, power: { fury: 2 } } },
    });
    makeRearguard(engine);

    const result = applyMove(engine, "playUnit", {
      additionalCostSpec: { energy: 1, power: ["fury"] },
      cardId: "rearguard",
      location: "base",
      paidAdditionalCost: true,
      playerId: P1,
    });
    expect(result.success).toBe(true);
    expect(getFlag(engine, "rearguard", "exhausted")).toBe(false);
    const pool = getState(engine).runePools[P1];
    expect(pool?.energy).toBe(2);
    expect(pool?.power.fury).toBe(1);
  });

  it("reducer without paidAdditionalCost enters exhausted", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 5, power: { fury: 2 } } },
    });
    makeRearguard(engine);

    applyMove(engine, "playUnit", { cardId: "rearguard", location: "base", playerId: P1 });
    expect(getFlag(engine, "rearguard", "exhausted")).toBe(true);
    expect(getState(engine).runePools[P1]?.energy).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Bug B: optional additional cost — kill a friendly X (Zaun Punk sfd-160-221)
// ---------------------------------------------------------------------------

describe("Bug B: kill-friendly-gear optional additional cost (sfd-160-221)", () => {
  const makeZaunPunk = (engine: ReturnType<typeof createMinimalGameState>) =>
    createCard(engine, "zaun-punk", {
      abilities: [
        { cost: { kill: { controller: "friendly", type: "gear" } }, type: "static" },
      ],
      cardType: "unit",
      energyCost: 3,
      might: 3,
      owner: P1,
      zone: "hand",
    });

  it("enumerator emits one paid variant per legal sacrifice target", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: {} } },
    });
    makeZaunPunk(engine);
    createCard(engine, "gear-a", { cardType: "gear", owner: P1, zone: "base" });
    createCard(engine, "gear-b", { cardType: "gear", owner: P1, zone: "base" });

    const moves = enumerateLegalMoves(engine, P1).filter((m) => m.moveId === "playUnit");
    const paid = moves.filter((m) => m.params?.paidAdditionalCost === true);
    expect(paid.map((m) => m.params?.sacrificeId).sort()).toEqual(["gear-a", "gear-b"]);
    expect(moves.some((m) => m.params?.paidAdditionalCost !== true)).toBe(true);
  });

  it("reducer trashes the sacrifice before playing the unit", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 3, power: {} } },
    });
    makeZaunPunk(engine);
    createCard(engine, "gear-a", { cardType: "gear", owner: P1, zone: "base" });

    const result = applyMove(engine, "playUnit", {
      cardId: "zaun-punk",
      location: "base",
      paidAdditionalCost: true,
      playerId: P1,
      sacrificeId: "gear-a",
    });
    expect(result.success).toBe(true);
    expect(getCardZone(engine, "gear-a")).toBe("trash");
    expect(getCardZone(engine, "zaun-punk")).toBe("base");
    // Kill-cost is not Accelerate — unit still enters exhausted.
    expect(getFlag(engine, "zaun-punk", "exhausted")).toBe(true);
  });
});
