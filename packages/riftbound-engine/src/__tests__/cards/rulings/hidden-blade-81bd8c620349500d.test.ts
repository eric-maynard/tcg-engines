/**
 * Ruling 81bd8c620349500d — Hidden Blade (OGN-213 → ogn-213-298) · Action · Order · [2][order]
 *   "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Played from hand during a showdown, does Hidden Blade kill the unit before combat damage is calculated?
 * A: Yes. Spells resolve while the showdown is still running; combat damage is only dealt once both players
 *    pass Focus on an empty chain. The killed unit is already gone, so it neither deals nor receives combat damage.
 * Rules: 347 (Action speed in a showdown), 340 (chain resolves before Focus can be passed out),
 *        465.2 (combat damage step comes after), 466.5 (the sole remaining player wins).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";

describe("Ruling 81bd8c620349500d — Hidden Blade kills during the showdown, so its victim misses the combat damage step", () => {
  test("the 4-Might Guard dies to the spell; P1's 4-Might Striker takes NO combat damage and conquers bf1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 4, name: "Striker" }, "striker")
      .hand(P1, HIDDEN_BLADE, "blade")
      .build();
    const p2Hand0 = game.p2.hand().length;

    await game.p1.move("striker", "bf1");
    expect(game.state("striker").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });

    await game.p1.cast("blade", { targets: "guard" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1 })]);
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // not yet — the spell has to resolve first
    await game.p1.passPriority();
    await game.p2.passPriority();

    // Resolved DURING the showdown, before any combat damage.
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand0 + 2); // "its controller draws 2"
    expect(game.state("striker").damage).toBe(0);

    await game.settle();
    expect(game.state("striker").damage).toBe(0); // the dead Guard dealt nothing in the damage step
    expect(game.zoneOf("striker")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — without the spell the very same combat trades: both 4-Might units die in the damage step", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 4, name: "Striker" }, "striker")
      .build();
    await game.p1.move("striker", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("striker")).toBe("trash");
  });
});
