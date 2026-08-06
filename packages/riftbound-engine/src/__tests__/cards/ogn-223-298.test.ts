/**
 * Peak Guardian — ogn-223-298 · Unit · Order · 6 energy + [order] · 5 Might
 *
 *   When you play me, buff me. Then, if I am at a battlefield, buff all other friendly units
 *   there. (To buff a unit, give it a +1 [Might] buff if it doesn't already have one.)
 *
 * Rules: triggered "when you play me"; Buff = a single +1 Might buff marker (a unit can hold at
 * most one); "there" = the battlefield Peak Guardian was played to; units in base or at another
 * battlefield, and enemy units, are not buffed.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-223-298";

function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { order: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "HereA" }, "hereA")
    .unit(P1, "bf1", { might: 3, name: "HereBuffed" }, "hereBuffed", { buffed: true })
    .unit(P1, "bf2", { might: 2, name: "Elsewhere" }, "elsewhere")
    .unit(P1, "base", { might: 2, name: "Home" }, "home")
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CARD, "pg");
}

describe("Peak Guardian (ogn-223-298)", () => {
  test("cost: 6 energy + 1 order deducted; 5 printed Might; unaffordable without the order or with 5 energy", async () => {
    const game = await board().build();
    await game.p1.play("pg", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("pg").baseMight).toBe(5);
    const noOrder = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "pg").build();
    expect(noOrder.p1.can("play", "pg")).toBe(false);
    const low = await scenario().resources(P1, { energy: 5, power: { order: 1 } }).hand(P1, CARD, "pg").build();
    expect(low.p1.can("play", "pg")).toBe(false);
  });

  test("when played (to base): the trigger buffs Peak Guardian itself → 6 Might; nothing else in base is buffed", async () => {
    const game = await board().build();
    await game.p1.play("pg", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pg", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("pg").isBuffed).toBe(true);
    expect(game.state("pg").might).toBe(6);
    expect(game.state("home").isBuffed).toBe(false); // "if I am at a battlefield" is false in base
    expect(game.state("hereA").isBuffed).toBe(false);
  });

  test("played to a battlefield, it also buffs all OTHER FRIENDLY units THERE (only there, not enemies)", async () => {
    // Expected: pg buffed (6); hereA buffed (3); hereBuffed keeps its single buff (4); elsewhere/home/foe
    // untouched. Actual: the parsed ability only carries "buff me" — the conditional mass buff is missing.
    const game = await board().build();
    await game.p1.play("pg", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("pg")).toBe("bf1");
    expect(game.state("pg").might).toBe(6);
    expect(game.state("hereA").isBuffed).toBe(true);
    expect(game.state("hereA").might).toBe(3);
    expect(game.state("hereBuffed").might).toBe(4); // a buff doesn't stack on an already-buffed unit
    expect(game.state("elsewhere").isBuffed).toBe(false);
    expect(game.state("home").isBuffed).toBe(false);
    expect(game.state("foe").isBuffed).toBe(false);
  });

  test("played to a battlefield: Peak Guardian itself is still buffed and enemy / off-site units are not", async () => {
    const game = await board().build();
    await game.p1.play("pg", { to: "bf1" });
    await game.settle();
    expect(game.state("pg").isBuffed).toBe(true);
    expect(game.state("foe").isBuffed).toBe(false);
    expect(game.state("elsewhere").isBuffed).toBe(false);
    expect(game.state("home").isBuffed).toBe(false);
    expect(game.state("hereBuffed").might).toBe(4);
  });
});
