/**
 * Jhin, Meticulous Killer — unl-089-219 · Unit · Mind · 4 energy · 4 might
 *
 *   [Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *   If you've spent [4] or more to play a spell this turn, you may play me for [mind].
 *
 * Head-judge notes:
 *  - The second line is an ALTERNATE play cost (rule 356.1), not an additional one: paying
 *    [mind] REPLACES the printed [4], it does not stack on top of it.
 *  - "you may" — the printed cost stays available; both plays are offered while the condition holds.
 *  - The condition looks at Energy spent to play a SPELL this turn; it resets every turn.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, scenario } from "../../harness";

const CARD = "unl-089-219";
const PROGRESS_DAY = "ogn-114-298"; // Spell · Mind · 6 energy + [mind] · "Draw 4."

describe("Jhin, Meticulous Killer (unl-089-219)", () => {
  test("card def: the alt-cost line is an alternate-play-cost static gated on spell spend", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, might: 4 });
    expect(def?.abilities).toContainEqual({
      condition: { amount: 4, type: "spell-energy-spent-this-turn" },
      effect: { cost: { energy: 0, power: ["mind"] }, type: "alternate-play-cost" },
      type: "static",
    });
  });

  test("no spell spent this turn: [mind] alone does not pay for him", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { mind: 1 } })
      .hand(P1, CARD, "jhin")
      .build();
    expect(game.p1.can("play", "jhin")).toBe(false);
  });

  test("after spending [6] on a spell he can be played for [mind] instead of [4]", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { mind: 2 } })
      .hand(P1, PROGRESS_DAY, "day")
      .hand(P1, CARD, "jhin")
      .build();
    await game.p1.cast("day");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    // The printed [4] is unaffordable, but the alternate cost is one [mind].
    expect(game.p1.can("play", "jhin")).toBe(true);
    await game.p1.play("jhin", { params: { altCost: true } });
    await game.settle();
    expect(game.zoneOf("jhin")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("mind")).toBe(0);
  });

  test("the printed cost stays available — paying [4] leaves the [mind] Power in pool", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10, power: { mind: 2 } })
      .hand(P1, PROGRESS_DAY, "day")
      .hand(P1, CARD, "jhin")
      .build();
    await game.p1.cast("day");
    await game.settle();
    expect(game.p1.energy()).toBe(4);
    await game.p1.play("jhin");
    await game.settle();
    expect(game.zoneOf("jhin")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("mind")).toBe(1);
  });

  test("a cheap spell does not unlock it — [4] or more must have been spent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .hand(P1, CARD, "jhin")
      .build();
    expect(game.p1.can("play", "jhin")).toBe(false);
  });
});
