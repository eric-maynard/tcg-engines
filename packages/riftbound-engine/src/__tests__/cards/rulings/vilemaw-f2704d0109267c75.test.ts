/**
 * Ruling f2704d0109267c75 — Vilemaw (UNL-060 → unl-060-219) · 8 [Might] unit
 *   "Enemy units here with LESS Might than me don't deal combat damage."
 *
 * Q: My opponent attacks my Vilemaw with an 8-Might unit — does it deal damage?
 * A: Yes. 8 is not "less than" 8, so the attacker deals its combat damage normally. A 7-Might attacker
 *    (less than Vilemaw's 8) deals none. The comparison uses current Might at combat damage.
 * Rules: 465 (combat damage), 715 (current Might), static ability on Vilemaw.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VILEMAW = "unl-060-219";

/** P2's turn. Vilemaw holds P1's bf1; P2 has one attacker in base of the given Might. */
function board(attackerMight: number) {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", VILEMAW, "vile")
    .unit(P2, "base", { might: attackerMight, name: "Attacker" }, "atk");
}

describe("Ruling f2704d0109267c75 — Vilemaw only blanks enemy units with STRICTLY less Might", () => {
  test("premise: Vilemaw is an 8-Might unit carrying the damage-prevention static", async () => {
    const game = await board(8).build();
    expect(game.state("vile").might).toBe(8);
    expect(game.state("vile").keywords).toContain("PreventWeakerEnemyCombatDamage");
  });

  test("an 8-Might attacker (equal, not less) DOES deal its combat damage — Vilemaw takes 8 and dies", async () => {
    const game = await board(8).build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("vile")).toBe("trash"); // took 8, its Might is 8
    expect(game.zoneOf("atk")).toBe("trash"); // Vilemaw's own 8 kills it back
    expect(game.violations()).toEqual([]);
  });

  test("a 7-Might attacker (less than 8) deals NO combat damage — Vilemaw is undamaged and kills it", async () => {
    const game = await board(7).build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.state("vile").damage).toBe(0);
    expect(game.zoneOf("vile")).toBe("battlefield-bf1");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // defence held
    expect(game.violations()).toEqual([]);
  });

  test("a 9-Might attacker (more) deals its damage too", async () => {
    const game = await board(9).build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("vile")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("battlefield-bf1"); // 9 > Vilemaw's 8 back-damage
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
