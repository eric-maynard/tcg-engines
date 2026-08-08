/**
 * Kinkou Initiate — unl-097-219 · Unit · Body · 3 energy · 3 might
 *
 *   When you play me, draw 1 if your other units have total Might 5 or more.
 *
 * Rule 383.2.a.1 — the "if …" clause is part of the trigger condition: with a
 * total below 5 the ability never goes on the chain, so nothing is drawn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const KINKOU = "unl-097-219";

describe("Kinkou Initiate (unl-097-219)", () => {
  test("draws 1 when your other units have total Might 5 or more", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 3 }, "ally1")
      .unit(P1, "base", { might: 2 }, "ally2")
      .hand(P1, KINKOU, "kinkou")
      .build();
    const before = game.p1.hand().length;
    await game.p1.play("kinkou", { to: "base" });
    await game.settle();
    expect(game.p1.hand().length).toBe(before); // -1 played, +1 drawn
  });

  test("does not draw when your other units total less than 5 Might", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 2 }, "ally1")
      .unit(P1, "base", { might: 2 }, "ally2")
      .hand(P1, KINKOU, "kinkou")
      .build();
    const before = game.p1.hand().length;
    await game.p1.play("kinkou", { to: "base" });
    await game.settle();
    expect(game.p1.hand().length).toBe(before - 1);
  });

  test("its own Might does not count toward the total", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 4 }, "ally1")
      .hand(P1, KINKOU, "kinkou")
      .build();
    const before = game.p1.hand().length;
    await game.p1.play("kinkou", { to: "base" });
    await game.settle();
    expect(game.p1.hand().length).toBe(before - 1);
  });

  test("enemy units do not count toward the total", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 3 })
      .unit(P2, "base", { might: 6 }, "foe")
      .hand(P1, KINKOU, "kinkou")
      .build();
    const before = game.p1.hand().length;
    await game.p1.play("kinkou", { to: "base" });
    await game.settle();
    expect(game.p1.hand().length).toBe(before - 1);
  });
});
