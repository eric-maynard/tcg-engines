/**
 * Zilean, Time Mage — unl-086-219 · Unit · Mind · 5 energy · 5 might
 *
 *   Once each turn, if you would play a token unit while I'm at a
 *   battlefield, you may play that token and an additional copy of it
 *   instead.
 *
 * Rule 571 — `replaces: "play-token"` replacement consulted by create-token.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const ZILEAN = "unl-086-219";
const SPRITE_FOUNTAIN = "unl-078-219";

function sprites(game: { p1: { base: () => string[] } }): string[] {
  return game.p1.base().filter((id) => id.startsWith("token-sprite-"));
}

describe("Zilean, Time Mage (unl-086-219)", () => {
  test("at a battlefield: the first token unit you play each turn comes with an additional copy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { mind: 2 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ZILEAN, "zilean")
      .hand(P1, SPRITE_FOUNTAIN, "fountain1")
      .hand(P1, SPRITE_FOUNTAIN, "fountain2")
      .build();

    await game.p1.playGear("fountain1");
    await game.settle();
    expect(sprites(game)).toHaveLength(2);

    // Once each turn: the second token play this turn is not doubled.
    await game.p1.playGear("fountain2");
    await game.settle();
    expect(sprites(game)).toHaveLength(3);
  });

  test("in base: no additional copy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", ZILEAN, "zilean")
      .hand(P1, SPRITE_FOUNTAIN, "fountain")
      .build();

    await game.p1.playGear("fountain");
    await game.settle();
    expect(sprites(game)).toHaveLength(1);
  });
});
