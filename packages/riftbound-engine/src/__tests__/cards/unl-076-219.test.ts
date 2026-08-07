/**
 * Petal Pixie (unl-076-219) — Unit, Mind, 2 energy, 2 Might.
 *
 * "I have +1 [Might] for each of your units with [Temporary] at my battlefield."
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-076-219";

describe("Petal Pixie (unl-076-219)", () => {
  test("has no bonus with no Temporary units around", async () => {
    const game = await scenario().unit(P1, "base", CARD, "pixie").build();
    expect(game.state("pixie").might).toBe(2);
  });

  test("alone in base with a Temporary ally in base: still 2 — base is not 'my battlefield'", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "pixie")
      .unit(P1, "base", { keywords: ["Temporary"], might: 1 }, "temp")
      .build();
    expect(game.state("pixie").might).toBe(2);
  });

  test("counts your Temporary units at its location", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .unit(P1, "bf1", CARD, "pixie")
      .unit(P1, "bf1", { keywords: ["Temporary"], might: 1 }, "t1")
      .unit(P1, "bf1", { keywords: ["Temporary"], might: 1 }, "t2")
      .build();
    expect(game.state("pixie").might).toBe(4);
  });

  test("ignores Temporary units elsewhere, non-Temporary units, and enemy units", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .unit(P1, "bf1", CARD, "pixie")
      .unit(P1, "base", { keywords: ["Temporary"], might: 1 }, "far")
      .unit(P1, "bf1", { might: 1 }, "plain")
      .unit(P2, "bf1", { keywords: ["Temporary"], might: 1 }, "enemyTemp")
      .build();
    expect(game.state("pixie").might).toBe(2);
  });
});
