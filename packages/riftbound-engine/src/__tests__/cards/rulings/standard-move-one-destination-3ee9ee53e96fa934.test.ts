/**
 * Ruling 3ee9ee53e96fa934 — (no specific card) one standard move = one destination.
 *
 * Q: With 2 ready units, can I attempt to conquer 2 separate battlefields at once?
 * A: No. A standard move declares ONE destination for every unit involved (143.3.a), so a single
 *    move action can never split. Several units may come from different origins to the SAME
 *    battlefield. Conquering two battlefields in a turn needs two separate move actions.
 * Rules: 143.3.a (same destination), 143 (standard move), 344.2 (each move stages its own showdown).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

/** Two ready units in P1's base, two open battlefields. */
function board() {
  return scenario()
    .battlefield("bf1")
    .battlefield("bf2")
    .unit(P1, "base", { might: 3, name: "Alpha" }, "a")
    .unit(P1, "base", { might: 3, name: "Bravo" }, "b");
}

describe("Ruling 3ee9ee53e96fa934 — a single standard move cannot send units to two battlefields", () => {
  test("every enumerated standard move fixes ONE destination for the whole unit set — there is no per-unit destination", async () => {
    const game = await board().build();
    const moves = game.p1.legal().filter((o) => o.moveId === "standardMove");
    expect(moves.map((o) => o.key).sort()).toEqual(["standardMove:to:bf1", "standardMove:to:bf2"]);
    for (const option of moves) {
      const destinations = new Set(option.variants.map((v) => String(v.params.destination)));
      expect(destinations.size).toBe(1); // one option = one destination
      // The only choice the option offers is WHICH units come along, not where each of them goes.
      expect(option.fields.map((f) => f.name)).toEqual(["unitIds"]);
      expect(option.variants.map((v) => v.params.unitIds)).toEqual([["a"], ["b"], ["a", "b"]]);
    }
    // A hand-rolled "split" move is refused outright and changes nothing.
    const split = await game.p1.try((p) =>
      p.do("standardMove", { destination: ["bf1", "bf2"], unitIds: ["a", "b"] }),
    );
    expect(split.ok).toBe(false);
    expect(game.locationOf("a")).toBe("base");
    expect(game.locationOf("b")).toBe("base");
  });

  test("both units CAN move together to the same battlefield (one destination is the whole restriction)", async () => {
    const game = await board().build();
    await game.p1.move(["a", "b"], "bf1");
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("b")).toBe("bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf2?.controller).toBeFalsy();
    expect(game.p1.points()).toBe(1);
  });

  test("two battlefields in one turn need two separate move actions — legal, and each stages its own showdown", async () => {
    const game = await board().build();
    await game.p1.move("a", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.p1.move("b", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
