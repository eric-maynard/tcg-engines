/**
 * Sandstone Chimera — ven-036-166 · Unit · Calm · 7 energy + 2 [calm] · 8 Might
 *
 *   While I'm at a battlefield, players only channel 1 rune at the start of
 *   their Channel Phase.
 *
 * Rules: 515.3.b (Channel Phase: the turn player channels 2 runes), 364 (statics
 * apply continuously while on the board).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-036-166";

describe("Sandstone Chimera (ven-036-166)", () => {
  test("while at a battlefield, the turn player channels only 1 rune", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "chim")
      .build();

    const before = game.p2.runes().length;
    await game.advanceTurn(); // → P2's turn: Channel Phase runs
    expect(game.p2.runes().length).toBe(before + 1);
  });

  test("without the Chimera at a battlefield, the normal 2 runes are channeled", async () => {
    const game = await scenario().active(P1).battlefield("bf1", { controller: P1 }).build();

    const before = game.p2.runes().length;
    await game.advanceTurn();
    expect(game.p2.runes().length).toBe(before + 2);
  });

  test("the limit applies to both players (the Chimera's controller too)", async () => {
    const game = await scenario()
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "chim")
      .build();

    await game.advanceTurn(); // → P2
    const before = game.p1.runes().length;
    await game.advanceTurn(); // → P1
    expect(game.p1.runes().length).toBe(before + 1);
  });

  test("in base rather than at a battlefield, the static does not apply", async () => {
    const game = await scenario().active(P1).unit(P1, "base", CARD, "chim").build();

    const before = game.p2.runes().length;
    await game.advanceTurn();
    expect(game.p2.runes().length).toBe(before + 2);
  });
});
