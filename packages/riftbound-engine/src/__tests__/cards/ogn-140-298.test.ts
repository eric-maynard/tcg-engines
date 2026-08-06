/**
 * Herald of Scales — ogn-140-298 · Unit · Body · 4 energy · 3 Might
 *
 *   Your Dragons' Energy costs are reduced by [2], to a minimum of [1].
 *
 * Rules: 356.4 (discounts are applied while determining Total Cost), 356.4.e (a
 * discount's minimum applies only to that discount), 206 (printed cost is unchanged
 * for other effects). No printed Dragon exists in the pool yet, so the Dragons here
 * are inline units carrying the DRAGON tag.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-140-298";
const BIG_DRAGON = { energyCost: 5, might: 5, name: "Test Dragon", tags: ["Dragon"] };
const SMALL_DRAGON = { energyCost: 2, might: 2, name: "Whelp", tags: ["Dragon"] };
const NON_DRAGON = { energyCost: 5, might: 5, name: "Not A Dragon" };

describe("Herald of Scales (ogn-140-298)", () => {
  test("costs 4 energy to play and is a 3-Might unit; unaffordable with 3", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "herald").build();
    await game.p1.play("herald");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("herald")).toBe("base");
    expect(game.state("herald").might).toBe(3);
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "herald").build();
    expect(poor.p1.can("play", "herald")).toBe(false);
  });

  test.failing("BUG: a friendly Dragon's energy cost is reduced by 2 (5-cost Dragon playable for 3; rule 356.4)", async () => {
    // Expected: with Herald on board, a 5-cost Dragon is legal with 3 energy and paying leaves 0.
    // Actual: the static is a hand-authored `CostReduction` grant the engine never applies, so the
    // Dragon still demands its printed 5.
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .unit(P1, "base", CARD, "herald")
      .hand(P1, BIG_DRAGON, "dragon")
      .build();
    expect(game.state("dragon").energyCost).toBe(5); // printed cost unchanged (rule 206)
    expect(game.p1.can("play", "dragon")).toBe(true);
    await game.p1.play("dragon");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
  });

  test.failing("BUG: the reduction bottoms out at 1 — a 2-cost Dragon costs 1, not 0 (rule 356.4.e)", async () => {
    // Expected: 2 - 2 floors at 1, so playing the Whelp with 2 energy leaves 1; with 0 energy it is illegal.
    // Actual: full printed cost (2) is charged.
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "herald")
      .hand(P1, SMALL_DRAGON, "whelp")
      .build();
    await game.p1.play("whelp");
    expect(game.p1.energy()).toBe(1);
    const broke = await scenario().resources(P1, { energy: 0 }).unit(P1, "base", CARD, "herald").hand(P1, SMALL_DRAGON, "whelp").build();
    expect(broke.p1.can("play", "whelp")).toBe(false);
  });

  test("non-Dragon cards you play are not discounted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", CARD, "herald")
      .hand(P1, NON_DRAGON, "plain")
      .build();
    expect(game.p1.can("play", "plain")).toBe(false);
    await game.p1.do("addResources", { energy: 1 });
    await game.p1.play("plain");
    expect(game.p1.energy()).toBe(0);
  });

  test("'Your Dragons': an opponent's Dragon is not discounted by your Herald", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3 })
      .unit(P1, "base", CARD, "herald")
      .hand(P2, BIG_DRAGON, "theirs")
      .build();
    expect(game.p2.can("play", "theirs")).toBe(false);
    await game.p2.do("addResources", { energy: 2 });
    await game.p2.play("theirs");
    expect(game.p2.energy()).toBe(0);
  });
});
