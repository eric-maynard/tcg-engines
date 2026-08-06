/**
 * Mask of Foresight — ogn-060-298 · Gear · Calm · 2 energy
 *
 *   When a friendly unit attacks or defends alone, give it +1 [Might] this turn.
 *
 * Rule 740.2.a — a unit is alone when no other friendly unit is at its
 * location. Attack/defend designations happen when combat opens (before the
 * showdown), so the +1 applies to that combat's damage step (rule 465.2).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-060-298";

describe("Mask of Foresight (ogn-060-298)", () => {
  test("costs 2 energy to play as a gear into your base", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "mask").build();
    expect(game.p1.can("playGear", "mask")).toBe(true);
    await game.p1.play("mask");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("mask")).toBe("base");
    expect(game.p1.gear()).toContain("mask");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "mask").build();
    expect(poor.p1.can("playGear", "mask")).toBe(false);
  });

  test.failing("BUG: a friendly unit attacking ALONE gets +1 Might this turn (3 vs 3: attacker survives and conquers)", async () => {
    // Expected: ally becomes 4 might for the turn → deals lethal 4 to the 3-might foe, takes 3 (< 4),
    // survives, conquers bf1; the bonus lasts until end of turn. Actual: the `attack` event carries
    // no owner so the {controller:"friendly"} matcher never fires — both units trade and die.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, CARD, "mask")
      .unit(P1, "base", { might: 3 }, "ally")
      .unit(P2, "bf1", { might: 3 }, "foe")
      .build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("ally")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3); // "this turn" only
  });

  test("attacking with TWO friendly units is not 'alone': neither gets a bonus", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .gear(P1, CARD, "mask")
      .unit(P1, "base", { might: 2 }, "a1")
      .unit(P1, "base", { might: 2 }, "a2")
      .unit(P2, "bf1", { might: 4 }, "wall")
      .build();
    await game.p1.move(["a1", "a2"], "bf1");
    await game.settle({ policy: "first" });
    // 2+2 = 4 kills the wall; the wall's 4 is exactly lethal to both 2-might attackers → everyone dies,
    // nobody conquers. Any +1 would leave a 3-might attacker standing on bf1.
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("a1")).toBe("trash");
    expect(game.zoneOf("a2")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.points()).toBe(0);
  });

  test.failing("BUG: a friendly unit DEFENDING alone gets +1 Might this turn (3-might defender holds against a 3-might attacker)", async () => {
    // Expected: P1's lone defender becomes 4 → kills the 3-might attacker and survives (3 < 4);
    // bf1 stays with P1. Actual: "defend-alone" is not a known trigger event, nothing fires,
    // both units die.
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .gear(P1, CARD, "mask")
      .unit(P1, "bf1", { might: 3 }, "guard")
      .unit(P2, "base", { might: 3 }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("guard").might).toBe(4);
  });

  test("only FRIENDLY units: an enemy unit attacking alone into my lone unit gets no bonus from my Mask", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .gear(P1, CARD, "mask")
      .unit(P1, "bf1", { might: 4 }, "guard")
      .unit(P2, "base", { might: 3 }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    // Raider stays 3: deals 3 (< 4) to guard, guard survives; raider takes 4 and dies.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
