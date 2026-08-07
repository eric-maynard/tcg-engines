/**
 * Fresh Beans (unl-011-219) — Gear, Fury, energy 2.
 * "When you play a unit during a showdown, you may exhaust this to draw 1."
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-011-219";
const AMBUSHER = "unl-120-219"; // Rengar, Trophy Hunter — [Ambush]

describe("Fresh Beans (unl-011-219)", () => {
  test("triggers when a unit is played during a showdown: exhaust to draw 1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P2, "bf1", { might: 2 }, "blocker")
      .unit(P1, "base", { might: 3 }, "attacker")
      .gear(P1, CARD, "beans")
      // [Ambush] unit — the only way to play a unit inside a showdown.
      .hand(P1, AMBUSHER, "rengar")
      .resources(P1, { energy: 5, power: { body: 5 } })
      .build();

    // Attacker moves in → showdown opens with P1 holding focus.
    await game.p1.move("attacker", "bf1");
    const handBefore = game.p1.hand().length;

    await game.p1.play("rengar", { to: "bf1" });
    await game.settle();
    await game.p1.yes();
    await game.settle();

    expect(game.state("beans").isExhausted).toBe(true);
    expect(game.p1.hand().length).toBe(handBefore); // -1 played, +1 drawn
    expect(game.violations()).toEqual([]);
  });

  test("does not trigger when a unit is played outside a showdown", async () => {
    const game = await scenario()
      .gear(P1, CARD, "beans")
      .hand(P1, { might: 1 }, "recruit")
      .resources(P1, { energy: 5, power: { rainbow: 5 } })
      .build();

    await game.p1.play("recruit", { to: "base" });
    await game.settle();

    expect(game.state("beans").isExhausted).toBe(false);
  });
});
