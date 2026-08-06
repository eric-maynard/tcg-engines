/**
 * Mushroom Pouch — ogn-101-298 · Gear · Mind · 2 energy
 *
 *   At the start of your Beginning Phase, if you control a facedown card at a battlefield, draw 1.
 *
 * Turn structure: Awaken → Beginning (this trigger) → Channel → Draw (+1) → Main, so across a turn
 * start P1 gains 2 cards when the trigger draws and 1 otherwise.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-101-298";
const FACEBREAKER = "ogn-220-298"; // a real [Hidden] card to sit facedown

/** P2 is about to end their turn; P1 has the Pouch in base and holds bf1. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Theirs" }, "theirs")
    .gear(P1, CARD, "pouch");
}

describe("Mushroom Pouch (ogn-101-298)", () => {
  test("cost: 2 energy to play the gear to base; not playable with 1", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "pouch").build();
    await game.p1.play("pouch");
    await game.settle();
    expect(game.zoneOf("pouch")).toBe("base");
    expect(game.p1.gear()).toEqual(["pouch"]);
    expect(game.p1.energy()).toBe(0);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "pouch").build();
    expect(poor.p1.can("play", "pouch")).toBe(false);
  });

  test("with a facedown card you control at a battlefield: trigger at start of Beginning Phase draws 1 (0 → 2 by main phase)", async () => {
    const game = await board().facedown(P1, "bf1", FACEBREAKER, "fd").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pouch", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(0);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("fd")).toBe("facedown-bf1"); // the facedown card is untouched
  });

  test("without any facedown card there is no extra draw (0 → 1, only the draw step)", async () => {
    // Expected: the "if you control a facedown card at a battlefield" condition gates the draw.
    // Actual: the trigger draws unconditionally (hand ends at 2).
    const game = await board().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("an OPPONENT's facedown card does not satisfy 'you control a facedown card' (0 → 1)", async () => {
    // Expected: only facedown cards P1 controls count. Actual: the draw happens regardless.
    const game = await board().facedown(P2, "bf2", FACEBREAKER, "theirFd").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("only YOUR Beginning Phase: nothing is drawn when the opponent's turn begins", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "holder")
      .gear(P1, CARD, "pouch")
      .facedown(P1, "bf1", FACEBREAKER, "fd")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(0);
  });
});
