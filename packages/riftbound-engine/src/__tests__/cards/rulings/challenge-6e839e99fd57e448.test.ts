/**
 * Ruling 6e839e99fd57e448 — Challenge (OGN-128 → ogn-128-298) · Spell · Body · [2][body] · [Action]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *
 * Q: A showdown is going on. I Challenge my unit AT BASE against a unit in the showdown. Does my base unit heal
 *    when the combat ends, even though it never fought?
 * A: Yes. Combat Cleanup heals EVERY unit in play simultaneously, wherever it stands and whether or not it took
 *    part. The one exception is the unit Challenge already killed: it is no longer in play, so nothing heals it.
 * Rules: 461.1 / 461.1.a.1 (Combat Cleanup heals all units in play), 417 (damage marked), 422 (kill = to trash).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";

/** P1's turn, exactly Challenge's [2][body]. bf1 is P2's with a Defender; P1 has an Attacker and a stay-at-home unit. */
function board(homeMight: number, defenderMight: number) {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: defenderMight, name: "Defender" }, "def")
    .unit(P1, "base", { might: 6, name: "Attacker" }, "atk")
    .unit(P1, "base", { might: homeMight, name: "Homebody" }, "home")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 6e839e99fd57e448 — Combat Cleanup heals a unit that stayed at base and was hurt by Challenge", () => {
  test("Challenge reaches across locations: base Homebody (5) and the Defender (2) trade Might damage, the Defender dies", async () => {
    const game = await board(5, 2).build();
    await game.p1.move("atk", "bf1");
    expect(game.state("atk").combatRole).toBe("attacker");
    await game.p1.cast("challenge", { targets: ["home", "def"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("def")).toBe("trash"); // 5 ≥ 2
    expect(game.state("home")).toMatchObject({ damage: 2, zone: "base" }); // never left base
    expect(game.zoneOf("challenge")).toBe("trash");
  });

  test("…and once the showdown ends the base unit is healed too — 2 damage gone without it ever being in combat", async () => {
    const game = await board(5, 2).build();
    await game.p1.move("atk", "bf1");
    await game.p1.cast("challenge", { targets: ["home", "def"] });
    await game.settle();
    expect(game.state("home")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.locationOf("home")).toBe("base");
    expect(game.state("atk").damage).toBe(0); // the combatant heals as well
    expect(game.violations()).toEqual([]);
  });

  test("the exception the answer names — a base unit KILLED by Challenge is not in play, so cleanup never heals it back", async () => {
    const game = await board(2, 3).build();
    await game.p1.move("atk", "bf1");
    await game.p1.cast("challenge", { targets: ["home", "def"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("home")).toBe("trash"); // 3 ≥ 2
    expect(game.state("def").damage).toBe(2); // survives on 3 Might
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash"); // still dead after Combat Cleanup
    expect(game.state("atk").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
