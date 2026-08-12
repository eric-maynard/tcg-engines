/**
 * Ruling 52fed3838ec99e55 — (no specific card) the scope of the Combat Cleanup heal.
 *
 * Q: Does the combat/showdown cleanup heal units that were damaged on a DIFFERENT battlefield?
 * A: Yes. The Combat Cleanup heals ALL units — whatever battlefield (or base) they are at, whoever
 *    controls them, whether or not they were in the showdown, and however the damage was dealt (combat
 *    or effect damage alike).
 * Rules: 466.1.a.1 (the Combat Special Cleanup inserts "3c. Heal all Units"), 715 (effect damage is
 *        marked damage like any other), 317 (healing removes marked damage).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Action] "Deal 2 to a unit." — used to mark damage far away from the combat. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

/**
 * bf1: the combat (P1's 4-Might Raider will attack P2's 2-Might Guard).
 * bf2: P2's 6-Might Bystander, already carrying 3 damage from an earlier turn.
 * Bases: P1's 5-Might Reserve carries 2, P2's 5-Might Homebody carries 1.
 */
const board = () =>
  scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "bf2", { might: 6, name: "Bystander" }, "bystander", { damage: 3 })
    .unit(P1, "base", { might: 5, name: "Reserve" }, "reserve", { damage: 2 })
    .unit(P2, "base", { might: 5, name: "Homebody" }, "homebody", { damage: 1 })
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider");

describe("Ruling 52fed3838ec99e55 — the Combat Cleanup heals every unit in the game, not just the combatants", () => {
  test("before the combat everyone still carries their marked damage", async () => {
    const game = await board().build();
    expect(game.state("bystander").damage).toBe(3);
    expect(game.state("reserve").damage).toBe(2);
    expect(game.state("homebody").damage).toBe(1);
  });

  test("resolving a combat at bf1 heals the unit at bf2 and BOTH players' units in base", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash"); // 4 vs 2
    expect(game.state("bystander").damage).toBe(0); // different battlefield, not in the showdown
    expect(game.state("reserve").damage).toBe(0); // attacker's base
    expect(game.state("homebody").damage).toBe(0); // defender's base
    expect(game.state("raider").damage).toBe(0); // the survivor's own combat damage too
    expect(game.violations()).toEqual([]);
  });

  test("effect damage counts the same: a spell marks 2 on the far-away Bystander during the showdown and the cleanup wipes it", async () => {
    const game = await board().hand(P1, BOLT, "bolt").build();
    await game.p1.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    await game.p1.cast("bolt", { targets: "bystander" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("bystander").damage).toBe(5); // 3 old + 2 from the spell
    await game.settle();
    expect(game.state("bystander")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
  });
});
