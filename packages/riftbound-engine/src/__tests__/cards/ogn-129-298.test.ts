/**
 * Confront — ogn-129-298 · Spell · Body · 2 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Units you play this turn enter ready. Draw 1.
 *
 * Rule 143.4 — units enter exhausted by default; Confront sets up a turn-long
 * replacement (369.3) for units its controller plays. Rule 806 — Action timing.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-129-298";
const SKULKER = "ogn-175-298"; // vanilla 3-energy 3-might unit

function board() {
  return scenario()
    .resources(P1, { energy: 8 })
    .hand(P1, CARD, "confront")
    .hand(P1, SKULKER, "ally")
    .deck(P1, [SKULKER, SKULKER], ["d1", "d2"]);
}

describe("Confront (ogn-129-298)", () => {
  test("costs 2 energy, draws 1, and goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("confront");
    expect(game.p1.energy()).toBe(6);
    expect(game.zoneOf("confront")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("confront")).toBe("trash");
    expect(game.zoneOf("d1")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["ally", "d1"]);
  });

  test("not playable with only 1 energy", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "confront").build();
    expect(game.p1.can("cast", "confront")).toBe(false);
  });

  test.failing("BUG: 'Units you play this turn enter ready' — a unit played after Confront resolves enters ready (143.4 / 369.3)", async () => {
    // Expected: after Confront resolves, Shipyard Skulker played from hand enters the base ready.
    // Actual: the parser only produced the `draw 1` clause; the enter-ready replacement is missing,
    // so the unit enters exhausted.
    const game = await board().build();
    await game.p1.cast("confront");
    await game.settle();
    await game.p1.play("ally");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").isReady).toBe(true);
  });

  test("control: without Confront the same unit enters exhausted; the effect is 'this turn' only", async () => {
    const game = await board().build();
    await game.p1.cast("confront");
    await game.settle();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 3 }); // rune pool emptied at end of turn
    await game.p1.play("ally");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.state("ally").isExhausted).toBe(true);
  });

  test("[Action] timing: castable with Focus in a showdown; not on the opponent's turn in an open state", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 1 }, "scout")
      .unit(P2, "bf1", { might: 9 }, "wall")
      .hand(P1, CARD, "confront")
      .build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "confront")).toBe(true);

    const oppTurn = await scenario().active(P2).resources(P1, { energy: 2 }).hand(P1, CARD, "confront").build();
    expect(oppTurn.p1.can("cast", "confront")).toBe(false);
  });
});
