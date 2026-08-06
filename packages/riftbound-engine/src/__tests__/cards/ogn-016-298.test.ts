/**
 * Dangerous Duo — ogn-016-298 · Unit · Fury · 3 energy · 3 Might
 *
 *   [Legion] — When you play me, give a unit +2 [Might] this turn.
 *   (Get the effect if you've played another card this turn.)
 *
 * Rules: 812.1.b.1 / 812.1.c (Legion: the dependent ability is active only if a
 * different card was finalized by you earlier this turn).
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-016-298";
const SKULKER = "ogn-175-298"; // vanilla 3-cost unit: the "another card" played first

describe("Dangerous Duo (ogn-016-298)", () => {
  test("costs 3 energy and is a 3-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "duo").build();
    await game.p1.play("duo");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("duo")).toBe("base");
    expect(game.state("duo").might).toBe(3);
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "duo").build();
    expect(poor.p1.can("play", "duo")).toBe(false);
  });

  test("Legion not met: as the first card you play this turn, nothing triggers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "duo")
      .build();
    await game.p1.play("duo");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.state("ally").might).toBe(2);
    expect(game.state("duo").might).toBe(3);
  });

  test("Legion met — after playing another card this turn, playing me gives a chosen unit +2 Might this turn (rule 812.1.c)", async () => {
    // Expected: Skulker was finalized earlier this turn, so Dangerous Duo's play trigger goes on the
    // chain, asks for a unit, and gives it +2 Might until end of turn. Actual: the ability is parsed as
    // a bare `keyword: Legion` entry (not a triggered ability), so nothing ever triggers.
    const game = await scenario()
      .resources(P1, { energy: 6 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, SKULKER, "skulker")
      .hand(P1, CARD, "duo")
      .build();
    await game.p1.play("skulker");
    await game.settle();
    await game.p1.play("duo", { answers: ["ally"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.state("ally").might).toBe(4);
    // "this turn": gone after the turn ends.
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });
});
