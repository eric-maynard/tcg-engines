/**
 * Spiderling — ven-097-166 · Unit
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   I have +1 [Might] for each other unit you control here with my name.
 *   Your deck can have any number of cards named Spiderling.
 *
 * The static counts OTHER friendly units named Spiderling in the SAME location
 * (rule 105.2 — "here" is the source's own zone), so a lone Spiderling gets +0.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-097-166";

describe("Spiderling (ven-097-166)", () => {
  test("alone in base: no bonus", async () => {
    const game = await scenario().unit(P1, "base", CARD, "s1").build();
    expect(game.state("s1").might).toBe(game.state("s1").baseMight);
  });

  test("three together at a battlefield: each gets +2", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "s1")
      .unit(P1, "bf1", CARD, "s2")
      .unit(P1, "bf1", CARD, "s3")
      .build();
    const base = game.state("s1").baseMight;
    for (const alias of ["s1", "s2", "s3"]) {
      expect(game.state(alias).might).toBe(base + 2);
    }
  });

  test("Spiderlings in different locations do not count each other", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "s1")
      .unit(P1, "base", CARD, "s2")
      .build();
    const base = game.state("s1").baseMight;
    expect(game.state("s1").might).toBe(base);
    expect(game.state("s2").might).toBe(base);
  });

  test("an enemy Spiderling at the same battlefield is not counted", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "s1")
      .unit(P2, "bf1", CARD, "foe")
      .build();
    expect(game.state("s1").might).toBe(game.state("s1").baseMight);
  });
});
