/**
 * Fading Memories — ogn-180-298 · Spell · Chaos · 4 energy + 1 [chaos]
 *
 *   Give a unit at a battlefield or a gear [Temporary]. (Kill it at the start of
 *   its controller's Beginning Phase, before scoring.)
 *
 * Rules: 816.1.b (Temporary ≡ "At the start of this permanent's controller's
 * Beginning Phase, before scoring, kill this"), 816.1.c (trigger condition is the
 * CONTROLLER's Beginning Phase starting). The grant has no duration of its own.
 *
 * Engine status: the parser produced a nonsense target (`gear` with tag "Unit At A
 * Battlefield Or A"), so the spell is never offered — every behavioural clause is BUG.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-180-298";

function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
    .gear(P2, { name: "Trinket" }, "trinket")
    .hand(P1, CARD, "fm");
}

describe("Fading Memories (ogn-180-298)", () => {
  test.failing("BUG: costs 4 energy + 1 chaos; castable on a unit at a battlefield; goes to trash", async () => {
    // Expected: legal with 4 energy + 1 chaos and a battlefield unit; paying empties the pool.
    // Actual: no legal targets are ever found, so `cast` is not offered at all.
    const game = await board().build();
    expect(game.p1.can("cast", "fm")).toBe(true);
    await game.p1.cast("fm", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("fm")).toBe("trash");
  });

  test("not castable without the chaos power or with only 3 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 4 }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "fm").build();
    expect(noPower.p1.can("cast", "fm")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 3, power: { chaos: 1 } }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "fm").build();
    expect(lowEnergy.p1.can("cast", "fm")).toBe(false);
  });

  test.failing("BUG: legal targets are units AT A BATTLEFIELD (either side) and any gear — not units in a base", async () => {
    // Expected: foe, mine, trinket offered; home (in base) rejected. Actual: nothing is offered.
    const game = await board().build();
    const targets = game.p1.option("cast", "fm")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["mine"], ["trinket"]]));
    const t = await game.p1.try((p) => p.cast("fm", { targets: "home" }));
    expect(t.ok).toBe(false);
  });

  test.failing("BUG: the unit gains Temporary and is killed at the start of ITS CONTROLLER's next Beginning Phase (rule 816.1.b/c)", async () => {
    // Expected: foe (P2's) keeps Temporary through P1's turn and dies as P2's turn begins.
    // Actual: spell cannot be cast.
    const game = await board().build();
    await game.p1.cast("fm", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").keywords).toContain("Temporary");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1"); // nothing happens immediately
    await game.advanceTurn(); // P1 ends → P2's Beginning Phase kills it
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
  });

  test.failing("BUG: a friendly Temporary unit survives the opponent's turn and dies only when YOUR Beginning Phase starts", async () => {
    // Expected: mine (P1's) is untouched during P2's turn, killed when P1's next turn begins.
    const game = await board().build();
    await game.p1.cast("fm", { targets: "mine" });
    await game.settle();
    await game.advanceTurn(); // → P2
    expect(game.zoneOf("mine")).toBe("battlefield-bf1");
    expect(game.state("mine").keywords).toContain("Temporary"); // not a "this turn" grant
    await game.advanceTurn(); // → P1: Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("mine")).toBe("trash");
  });

  test.failing("BUG: a gear can be given Temporary and is killed at the start of its controller's Beginning Phase", async () => {
    // Expected: P2's Trinket goes to trash as P2's turn begins. Actual: spell cannot be cast.
    const game = await board().build();
    await game.p1.cast("fm", { targets: "trinket" });
    await game.settle();
    expect(game.state("trinket").keywords).toContain("Temporary");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("trinket")).toBe("trash");
  });
});
