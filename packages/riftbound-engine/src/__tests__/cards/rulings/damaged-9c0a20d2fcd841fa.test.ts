/**
 * Ruling 9c0a20d2fcd841fa — (no specific card) what "damaged" means.
 *   Exercised with Warwick, Hunter (OGN-159 → ogn-159-298) "When I attack, kill all damaged enemy units here."
 *
 * Q: Is a "damaged" unit one whose Might is lower than printed, or one with damage marked on it?
 * A: One with damage MARKED on it. Damage never lowers Might — Might is both attack power and the
 *    damage capacity. A unit whose Might was reduced by an effect but carries no damage is NOT damaged;
 *    a buffed unit with 1 damage on it IS damaged. Marked damage is cleared at the end of a combat and
 *    at end of round — not by an ordinary non-combat showdown.
 * Rules: 142 (damage is marked on a unit; lethal = marked ≥ Might), 466.1.a.1 (Combat Cleanup heals all
 *        units), 317 (Ending Phase heal), 465.2 (combat uses CURRENT Might).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298"; // 5 Might; "When I attack, kill all damaged enemy units here."

/** "[Action] Deal 2 to a unit at a battlefield." */
const SNIPE = {
  abilities: [
    {
      effect: { amount: 2, target: { location: "battlefield", type: "unit" }, type: "damage" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Snipe",
  rulesText: "[Action] Deal 2 to a unit at a battlefield.",
  timing: "action",
} as const;

describe("Ruling 9c0a20d2fcd841fa — 'damaged' means marked damage, never reduced Might", () => {
  test("dealing 2 to a 6-Might unit marks 2 damage and leaves its Might at 6 — the unit is damaged", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
      .hand(P1, SNIPE, "snipe")
      .build();
    await game.p1.cast("snipe", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ baseMight: 6, damage: 2, might: 6 });
    expect(game.violations()).toEqual([]);
  });

  test("Might reduced by an effect but no damage marked: Warwick's 'all damaged enemy units' does NOT kill it", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Shrunk" }, "shrunk", { mightModifier: -4 })
      .unit(P1, "base", WARWICK, "warwick")
      .build();
    expect(game.state("shrunk")).toMatchObject({ damage: 0, might: 2 }); // weaker, not damaged
    await game.p1.move("warwick", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "warwick", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // the attack trigger resolves
    expect(game.zoneOf("shrunk")).toBe("battlefield-bf1"); // survived the sweep
    expect(game.violations()).toEqual([]);
  });

  test("a BUFFED unit with only 1 damage marked is still damaged — Warwick's sweep kills it even at 1 of 8", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Bulwark" }, "bulwark", { buffed: true, damage: 1 })
      .unit(P1, "base", WARWICK, "warwick")
      .build();
    expect(game.state("bulwark").damage).toBe(1);
    expect(game.state("bulwark").isBuffed).toBe(true);
    expect(game.state("bulwark").might).toBeGreaterThanOrEqual(6); // far more Might than marked damage
    await game.p1.move("warwick", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("bulwark")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("marked damage survives a non-combat showdown at a previously uncontrolled battlefield", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2")
      .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .hand(P1, SNIPE, "snipe")
      .build();
    await game.p1.cast("snipe", { targets: "brute" });
    await game.settle();
    expect(game.state("brute").damage).toBe(2);
    await game.p1.move("scout", "bf2"); // a showdown, but no combat anywhere
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.state("brute").damage).toBe(2); // still marked
    expect(game.violations()).toEqual([]);
  });

  test("a COMBAT does heal: after the damage step and Combat Cleanup every survivor is back to 0 marked damage", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash"); // 6 ≥ 3
    expect(game.state("brute").damage).toBe(0); // took 3 of 6, healed by 466.1.a.1
    expect(game.violations()).toEqual([]);
  });
});
