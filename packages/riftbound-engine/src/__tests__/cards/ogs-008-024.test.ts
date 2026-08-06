/**
 * Gentlemen's Duel — ogs-008-024 · Spell · Body · 6 energy + [body] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Give a friendly unit +3 [Might] this turn. Then choose an enemy unit. They deal
 *   damage equal to their Mights to each other.
 *
 * Rules: 806 Action, 417.6.b.3 (Challenge-style: the two units deal the damage to each
 * other, simultaneously, using their current Might — the +3 is applied first), 520 (lethal
 * damage kills outside combat too; non-combat damage is not healed until end of turn).
 * No location restriction on either unit.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-008-024";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2 }, "small")
    .unit(P1, "bf1", { might: 5 }, "big")
    .unit(P2, "bf1", { might: 4 }, "foe")
    .unit(P2, "base", { might: 9 }, "home")
    .hand(P1, CARD, "duel");
}

describe("Gentlemen's Duel (ogs-008-024)", () => {
  test("costs 6 energy + 1 body; goes to trash; unaffordable without the body or at 5 energy", async () => {
    const game = await board().build();
    await game.p1.cast("duel", { targets: ["big", "foe"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.zoneOf("duel")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("duel")).toBe("trash");
    const noBody = await board().resources(P1, { energy: 7, power: { body: 0 } }).build();
    expect(noBody.p1.can("cast", "duel")).toBe(false);
    const low = await board().resources(P1, { energy: 5, power: { body: 1 } }).build();
    expect(low.p1.can("cast", "duel")).toBe(false);
  });

  test("choices: any friendly unit then any enemy unit — base or battlefield, in that role order", async () => {
    const game = await board().build();
    const tuples = game.p1.option("cast", "duel")?.fields.find((f) => f.arg === "targets")?.options as string[][];
    expect(new Set(tuples.map((t) => t[0]))).toEqual(new Set(["small", "big"]));
    expect(new Set(tuples.map((t) => t[1]))).toEqual(new Set(["foe", "home"]));
    expect(tuples).toHaveLength(4); // 2 friendly × 2 enemy — never friendly/friendly or enemy/enemy
  });

  test("they deal damage equal to their Mights to each other: big (5) vs foe (4) → foe dies, big survives carrying 4 damage", async () => {
    const game = await board().build();
    await game.p1.cast("duel", { targets: ["big", "foe"] });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("big")).toBe("battlefield-bf1");
    expect(game.state("big").damage).toBe(4);
    expect(game.state("small").damage).toBe(0); // uninvolved units untouched
    expect(game.state("home").damage).toBe(0);
  });

  test("works across locations: big at bf1 duels the 9-Might 'home' in the enemy base → big takes 9 and dies, home survives damaged", async () => {
    const game = await board().build();
    await game.p1.cast("duel", { targets: ["big", "home"] });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash"); // 9 ≥ 5 (or 8 with the pump) — lethal either way
    expect(game.zoneOf("home")).toBe("base"); // took big's Might, which is < 9
    expect(game.state("home").damage).toBeGreaterThan(0);
  });

  test.failing("BUG: '+3 Might this turn' comes first — small (2→5) vs foe (4): foe takes 5 and dies, small takes 4 < 5 and lives", async () => {
    // Expected: small is pumped to 5 before the exchange, kills the 4-Might foe and survives with
    // 4 damage; the +3 lasts until end of turn. Actual: no +3 is applied — small deals 2 and dies.
    const game = await board().build();
    await game.p1.cast("duel", { targets: ["small", "foe"] });
    await game.settle();
    expect(game.zoneOf("small")).toBe("base");
    expect(game.state("small").might).toBe(5);
    expect(game.state("small").damage).toBe(4);
    expect(game.zoneOf("foe")).toBe("trash");
    await game.advanceTurn();
    expect(game.state("small").might).toBe(2); // "this turn" only
  });

  test("[Action]: not playable on the opponent's turn outside a showdown; playable with Focus inside one", async () => {
    const idle = await board().active(P2).build();
    expect(idle.p1.can("cast", "duel")).toBe(false);
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 6, power: { body: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 5 }, "def")
      .unit(P2, "base", { might: 4 }, "atk")
      .hand(P1, CARD, "duel")
      .build();
    await game.p2.move("atk", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "duel")).toBe(true);
    await game.p1.cast("duel", { targets: ["def", "atk"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("atk")).toBe("trash"); // took ≥5 before combat even starts
    expect(game.locationOf("def")).toBe("bf1");
  });
});
