/**
 * Sunlit Guardian — ogn-054-298 · Unit · Calm · 3 energy · 3 Might
 *
 *   [Shield] (+1 [Might] while I'm a defender.)
 *   [Tank] (I must be assigned combat damage first.)
 *
 * Rules: 814.1.c (Shield = +X Might while a defender; X omitted → 1),
 * 815.1.b (Tank: must be assigned lethal damage before non-Tank units of the
 * same controller), 143.3.b.2 (damage heals in the combat cleanup).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-054-298";

describe("Sunlit Guardian (ogn-054-298)", () => {
  test("costs 3 energy; a 3-Might unit with the Shield and Tank keywords", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "sg").build();
    await game.p1.play("sg");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("sg")).toBe("base");
    expect(game.state("sg").might).toBe(3);
    expect(game.state("sg").keywords).toEqual(expect.arrayContaining(["Shield", "Tank"]));
    const poor = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "sg").build();
    expect(poor.p1.can("play", "sg")).toBe(false);
  });

  test("[Shield]: as a defender it is 4 Might — a 3-Might attacker dies and the Guardian survives", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", CARD, "sg")
      .unit(P1, "base", { might: 3 }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("atk")).toBe("trash"); // took 3 ≥ 3
    expect(game.zoneOf("sg")).toBe("battlefield-bf1"); // took 3 < 3+1
    expect(game.state("sg").damage).toBe(0); // healed in combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("[Shield] does not apply while attacking: Guardian (3) into a 3-Might defender → both die", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "sg")
      .unit(P2, "bf1", { might: 3 }, "def")
      .build();
    await game.p1.move("sg", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("sg")).toBe("trash");
  });

  test("[Tank]: combat damage must go to the Guardian first, sparing a weaker ally beside it", async () => {
    // Control: without Tank the engine's assignment kills the first-listed 2-Might unit.
    const control = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "small")
      .unit(P2, "bf1", { might: 4 }, "big")
      .unit(P1, "base", { might: 3 }, "atk")
      .build();
    await control.p1.move("atk", "bf1");
    await control.settle();
    expect(control.zoneOf("small")).toBe("trash");

    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "small")
      .unit(P2, "bf1", CARD, "sg")
      .unit(P1, "base", { might: 3 }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    // All 3 damage lands on the Tank (4 Might as defender → not lethal); nothing reaches "small".
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.zoneOf("sg")).toBe("battlefield-bf1");
    expect(game.zoneOf("atk")).toBe("trash"); // took 4 + 2
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
