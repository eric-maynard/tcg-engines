/**
 * Rules Audit: playSpell enumeration of legal target tuples
 *
 * Phase B batch 25 DDD — the `playSpell` move enumerator now emits one legal
 * move per legal `{cardId, playerId, targets}` tuple (mirroring how `playUnit`
 * enumerates per `{cardId, location}`). This file pins that behaviour so the
 * SPA's TargetPicker can lock its options to engine-validated targets.
 *
 * Rules / shapes verified:
 *   - non-self target descriptor → one move per legal target id (rule 559.3)
 *   - "controller: enemy" filter excludes the caster's own units (rule 187)
 *   - self-target descriptor → exactly one move with `targets: []` (implicit)
 *   - no target descriptor      → exactly one move with `targets: []`
 *   - 0 legal targets           → spell is NOT enumerated (rule 537)
 *   - multi-target ("all")      → single move whose `targets` is every legal id
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  createBattlefield,
  createCard,
  createMinimalGameState,
  enumerateLegalMoves,
} from "./helpers";

function playSpellMoves(engine: ReturnType<typeof createMinimalGameState>, player: typeof P1) {
  return enumerateLegalMoves(engine, player).filter((m) => m.moveId === "playSpell");
}

describe("Phase B batch 25 DDD: playSpell enumerates one move per legal target", () => {
  it("enemy-unit-targeting spell enumerates one move per enemy unit only", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });

    // Two enemy units, one friendly unit on the same battlefield. The spell
    // Should enumerate exactly TWO moves — one per enemy id.
    createCard(engine, "friend-1", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "enemy-1", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "enemy-2", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    createCard(engine, "zap", {
      abilities: [
        {
          effect: {
            amount: 2,
            target: { controller: "enemy", type: "unit" },
            type: "damage",
          },
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const moves = playSpellMoves(engine, P1);
    expect(moves.length).toBe(2);
    const targets = moves
      .map((m) => ((m.params?.targets as string[]) ?? [])[0])
      .toSorted();
    expect(targets).toEqual(["enemy-1", "enemy-2"]);
    // Sanity: friendly is NOT enumerated as a legal target.
    expect(targets).not.toContain("friend-1");
  });

  it("self-target spell emits exactly one move with empty targets (implicit)", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "burn-self", {
      abilities: [
        { effect: { amount: 1, target: { type: "self" }, type: "damage" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const moves = playSpellMoves(engine, P1);
    expect(moves.length).toBe(1);
    expect(moves[0]?.params?.targets).toEqual([]);
  });

  it("no-target spell emits exactly one move with empty targets", () => {
    const engine = createMinimalGameState({
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createCard(engine, "draw-2", {
      abilities: [
        { effect: { amount: 2, type: "draw" }, type: "spell" },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const moves = playSpellMoves(engine, P1);
    expect(moves.length).toBe(1);
    expect(moves[0]?.params?.targets).toEqual([]);
  });

  it("spell with no legal targets is NOT enumerated (rule 537)", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });

    // ONLY a friendly unit on the board — but the spell wants an enemy.
    createCard(engine, "friend-1", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });

    createCard(engine, "zap", {
      abilities: [
        {
          effect: {
            amount: 2,
            target: { controller: "enemy", type: "unit" },
            type: "damage",
          },
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    expect(playSpellMoves(engine, P1).length).toBe(0);
  });

  it("multi-target (quantity: 'all') spell emits one move with all legal target ids", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });

    createCard(engine, "enemy-1", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "enemy-2", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    createCard(engine, "battle-royale", {
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "enemy", quantity: "all", type: "unit" },
            type: "damage",
          },
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const moves = playSpellMoves(engine, P1);
    expect(moves.length).toBe(1);
    const targets = (moves[0]?.params?.targets as string[]) ?? [];
    expect(targets.toSorted()).toEqual(["enemy-1", "enemy-2"]);
  });

  it("friendly-target spell enumerates one move per friendly unit", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });

    createCard(engine, "friend-a", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "friend-b", {
      cardType: "unit",
      might: 1,
      owner: P1,
      zone: "battlefield-bf-1",
    });
    createCard(engine, "enemy-1", {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });

    createCard(engine, "boost", {
      abilities: [
        {
          effect: {
            amount: 2,
            target: { controller: "friendly", type: "unit" },
            type: "buff",
          },
          type: "spell",
        },
      ],
      cardType: "spell",
      energyCost: 1,
      owner: P1,
      zone: "hand",
    });

    const moves = playSpellMoves(engine, P1);
    const targets = moves
      .map((m) => ((m.params?.targets as string[]) ?? [])[0])
      .toSorted();
    expect(targets).toEqual(["friend-a", "friend-b"]);
  });
});
