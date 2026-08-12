/**
 * Ruling 386515d6a0a9e108 — Kinkou Initiate (UNL-097 → unl-097-219) · Unit · Body · [3] · 3 Might
 *   "When you play me, draw 1 if your other units have total Might 5 or more."
 *
 * Q: Does the ability look at the TOTAL Might of my other units, or at one unit's Might?
 * A: Total. Sum the current Might of every OTHER friendly unit on the board. The sum is read when the
 *    triggered ability RESOLVES, not when Kinkou Initiate is played — so a pump that resolves above it
 *    on the chain can push the total to 5 just in time.
 * Rules: 359 (trailing "if" is part of the effect, read on resolution), 383.2 (trigger condition),
 *        337.1/LIFO chain resolution.
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const KINKOU = "unl-097-219";
const SIPHON_POWER = "ogn-266-298"; // [Reaction] [2][rainbow] — friendly units at a battlefield +1 Might this turn

describe("Ruling 386515d6a0a9e108 — Kinkou Initiate reads the TOTAL Might of your other units", () => {
  test("two 3-Might allies (total 6, no single unit at 5) → draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 3, name: "Ally A" }, "a")
      .unit(P1, "base", { might: 3, name: "Ally B" }, "b")
      .hand(P1, KINKOU, "kinkou")
      .build();
    const deck0 = game.p1.deck().length;
    expect(game.state("a").might + game.state("b").might).toBe(6);

    await game.p1.play("kinkou");
    await game.settle();

    expect(game.locationOf("kinkou")).toBe("base");
    expect(game.p1.deck()).toHaveLength(deck0 - 1); // drew 1 — the check is on the SUM, not on any one unit
    expect(game.violations()).toEqual([]);
  });

  test("two 2-Might allies (total 4) → no draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 2, name: "Ally A" }, "a")
      .unit(P1, "base", { might: 2, name: "Ally B" }, "b")
      .hand(P1, KINKOU, "kinkou")
      .build();
    const deck0 = game.p1.deck().length;

    await game.p1.play("kinkou");
    await game.settle();

    expect(game.p1.deck()).toHaveLength(deck0); // 4 < 5 — nothing drawn
  });

  test("Kinkou Initiate's own Might does NOT count — a lone Kinkou with one 3-Might ally draws nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 3, name: "Ally A" }, "a")
      .hand(P1, KINKOU, "kinkou")
      .build();
    const deck0 = game.p1.deck().length;

    await game.p1.play("kinkou");
    await game.settle();

    // 3 (ally) + 3 (Kinkou itself) would be 6, but "your OTHER units" is only 3.
    expect(game.p1.deck()).toHaveLength(deck0);
  });

  test("the total is read ON RESOLUTION — a pump chained above the trigger turns 4 into 6 in time to draw", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Ally A" }, "a")
      .unit(P1, "bf1", { might: 2, name: "Ally B" }, "b")
      .hand(P1, KINKOU, "kinkou")
      .hand(P1, SIPHON_POWER, "siphon")
      .build();
    const deck0 = game.p1.deck().length;

    await game.p1.play("kinkou"); // trigger goes on the chain; total is only 4 right now
    expect(game.chain().some((i) => i.triggered)).toBe(true);

    await game.p1.cast("siphon", { targets: "bf1" }); // resolves FIRST (LIFO): allies become 3 + 3
    await game.settle();

    expect(game.state("a").might).toBe(3);
    expect(game.state("b").might).toBe(3);
    expect(game.p1.deck()).toHaveLength(deck0 - 1); // the trigger saw 6 when it resolved
  });
});
