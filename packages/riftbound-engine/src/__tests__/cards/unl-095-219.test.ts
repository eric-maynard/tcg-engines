/**
 * Grim Resolve — unl-095-219 · Spell · Body · 2 energy · [Action]
 *
 *   "Give a friendly unit +3 [Might] this turn. When it wins a combat this turn, gain 2 XP."
 *
 * Rules: 364.3 (the second sentence installs a turn-scoped triggered ability on the same unit),
 * 466.1.a (the units still at the battlefield on the winning side won the combat), 517.2.b (the
 * grant expires at the Ending Step).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-095-219";

function board(defenderMight: number) {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Poro" }, "poro")
    .unit(P2, "bf1", { might: defenderMight, name: "Recruit" }, "foe")
    .hand(P1, CARD, "grim");
}

describe("Grim Resolve (unl-095-219)", () => {
  test("+3 Might this turn, and the buffed unit's combat win grants 2 XP", async () => {
    const game = await board(4).build();
    await game.p1.cast("grim", { targets: "poro" });
    await game.settle();
    expect(game.state("poro").might).toBe(5);
    expect(game.p1.xp()).toBe(0);

    await game.p1.move("poro", "bf1");
    await game.settle();

    // Poro fights at 5: it kills the 4-Might defender and survives its 4 damage, so it wins.
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.p1.xp()).toBe(2);
  });

  test("no XP when the buffed unit does not survive to win the combat", async () => {
    const game = await board(6).build();
    await game.p1.cast("grim", { targets: "poro" });
    await game.settle();
    expect(game.state("poro").might).toBe(5);

    await game.p1.move("poro", "bf1");
    await game.settle();

    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
  });

  test("a unit that never got the buff wins its combat without granting XP", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 5, name: "Poro" }, "poro")
      .unit(P2, "bf1", { might: 4, name: "Recruit" }, "foe")
      .build();
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.p1.xp()).toBe(0);
  });
});
