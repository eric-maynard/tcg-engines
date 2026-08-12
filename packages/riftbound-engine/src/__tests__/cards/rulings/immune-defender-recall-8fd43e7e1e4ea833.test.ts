/**
 * Ruling 8fd43e7e1e4ea833 — (no specific card) attacking a defender that cannot take damage.
 *   Stand-in: inline "Test Statue" · 3 Might · "I don't take damage." (the continuous restriction shape
 *   Kayn, Unleashed uses — rule 465.2.c.10) holding the battlefield it controls.
 *
 * Q: If the unit holding a battlefield cannot take damage, do the attackers go home or take the
 *    battlefield?
 * A: They go home. Damage is still assigned and dealt to the immune defender, it simply has no effect, so
 *    the defender is still standing when the Combat Cleanup runs — and the Cleanup recalls attackers
 *    whenever defenders are still present. The defender keeps the battlefield; nothing is conquered and no
 *    point is scored.
 * Rules: 466.1.a.1-2 (the Combat Cleanup: heal all units, then recall attackers if defenders remain),
 *        465.2.c.10 ("I don't take damage" is a continuous restriction checked as damage is dealt),
 *        466.3 / 466.5 (the combat result and Establish Control), 454 (recalls).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** 3-Might defender that damage cannot mark. */
const STATUE = {
  abilities: [{ effect: { restriction: "no-damage", type: "restriction" }, type: "static" }],
  cardType: "unit",
  domain: "calm",
  energyCost: 4,
  might: 3,
  name: "Test Statue",
  rulesText: "I don't take damage.",
} as const;

/** P1's turn: a 5-Might Raider (and a 2-Might Skirmisher) attack the Statue that holds bf1 for P2. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", STATUE, "statue")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
    .unit(P1, "base", { might: 2, name: "Skirmisher" }, "skirm");
}

describe("Ruling 8fd43e7e1e4ea833 — an immune defender survives, so the attackers are recalled and it keeps the battlefield", () => {
  test("the attack opens a real combat with real designations — the immunity is not a shield against being attacked", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("statue").combatRole).toBe("defender");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true });
  });

  test("5 damage lands on a 3-Might Statue and marks nothing; the Statue is still there at the Cleanup", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("statue")).toBe("battlefield-bf1");
    expect(game.state("statue").damage).toBe(0);
  });

  test("…so the attacker is recalled to base (466.1.a.2), P2 keeps bf1, nothing is conquered and nobody scores", async () => {
    const game = await board().build();
    const p1Points = game.p1.points();
    const p2Points = game.p2.points();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base"); // sent home, not dead
    expect(game.state("raider").damage).toBe(0); // the Statue's 3 was healed in the same Cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBeFalsy();
    expect(game.p1.points()).toBe(p1Points);
    expect(game.p2.points()).toBe(p2Points);
  });

  test("the same happens to a whole attacking party — every attacker walks home while one immune defender stands", async () => {
    const game = await board().build();
    await game.p1.move(["raider", "skirm"], "bf1");
    await game.settle();
    expect(game.zoneOf("statue")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.zoneOf("skirm")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control: strip the immunity and the very same attack kills the 3-Might defender and conquers bf1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Mortal" }, "mortal")
      .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("mortal")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
