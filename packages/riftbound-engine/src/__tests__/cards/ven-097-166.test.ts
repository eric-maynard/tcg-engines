/**
 * Spiderling (ven-097-166) — Unit, Chaos, 3 energy, 1 Might.
 *
 * "[Hidden]
 *  I have +1 [Might] for each other unit you control here with my name.
 *  Your deck can have any number of cards named Spiderling."
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-097-166";

describe("Spiderling (ven-097-166)", () => {
  test("alone it gets no bonus", async () => {
    const game = await scenario().unit(P1, "base", CARD, "s1").build();
    expect(game.state("s1").might).toBe(1);
  });

  test("three together at one battlefield are each 3 Might", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .unit(P1, "bf1", CARD, "s1")
      .unit(P1, "bf1", CARD, "s2")
      .unit(P1, "bf1", CARD, "s3")
      .build();
    expect(game.state("s1").might).toBe(3);
    expect(game.state("s2").might).toBe(3);
    expect(game.state("s3").might).toBe(3);
  });

  test("Spiderlings in other locations, and the opponent's, do not count", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .unit(P1, "bf1", CARD, "s1")
      .unit(P1, "base", CARD, "s2")
      .unit(P2, "bf1", CARD, "enemySpider")
      .build();
    expect(game.state("s1").might).toBe(1);
    expect(game.state("s2").might).toBe(1);
  });
});
