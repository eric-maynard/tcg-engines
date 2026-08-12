/**
 * Ruling f18c223519fbd31a — Thrill of the Hunt (UNL-184 → unl-184-219) · [Reaction] spell · [2][rainbow]
 *   "Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *
 * Q: I hold a battlefield during my Beginning Phase; can I then Thrill of the Hunt the unit onto the other, empty
 *    battlefield and collect a SECOND holding point?
 * A: No. Holding is the specific event of keeping control through your Beginning Phase's scoring step. Once that has
 *    been processed you cannot make it happen again later in the turn, and rule 470 allows only one score per
 *    battlefield per turn anyway.
 * Rules: 469.2 (Hold = maintaining control during your Beginning Phase), 470 (one score per battlefield per turn),
 *        471.2.b (hold abilities trigger only at the battlefield that was held).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";

/** Set up on P2's turn so that P1's next Beginning Phase HOLDS bf1; bf2 is empty and uncontrolled. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .hand(P1, THRILL, "thrill");
}

/** Advance into P1's turn (the hold scores) and refill the pool the turn change emptied. */
async function afterHold(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.points()).toBe(0);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  await game.p1.do("addResources", { energy: 2, power: { rainbow: 1 } });
  return game;
}

/** …then banish the Holder with Thrill of the Hunt and replay it at the empty bf2. */
async function relocated(): Promise<Game> {
  const game = await afterHold();
  await game.p1.cast("thrill", { targets: "holder" });
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("battlefield-bf2");
  await game.settle();
  return game;
}

describe("Ruling f18c223519fbd31a — holding scores once, in the Beginning Phase; Thrill of the Hunt cannot buy a second hold", () => {
  test("keeping bf1 through the Beginning Phase scores exactly one point", async () => {
    const game = await afterHold();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Thrill of the Hunt does move the unit — it is banished and replayed to the empty battlefield", async () => {
    const game = await relocated();
    expect(game.locationOf("holder")).toBe("bf2");
    expect(game.zoneOf("thrill")).toBe("trash");
  });

  test("but no second HOLD happens: holding is a Beginning-Phase event and that phase is over", async () => {
    const game = await relocated();
    expect(game.phase()).toBe("main"); // still the main phase — nothing re-ran the Beginning Phase's scoring step
    expect(game.turnPlayer()).toBe(P1);
  });

  test("the score is still 1 right after the relocation: no hold, and bf2 has not been scored yet either", async () => {
    const game = await relocated();
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.bf2?.contested).toBe(true); // an open showdown, not a completed score
    expect(game.gameState.battlefields.bf2?.controller ?? null).toBe(null);
    expect(game.violations()).toEqual([]);
  });

  test("what the relocation can eventually earn is a CONQUER of the other battlefield, never a second hold", async () => {
    const game = await relocated();
    await game.advanceTurn(); // the showdown at bf2 closes and P1 establishes control there
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    // The extra point is a Conquer at a battlefield P1 had NOT scored this turn — rule 470 (the very rule the ruling
    // cites) limits scoring per battlefield, not per turn. Holding still happened exactly once, at bf1.
    expect(game.p1.points()).toBe(2);
  });

  test("leaving the unit alone gives the same one point — moving it around never adds a hold", async () => {
    const game = await afterHold();
    expect(game.p1.points()).toBe(1);
    await game.p1.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(1);
  });
});
