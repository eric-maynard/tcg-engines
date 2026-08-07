/**
 * Wuju Apprentice — unl-040-219 · Unit · Calm · 2 energy · 2 might
 *
 *   [Hunt] (When I conquer or hold, gain 1 XP.)
 *   [Level 6][>] When you play me, draw 1. (While you have 6+ XP, get the effect.)
 *
 * Rules: 831 Level gates ("[Level N]" abilities only function while you have N or more XP —
 * for a triggered ability that means it does not go on the chain at all below the threshold).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-040-219";
const FILLER = "ogn-175-298";

describe("Wuju Apprentice (unl-040-219)", () => {
  test("below Level 6 the play trigger does not fire — hand is unchanged", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .xp(P1, 0)
      .deckTop(P1, FILLER, "top")
      .hand(P1, CARD, "wu")
      .build();
    await game.p1.play("wu");
    await game.settle();
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.p1.hand()).toEqual([]);
  });

  test("at 6 XP the [Level 6] play trigger fires and draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .xp(P1, 6)
      .deckTop(P1, FILLER, "top")
      .hand(P1, CARD, "wu")
      .build();
    await game.p1.play("wu");
    await game.settle();
    expect(game.zoneOf("top")).toBe("hand");
  });
});
