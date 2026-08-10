/**
 * Ruling 27303c5d5fc9e8c0 — Kennen, Storm of Shuriken (VEN-113 → ven-113-166) · 4 Might "When you play me, [Burn 2].
 *   When I conquer, give a spell in your trash [Flow] equal to its cost this turn."
 *   × Drag Under (SFD-164 → sfd-164-221) · Action [5][order] "I cost [2] less to play from anywhere other than your hand.
 *     Kill a unit at a battlefield."
 *
 * Q: If I conquer with Kennen, can I play Drag Under from trash for 3 energy + 1 power?
 * A: Yes. Kennen sets the Flow cost to the PRINTED cost (5E/1P, rule 131.4); when actually played from trash, Drag
 *    Under's own "[2] less from anywhere other than your hand" applies during cost determination (356.4) → 3E/1P.
 *    Then it is banished (Flow).
 * Rules: 131.4, 356.4, 829 (Flow).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KENNEN = "ven-113-166";
const DRAG_UNDER = "sfd-164-221";

/**
 * P1's turn. P2 holds bf1 (1-Might Defender) and bf2 (3-Might Victim). P1: Kennen (4) in base, Drag Under already in
 * trash, and exactly `energy` + 1 order in the pool.
 */
function board(energy: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Defender" }, "def")
    .unit(P2, "bf2", { might: 3, name: "Victim" }, "victim")
    .unit(P1, "base", KENNEN, "kennen")
    .trash(P1, DRAG_UNDER, "dragUnder")
    .resources(P1, { energy, power: { order: 1 } });
}

/** Kennen attacks bf1 and conquers; his conquer trigger grants Drag Under (the only spell in trash) Flow. */
async function conquer(energy: number): Promise<Game> {
  const game = await board(energy).build();
  expect(game.p1.can("cast", "dragUnder")).toBe(false); // a spell in trash is not playable before the grant
  await game.p1.move("kennen", "bf1");
  await game.settle();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("dragUnder");
    await game.settle();
  }
  expect(game.zoneOf("def")).toBe("trash");
  expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  expect(game.p1.points()).toBe(1);
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

describe("Ruling 27303c5d5fc9e8c0 — Kennen's Flow on Drag Under: printed 5E/1P, minus its own 2 for playing from trash = 3E/1P", () => {
  test("after the conquer, Drag Under in trash is playable via Flow with exactly [3] + 1 order in the pool", async () => {
    const game = await conquer(3);
    expect(game.zoneOf("dragUnder")).toBe("trash");
    expect(game.state("dragUnder").energyCost).toBe(5); // printed cost unchanged
    expect(game.p1.can("cast", "dragUnder")).toBe(true);
    const flow = game.p1.option("cast", "dragUnder")?.fields.find((f) => f.arg === "flow");
    expect(flow?.options).toEqual([true]); // only as a Flow play
  });

  test("playing it charges 3 energy + 1 order (pool 3/1 → 0/0), kills the Victim, and the Flow play banishes Drag Under", async () => {
    const game = await conquer(3);
    await game.p1.cast("dragUnder", { flow: true, targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("dragUnder")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.zoneOf("dragUnder")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  test("with [5] available it still costs only 3 — 2 energy is left over (the discount is real, not just a legality waiver)", async () => {
    const game = await conquer(5);
    await game.p1.cast("dragUnder", { flow: true, targets: "victim" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } });
  });

  test("with only [2] + 1 order it is NOT playable (3 is required, not 5 and not less)", async () => {
    const game = await conquer(2);
    expect(game.p1.can("cast", "dragUnder")).toBe(false);
  });

  test("control: without the conquer (no Flow granted) Drag Under simply stays unplayable in the trash", async () => {
    const game = await board(5).build();
    expect(game.p1.can("cast", "dragUnder")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "dragUnder")).toBe(false);
  });
});
