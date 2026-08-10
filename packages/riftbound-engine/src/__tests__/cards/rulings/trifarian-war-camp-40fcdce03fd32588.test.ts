/**
 * Ruling 40fcdce03fd32588 — Trifarian War Camp (ogn-294-298) × Smoke Screen (ogn-093-298) × Stupefy (ogn-095-298)
 *   War Camp (battlefield): "Units here have +1 [Might]. (This includes attackers.)"
 *   Smoke Screen: "[Reaction] Give a unit -4 [Might] this turn, to a minimum of 1 [Might]." (2 + [mind])
 *   Stupefy: "[Reaction] Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1." (1)
 *
 * Q: If a unit at the War Camp is reduced "to a minimum of 1" by Smoke Screen / Stupefy, does it sit at 1, or does the
 *    Camp's +1 keep it above that?
 * A: It is 1 while at the Camp (4 + 1 = 5, then 5 − 4 = 1 — additions and subtractions apply symmetrically). Once it moves
 *    off the Camp it loses the +1 and drops to 0.
 * Rules: 476–478 (Might arithmetic / layers; "to a minimum of 1" bounds the reduction when applied, the +1 is a separate
 *        continuous bonus that ends when the unit leaves).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const SMOKE_SCREEN = "ogn-093-298";
const STUPEFY = "ogn-095-298";

function campWith(might: number) {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("camp", { controller: P1, def: WAR_CAMP, inert: false })
    .unit(P1, "camp", { might, name: "Legionnaire" }, "legion")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, STUPEFY, "stupefy");
}

describe("Ruling 40fcdce03fd32588 — 'to a minimum of 1' at the War Camp: 1 while there, 0 after leaving", () => {
  test("Smoke Screen: a printed-4 unit is 5 at the Camp, Smoke Screen takes it to exactly 1 there, and moving it to base (losing the Camp's +1) leaves it at 0", async () => {
    const game = await campWith(4).build();
    expect(game.state("legion")).toMatchObject({ baseMight: 4, might: 5 }); // 4 + 1 (Camp)
    await game.p1.cast("smoke", { targets: "legion" });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.locationOf("legion")).toBe("camp");
    expect(game.state("legion").might).toBe(1); // 5 − 4 = 1 (the floor is met exactly; the Camp does not lift it to 2)

    await game.p1.move("legion", "base");
    await game.settle();
    expect(game.locationOf("legion")).toBe("base");
    expect(game.state("legion").might).toBe(0); // 4 − 4, no Camp bonus any more
    expect(game.violations()).toEqual([]);
  });

  test("Stupefy: a printed-1 unit is 2 at the Camp, Stupefy takes it to 1 there (and draws 1), and back in base it is 0", async () => {
    const game = await campWith(1).build();
    expect(game.state("legion").might).toBe(2);
    const hand = game.p1.hand().length;
    await game.p1.cast("stupefy", { targets: "legion" });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.state("legion").might).toBe(1);
    await game.p1.move("legion", "base");
    await game.settle();
    expect(game.state("legion").might).toBe(0);
  });

  test("the reduction is 'this turn': next turn the unit in base is back to its printed Might", async () => {
    const game = await campWith(4).build();
    await game.p1.cast("smoke", { targets: "legion" });
    await game.settle();
    await game.p1.move("legion", "base");
    await game.settle();
    expect(game.state("legion").might).toBe(0);
    await game.advanceTurn();
    expect(game.state("legion").might).toBe(4);
  });
});
