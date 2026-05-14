/**
 * Phase B batch 26 HHH — multi-target `playSpell` per-subset enumeration.
 *
 * DDD (batch 25) wired single-target enumeration. For multi-target spells
 * the enumerator previously emitted ONE move with the FULL candidate set,
 * which makes a SPA multi-pick UX impossible (the client can't tell which
 * subsets are legal). HHH extends the enumerator to emit one legal-move
 * per legal target subset, with combinatorial-blowup protection.
 *
 * Quantity kinds and emission formula (K = legal candidates):
 *   - { upTo: N }     → every subset of sizes 0..min(N, K)
 *   - { atLeast: N }  → every subset of sizes min(N, K)..K
 *   - numeric N (>1)  → every subset of EXACTLY size min(N, K)
 *
 * When the subset count exceeds MAX_SUBSETS the enumerator collapses to a
 * single "select-all" move and sets `params._truncated: true` so UIs can
 * render a multi-pick affordance instead of an exploded subset list.
 */

import { describe, expect, it } from "bun:test";
import {
  P1,
  P2,
  createBattlefield,
  createCard,
  createMinimalGameState,
  enumerateLegalMoves,
} from "./rules-audit/helpers";

function playSpellMoves(engine: ReturnType<typeof createMinimalGameState>, player: typeof P1) {
  return enumerateLegalMoves(engine, player).filter((m) => m.moveId === "playSpell");
}

function seedEnemyUnits(
  engine: ReturnType<typeof createMinimalGameState>,
  count: number,
): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `enemy-${i + 1}`;
    createCard(engine, id, {
      cardType: "unit",
      might: 1,
      owner: P2,
      zone: "battlefield-bf-1",
    });
    ids.push(id);
  }
  return ids;
}

describe("Phase B batch 26 HHH — playSpell enumerates per-subset for multi-target spells", () => {
  it("{ upTo: 2 } over 3 candidates emits 7 moves (sizes 0,1,1,1,2,2,2)", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    seedEnemyUnits(engine, 3);

    createCard(engine, "burn-upto-2", {
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "enemy", quantity: { upTo: 2 }, type: "unit" },
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
    expect(moves.length).toBe(7);
    const sizes = moves
      .map((m) => ((m.params?.targets as string[]) ?? []).length)
      .toSorted();
    expect(sizes).toEqual([0, 1, 1, 1, 2, 2, 2]);
  });

  it("numeric quantity: 2 over 3 candidates emits 3 moves (size-2 only)", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    seedEnemyUnits(engine, 3);

    createCard(engine, "double-zap", {
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "enemy", quantity: 2, type: "unit" },
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
    expect(moves.length).toBe(3);
    for (const m of moves) {
      expect((m.params?.targets as string[]).length).toBe(2);
    }
    // Every size-2 subset of {enemy-1, enemy-2, enemy-3} is present.
    const sorted = moves
      .map((m) => [...((m.params?.targets as string[]) ?? [])].toSorted().join(","))
      .toSorted();
    expect(sorted).toEqual([
      "enemy-1,enemy-2",
      "enemy-1,enemy-3",
      "enemy-2,enemy-3",
    ]);
  });

  it("{ atLeast: 2 } over 3 candidates emits 4 moves (sizes 2,2,2,3)", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    seedEnemyUnits(engine, 3);

    createCard(engine, "swarm-zap", {
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "enemy", quantity: { atLeast: 2 }, type: "unit" },
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
    expect(moves.length).toBe(4);
    const sizes = moves
      .map((m) => ((m.params?.targets as string[]) ?? []).length)
      .toSorted();
    expect(sizes).toEqual([2, 2, 2, 3]);
  });

  it("subset count > MAX_SUBSETS (64) collapses to a single _truncated move", () => {
    const engine = createMinimalGameState({
      battlefields: ["bf-1"],
      phase: "main",
      runePools: { [P1]: { energy: 1, power: {} } },
    });
    createBattlefield(engine, "bf-1", { controller: P1 });
    // 12 candidates with upTo:5 ⇒ sum_{k=0..5} C(12,k) = 1+12+66+220+495+792 = 1586
    // Which exceeds MAX_SUBSETS=64.
    seedEnemyUnits(engine, 12);

    createCard(engine, "big-burn", {
      abilities: [
        {
          effect: {
            amount: 1,
            target: { controller: "enemy", quantity: { upTo: 5 }, type: "unit" },
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
    const m = moves[0]!;
    expect((m.params?._truncated as boolean | undefined) ?? false).toBe(true);
    // The single fallback move carries the FULL candidate set so UIs can
    // Still drive a multi-pick affordance from it.
    expect(((m.params?.targets as string[]) ?? []).length).toBe(12);
  });
});
