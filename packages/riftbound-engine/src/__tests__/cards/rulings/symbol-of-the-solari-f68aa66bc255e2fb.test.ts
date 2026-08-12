/**
 * Ruling f68aa66bc255e2fb — Symbol of the Solari (OGN-227 → ogn-227-298) · Gear · Order · [1]
 *     "If a combat where you are the attacker ends in a tie, recall ALL units instead.
 *      (Send them to base. This isn't a move. Ties are calculated after combat damage is dealt.)"
 *
 * Q: When a unit attacks and both units survive the combat (say the defender is stunned), which unit retreats?
 * A: By default the ATTACKER always retreats — the defender stays and keeps the battlefield. Cards like Symbol
 *    of the Solari override that: on a tie in a combat you attacked in, ALL units are recalled instead.
 * Rules: 466.1.a.2 (Combat Cleanup step 3d: recall the attackers), 466.3 (combat result read after that),
 *        466.5 (Establish Control; nobody left ⇒ Uncontrolled), 372 (a replacement changes what happens).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SYMBOL_OF_THE_SOLARI = "ogn-227-298";

/**
 * P1's turn. P2 holds bf1 with a STUNNED 5-Might Guard (it deals no combat damage), so P1's 3-Might Raider
 * survives its attack and the Guard survives the Raider's 3. `symbol` gives P1 the gear.
 */
function board(symbol: boolean) {
  const s = scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Guard" }, "guard", { stunned: true })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider");
  if (symbol) {
    s.gear(P1, SYMBOL_OF_THE_SOLARI, "symbol");
  }
  return s;
}

describe("Ruling f68aa66bc255e2fb — the attacker is the one that retreats; Symbol of the Solari recalls everyone", () => {
  test("both units live through the combat: the stunned Guard deals nothing and the Raider's 3 is not lethal", async () => {
    const game = await board(false).build();
    await game.p1.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
    await game.settle();
    expect(game.zoneOf("raider")).not.toBe("trash");
    expect(game.zoneOf("guard")).not.toBe("trash");
  });

  test("ruling (default): the ATTACKER retreats — the Raider is back in base, the Guard holds bf1 for P2", async () => {
    const game = await board(false).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.locationOf("raider")).toBe("base");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("ruling (override): with Symbol of the Solari out, the same tie recalls ALL units — the Guard goes home too", async () => {
    const game = await board(true).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.locationOf("raider")).toBe("base");
    expect(game.locationOf("guard")).toBe("base"); // the defender is recalled as well
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("and with nobody left standing there, the battlefield ends up uncontrolled — P2 loses it without P1 taking it", async () => {
    const game = await board(true).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy();
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });
});
