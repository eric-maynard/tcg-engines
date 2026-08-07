/**
 * Lotus Trap — unl-013-219 · Spell · Fury · 2 energy
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a unit. Double all damage that would be dealt to it this turn.
 *
 * Rules: 437.2 (damage replacement), 522.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-013-219";
const INCINERATE = "ogs-003-024"; // Deal 2 to a unit at a battlefield.

describe("Lotus Trap (unl-013-219)", () => {
  test("doubles damage dealt to the chosen unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2, rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 20 }, "foe")
      .hand(P1, CARD, "trap")
      .hand(P1, INCINERATE, "burn")
      .build();
    await game.p1.cast("trap", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").grantedKeywords).toEqual([
      { keyword: "DoubleIncomingDamage", duration: "turn" },
    ]);
    await game.p1.cast("burn", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(4);
  });

  test("only the chosen unit takes doubled damage", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2, rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 20 }, "foe")
      .unit(P2, "bf1", { might: 20 }, "other")
      .hand(P1, CARD, "trap")
      .hand(P1, INCINERATE, "burn")
      .build();
    await game.p1.cast("trap", { targets: "foe" });
    await game.settle();
    await game.p1.cast("burn", { targets: "other" });
    await game.settle();
    expect(game.state("other").damage).toBe(2);
  });
});
