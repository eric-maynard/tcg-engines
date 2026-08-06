/**
 * Yasuo, Windrider — ogn-205-298 · Champion Unit (Yasuo) · Chaos · 5 energy + [chaos] · 4 Might
 *
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   The third time I move in a turn, you score 1 point.
 *
 * Rule 810 / 144.4.c — Ganking lets the Standard Move go battlefield → battlefield (it still
 * exhausts). The Standard Move exhausts, so between moves we ready Yasuo with the sandbox
 * `readyCard` move to model "readied by some effect".
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-205-298";

/** Yasuo in base; P1 holds two battlefields (with a holder unit each so control never lapses). */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 1 }, "h1")
    .unit(P1, "bf2", { might: 1 }, "h2")
    .unit(P1, "base", CARD, "yasuo");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** Move Yasuo n times this turn: base→bf1, then ganking bf1↔bf2, readying him in between. */
async function moveTimes(game: Built, n: number) {
  const path = ["bf1", "bf2", "bf1", "bf2", "bf1"];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      await game.p1.do("readyCard", { cardId: "yasuo" });
    }
    const dest = path[i] as string;
    if (i === 0) {
      await game.p1.move("yasuo", dest);
    } else {
      await game.p1.gank("yasuo", dest);
    }
    await game.settle();
    expect(game.locationOf("yasuo")).toBe(dest);
  }
}

describe("Yasuo, Windrider (ogn-205-298)", () => {
  test("cost: 5 energy + 1 chaos for a 4-Might Ganking unit; unaffordable short of either", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).hand(P1, CARD, "yasuo").build();
    await game.p1.play("yasuo");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("yasuo")).toBe("base");
    expect(game.state("yasuo").might).toBe(4);
    expect(game.state("yasuo").keywords).toContain("Ganking");
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "yasuo").build();
    expect(noPower.p1.can("play", "yasuo")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "yasuo").build();
    expect(noEnergy.p1.can("play", "yasuo")).toBe(false);
  });

  test("Ganking: may move battlefield → battlefield (a vanilla unit there may not); the move exhausts him", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "yasuo")
      .unit(P1, "bf1", { might: 1 }, "plain")
      .unit(P1, "bf2", { might: 1 }, "h2")
      .build();
    expect(game.p1.can("gank", "yasuo")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    await game.p1.gank("yasuo", "bf2");
    expect(game.locationOf("yasuo")).toBe("bf2");
    expect(game.state("yasuo").isExhausted).toBe(true);
  });

  test("the first and second moves in a turn score nothing", async () => {
    const game = await board().build();
    await moveTimes(game, 2);
    expect(game.p1.points()).toBe(0);
  });

  test("the third move in a turn scores exactly 1 point", async () => {
    // Expected: base→bf1, bf1→bf2, bf2→bf1 in one turn → the third move triggers "you score 1 point".
    // Actual: the `nth-time-each-turn` move trigger never fires; points stay 0.
    const game = await board().build();
    await moveTimes(game, 3);
    expect(game.p1.points()).toBe(1);
  });

  test("only the THIRD move — a fourth move in the same turn does not score again (total stays 1)", async () => {
    // Expected: exactly one point across four moves. Actual: the trigger never fires (0 points).
    const game = await board().build();
    await moveTimes(game, 4);
    expect(game.p1.points()).toBe(1);
  });

  test("'in a turn': the count resets — two moves this turn and one next turn score nothing from Yasuo", async () => {
    const game = await board().build();
    await moveTimes(game, 2);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("yasuo").isReady).toBe(true); // Awaken readied him
    const held = game.p1.points(); // holding bf1+bf2 scored during the Beginning Phase
    await game.p1.gank("yasuo", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(held);
  });
});
