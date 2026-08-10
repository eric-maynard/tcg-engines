/**
 * Ruling 9bc2fd0cac25ea2e — Stupefy (OGN-095 → ogn-095-298) · Reaction [1] · "Give a unit -1 [Might] this turn, to a
 *   minimum of 1 [Might]. Draw 1."   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction [2][mind] · "Give a unit -4 [Might]…"
 *
 * Q: An 8-Might unit has 4 damage on it. What is its Might in a showdown, and how much Might does an opponent need to
 *    kill it?
 * A: Damage does not reduce Might: it is still an 8-Might unit (and deals 8 in combat), but only 4 more damage kills it
 *    because damage accumulates against the Might threshold. Nuance: negative-Might effects (Stupefy / Smoke Screen) DO
 *    lower the current Might, unlike damage.
 * Rules: 140.2 (Might), 140.3 (lethal = damage ≥ Might), 439 (combat damage = Might), 145 (Might modifications).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const SMOKE_SCREEN = "ogn-093-298";

/** P1's turn. P2's 8-Might Colossus at P2's bf1 already carries 4 damage. P1 has attackers in base and both debuffs in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Colossus" }, "colossus", { damage: 4 })
    .unit(P1, "base", { might: 4, name: "Four" }, "four")
    .unit(P1, "base", { might: 3, name: "Three" }, "three")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, SMOKE_SCREEN, "smoke");
}

describe("Ruling 9bc2fd0cac25ea2e — damage is not a Might reduction; -Might effects are", () => {
  test("an 8-Might unit with 4 damage still has 8 Might (base and effective)", async () => {
    const game = await board().build();
    expect(game.state("colossus")).toMatchObject({ baseMight: 8, damage: 4, might: 8, mightModifier: 0 });
  });

  test("in a showdown it still hits for 8 (the 4-Might attacker dies) but only needs 4 more to die: a 4-Might attacker kills it", async () => {
    const game = await board().build();
    await game.p1.move("four", "bf1");
    expect(game.state("colossus").might).toBe(8); // Might in the showdown is unchanged by the damage
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("trash"); // 4 (marked) + 4 (combat) ≥ 8
    expect(game.zoneOf("four")).toBe("trash"); // took 8
    expect(game.violations()).toEqual([]);
  });

  test("a 3-Might attacker is NOT enough (4 + 3 = 7 < 8): the Colossus survives and kills the attacker", async () => {
    const game = await board().build();
    await game.p1.move("three", "bf1");
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    expect(game.zoneOf("three")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("nuance: Stupefy DOES reduce current Might (8 → 7) without touching the damage — now the 3-Might attacker is lethal (4 + 3 ≥ 7)", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "colossus" });
    await game.settle();
    expect(game.state("colossus")).toMatchObject({ baseMight: 8, damage: 4, might: 7, mightModifier: -1 });
    await game.p1.move("three", "bf1");
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("trash");
  });

  test("nuance: Smoke Screen on an undamaged 8-Might unit makes it a 4-Might unit this turn (Might value, not damage)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { mind: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 8, name: "Colossus" }, "colossus")
      .hand(P1, SMOKE_SCREEN, "smoke")
      .build();
    await game.p1.cast("smoke", { targets: "colossus" });
    await game.settle();
    expect(game.state("colossus")).toMatchObject({ damage: 0, might: 4, mightModifier: -4 });
    await game.advanceTurn();
    expect(game.state("colossus").might).toBe(8); // "this turn"
  });
});
