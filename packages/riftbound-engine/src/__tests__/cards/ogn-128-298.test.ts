/**
 * Challenge — ogn-128-298 · Spell · Body · 2 energy + 1 [body]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Choose a friendly unit and an enemy unit. They deal damage equal to their
 *   Mights to each other.
 *
 * Rule 417.6.b.3: the damage is dealt by the chosen units (not by Challenge).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-128-298";

function board(energy = 2, power: Record<string, number> = { body: 1 }) {
  return scenario()
    .resources(P1, { energy, power })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 4, name: "Brawler" }, "brawler")
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "bf1", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 6, name: "Giant" }, "giant")
    .hand(P1, CARD, "ch");
}

describe("Challenge (ogn-128-298)", () => {
  test("costs 2 energy + 1 body; a friendly 4 and an enemy 3 hit each other — the 3 dies, the 4 survives with 3 damage", async () => {
    const game = await board().build();
    await game.p1.cast("ch", { targets: ["brawler", "raider"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("ch")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("brawler")).toBe("base");
    expect(game.state("brawler").damage).toBe(3);
    expect(game.zoneOf("ch")).toBe("trash");
  });

  test("the friendly unit can die too: a friendly 2 into an enemy 6 — the 2 dies, the 6 takes 2", async () => {
    const game = await board().build();
    await game.p1.cast("ch", { targets: ["squire", "giant"] });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.zoneOf("giant")).toBe("base");
    expect(game.state("giant").damage).toBe(2);
  });

  test("equal Mights trade: both units die", async () => {
    const game = await board().unit(P2, "base", { might: 4 }, "twin").build();
    await game.p1.cast("ch", { targets: ["brawler", "twin"] });
    await game.settle();
    expect(game.zoneOf("brawler")).toBe("trash");
    expect(game.zoneOf("twin")).toBe("trash");
  });

  test("damage equals CURRENT Might: a buffed friendly 4 (=5) deals 5", async () => {
    const game = await board().unit(P1, "base", { might: 4 }, "pumped", { buffed: true }).build();
    expect(game.state("pumped").might).toBe(5);
    await game.p1.cast("ch", { targets: ["pumped", "giant"] });
    await game.settle();
    expect(game.state("giant").damage).toBe(5);
    expect(game.zoneOf("pumped")).toBe("trash"); // took 6 ≥ 5
  });

  test("needs one friendly AND one enemy unit: two friendlies or two enemies are not a legal choice", async () => {
    const game = await board().build();
    const ff = await game.p1.try((p) => p.cast("ch", { targets: ["brawler", "squire"] }));
    expect(ff.ok).toBe(false);
    const ee = await game.p1.try((p) => p.cast("ch", { targets: ["raider", "giant"] }));
    expect(ee.ok).toBe(false);
    const noEnemy = await scenario().resources(P1, { energy: 2, power: { body: 1 } }).unit(P1, "base", { might: 2 }, "a").hand(P1, CARD, "ch").build();
    expect(noEnemy.p1.can("cast", "ch")).toBe(false);
    const noFriendly = await scenario().resources(P1, { energy: 2, power: { body: 1 } }).unit(P2, "base", { might: 2 }, "e").hand(P1, CARD, "ch").build();
    expect(noFriendly.p1.can("cast", "ch")).toBe(false);
  });

  test("not affordable with 1 energy or without a body power", async () => {
    expect((await board(1).build()).p1.can("cast", "ch")).toBe(false);
    expect((await board(2, {}).build()).p1.can("cast", "ch")).toBe(false);
  });

  test("[Action] timing: playable with Focus in a showdown, not on the opponent's turn", async () => {
    const game = await board().build();
    await game.p1.move("squire", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("cast", "ch")).toBe(true);
    await game.p1.cast("ch", { targets: ["squire", "raider"] });
    await game.p1.pass();
    await game.p2.pass(); // Challenge resolves inside the showdown
    expect(game.zoneOf("squire")).toBe("trash"); // took 3
    expect(game.state("raider").damage).toBe(2);
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "ch")).toBe(false);
  });
});
