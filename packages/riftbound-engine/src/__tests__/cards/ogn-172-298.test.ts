/**
 * Rebuke — ogn-172-298 · Spell · Chaos · 2 energy + [chaos][chaos]
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Return a unit at a battlefield to its owner's hand.
 *
 * Targets any unit (friendly or enemy) that is at a battlefield — not one in
 * a base. The card goes to its OWNER's hand regardless of who controls it.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-172-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Foe at bf" }, "foe")
    .unit(P1, "bf1", { might: 2, name: "Mine at bf" }, "mine")
    .unit(P2, "base", { might: 1, name: "Foe at home" }, "home")
    .hand(P1, CARD, "rebuke");
}

describe("Rebuke (ogn-172-298)", () => {
  test("returns the chosen enemy unit at a battlefield to its owner's hand; pays 2 energy + 2 chaos; spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("rebuke", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("foe")).toBe("hand");
    expect(game.p2.hand()).toContain("foe");
    expect(game.zoneOf("rebuke")).toBe("trash");
  });

  test("a friendly unit at a battlefield is also a legal target and returns to your hand", async () => {
    const game = await board().build();
    await game.p1.cast("rebuke", { targets: "mine" });
    await game.settle();
    expect(game.p1.hand()).toContain("mine");
    expect(game.p2.units("bf1")).toEqual(["foe"]);
  });

  test("only units AT A BATTLEFIELD are offered — a unit in a base is not a legal target", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "rebuke")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["mine"]]));
    const r = await game.p1.try((p) => p.cast("rebuke", { targets: "home" }));
    expect(r.ok).toBe(false);
    const noBf = await scenario().resources(P1, { energy: 2, power: { chaos: 2 } }).unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "rebuke").build();
    expect(noBf.p1.can("cast", "rebuke")).toBe(false);
  });

  test("'its owner's hand': a unit you control but the opponent owns goes to the opponent's hand", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P1 })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 3, name: "Borrowed" }, owner: P2, zone: "bf1" })
      .hand(P1, CARD, "rebuke")
      .build();
    await game.p1.cast("rebuke", { targets: "stolen" });
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("hand");
    expect(game.state("stolen").owner).toBe(P2);
    expect(game.p2.hand()).toContain("stolen");
    expect(game.p1.hand()).not.toContain("stolen");
  });

  test("[Action] timing: not playable in the opponent's Neutral Open state; playable once a showdown opens", async () => {
    const game = await board().active(P2).battlefield("bf2").unit(P2, "base", { might: 1 }, "walker").build();
    expect(game.p1.can("cast", "rebuke")).toBe(false);
    await game.p2.move("walker", "bf2");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "rebuke")).toBe(true);
  });

  test("cost: unaffordable with only 1 chaos or only 1 energy", async () => {
    const oneChaos = await board().resources(P1, { energy: 2, power: { chaos: 1 } }).build();
    expect(oneChaos.p1.can("cast", "rebuke")).toBe(false);
    const oneEnergy = await board().resources(P1, { energy: 1, power: { chaos: 2 } }).build();
    expect(oneEnergy.p1.can("cast", "rebuke")).toBe(false);
  });
});
