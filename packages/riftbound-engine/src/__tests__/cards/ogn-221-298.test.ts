/**
 * Imperial Decree — ogn-221-298 · Spell · Order · 5 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   When any unit takes damage this turn, kill it.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-221-298";
const HEXTECH_RAY = "ogn-009-298"; // Deal 3 to a unit at a battlefield (1 energy)

describe("Imperial Decree (ogn-221-298)", () => {
  test("any unit that takes non-lethal spell damage this turn is killed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { fury: 1, order: 2, rainbow: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "decree")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.locationOf("foe")).toBe("bf1");
    await game.p1.cast("ray", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("base");
  });

  test("non-lethal combat damage also kills under Imperial Decree", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 2, rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "foe")
      .unit(P1, "base", { might: 1 }, "poke")
      .hand(P1, CARD, "decree")
      .build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.move("poke", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("poke")).toBe("trash");
  });
});
