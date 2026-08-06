/**
 * Bellows Breath — sfd-080-221 · Spell · Mind · 1 energy · 1 [mind] power
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   [Repeat] [1][mind] (You may pay the additional cost to repeat this spell's effect.)
 *   Deal 1 to up to three units at the same location.
 *
 * Rule 135.2.e (cost = energy + power); rule 135.2.e.5.b — pooled [rainbow]
 * Power may be spent as Power of any Domain.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-080-221";

describe("Bellows Breath (sfd-080-221) — cost", () => {
  test("not playable with the energy but no [mind] power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P1, CARD, "bb")
      .build();
    expect(game.p1.can("cast", "bb")).toBe(false);
    const r = await game.p1.try((p) => p.cast("bb", { targets: "foe" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("bb")).toBe("hand");
    expect(game.p1.energy()).toBe(1);
  });

  test("playable with 1 energy + 1 mind; casting deducts both", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { mind: 1 } })
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P1, CARD, "bb")
      .build();
    expect(game.p1.can("cast", "bb")).toBe(true);
    await game.p1.cast("bb", { targets: "foe" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("mind")).toBe(0);
    await game.settle();
    expect(game.state("foe").damage).toBe(1);
    expect(game.zoneOf("bb")).toBe("trash");
  });

  test("a wrong-domain power pip does not pay the [mind] pip", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P1, CARD, "bb")
      .build();
    expect(game.p1.can("cast", "bb")).toBe(false);
  });

  test("pooled [rainbow] power pays the [mind] pip (rule 135.2.e.5.b)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { rainbow: 1 } })
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P1, CARD, "bb")
      .build();
    expect(game.p1.can("cast", "bb")).toBe(true);
    await game.p1.cast("bb", { targets: "foe" });
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power()).toBe(0);
  });
});
