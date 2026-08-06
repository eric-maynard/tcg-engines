/**
 * Block — ogn-057-298 · Spell · Calm · 2 energy · Action
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Give a unit [Shield 3] and [Tank] this turn. (+3 [Might] while it's a
 *   defender. It must be assigned combat damage first.)
 *
 * Rules: 811 Hidden (hide at a battlefield you control for [rainbow]; from the
 * next turn play it from facedown ignoring its cost, targets restricted to that
 * battlefield — 811.1.d.2), Shield (defender-only Might), Tank (assigned combat
 * damage first).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const BLOCK = "ogn-057-298";

/** P2's turn; P2 attacks P1's bf1 with `atk`; P1 holds Block with 2 energy. */
function defence(attackerMight: number) {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1 }, "small")
    .unit(P1, "bf1", { might: 3 }, "big")
    .unit(P2, "base", { might: attackerMight }, "atk")
    .hand(P1, BLOCK, "block");
}

describe("Block (ogn-057-298)", () => {
  test("costs 2 energy; gives the chosen unit (friendly or enemy) Shield 3 and Tank this turn; goes to trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "base", { might: 2 }, "foe")
      .hand(P1, BLOCK, "block")
      .build();
    const targets = game.p1.option("cast", "block")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["foe"]]));
    await game.p1.cast("block", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("ally").grantedKeywords).toEqual([
      { duration: "turn", keyword: "Shield", value: 3 },
      { duration: "turn", keyword: "Tank" },
    ]);
    expect(game.state("ally").might).toBe(2); // Shield only counts while defending
    expect(game.zoneOf("block")).toBe("trash");
    const poor = await scenario().resources(P1, { energy: 1 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, BLOCK, "block").build();
    expect(poor.p1.can("cast", "block")).toBe(false);
  });

  test("'this turn': the granted keywords are gone next turn", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, BLOCK, "block").build();
    await game.p1.cast("block", { targets: "ally" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("ally").grantedKeywords).toEqual([]);
  });

  test("Action timing: not playable on the opponent's turn outside a showdown", async () => {
    const game = await scenario().active(P2).resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, BLOCK, "block").build();
    expect(game.p1.can("cast", "block")).toBe(false);
  });

  test("Action timing + Shield 3: cast in a showdown, a 3-might defender (+3) survives a 5-might attacker, who dies", async () => {
    const game = await defence(5).build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("block", { targets: "big" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.locationOf("big")).toBe("bf1");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Tank: combat damage must be assigned to the Blocked unit first (the 1-might ally survives a 3-might attacker)", async () => {
    const control = await defence(3).build();
    await control.p2.move("atk", "bf1");
    await control.settle();
    expect(control.zoneOf("small")).toBe("trash"); // without Tank the attacker kills the small unit

    const game = await defence(3).build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("block", { targets: "big" });
    await game.settle();
    expect(game.locationOf("small")).toBe("bf1");
    expect(game.locationOf("big")).toBe("bf1");
  });

  test("Hidden: hide for [rainbow] at a battlefield you control (facedown); not without power, not at an enemy battlefield", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .hand(P1, BLOCK, "block")
      .build();
    await game.p1.hide("block", "bf1");
    expect(game.zoneOf("block")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]); // hiding does not open a chain (811.1.c.2)
    expect(game.p1.can("reveal", "block")).toBe(false); // not on the turn it was hidden
    const noPower = await scenario().resources(P1, { energy: 5 }).battlefield("bf1", { controller: P1 }).hand(P1, BLOCK, "block").build();
    expect(noPower.p1.can("hide", "block")).toBe(false);
    const enemyBf = await scenario().resources(P1, { power: { rainbow: 1 } }).battlefield("bf1", { controller: P2 }).hand(P1, BLOCK, "block").build();
    expect(enemyBf.p1.can("hide", "block")).toBe(false);
  });

  test("from facedown on a later turn: played for 0 energy, target restricted to a unit at that battlefield", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2 }, "here")
      .unit(P1, "bf2", { might: 2 }, "there")
      .hand(P1, BLOCK, "block")
      .build();
    await game.p1.hide("block", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    await game.p1.reveal("block");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "block", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("here").keywords).toEqual(["Shield", "Tank"]);
    expect(game.state("there").grantedKeywords).toEqual([]);
    expect(game.zoneOf("block")).toBe("trash");
  });
});
