/**
 * Ruling 4f696d450f42c6cb — (no specific card) stacking damage with several base-speed spells in one turn.
 *   Exercised with an inline base-speed (no [Action]/[Reaction]) spell "Deal 3 to a unit".
 *
 * Q: Can I play two 3-damage base-speed spells in one turn to kill a 5-Might unit?
 * A: Yes. Each spell is its own chain, resolved before the next is played; damage stays MARKED on the
 *    unit, so 3 + 3 = 6 ≥ 5 Might kills it. Base-speed spells are playable only on your own turn and
 *    not inside showdowns, and two of them cannot share a chain. Marked damage is cleared at the end
 *    of turn (and by combat), not by walking onto an open battlefield.
 * Rules: 143.2.a (damage ≥ Might kills), 317.2.c (Expiration Step heals), 355.2 (base-speed timing).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** Base-speed (no timing tag) spell: "Deal 3 to a unit." */
const SHOCK = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Shock",
  rulesText: "Deal 3 to a unit.",
  timing: "standard",
} as const;

/** P1's turn. P2 holds bf1 with a 5-Might Ogre; P1 holds two Shocks. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Ogre" }, "ogre")
    .hand(P1, SHOCK, "s1")
    .hand(P1, SHOCK, "s2");
}

describe("Ruling 4f696d450f42c6cb — marked damage accumulates across consecutive chains in the same turn", () => {
  test("two 3-damage spells in separate chains kill a 5-Might unit", async () => {
    const game = await board().build();
    await game.p1.cast("s1", { targets: "ogre" });
    await game.settle();
    expect(game.state("ogre").damage).toBe(3); // marked, and the unit lives (3 < 5)
    expect(game.state("ogre").might).toBe(5); // damage does not lower Might
    expect(game.zoneOf("ogre")).toBe("battlefield-bf1");
    await game.p1.cast("s2", { targets: "ogre" });
    await game.settle();
    expect(game.zoneOf("ogre")).toBe("trash"); // 6 ≥ 5
    expect(game.violations()).toEqual([]);
  });

  test("the two spells must be consecutive CHAINS — the second is illegal while the first is unresolved", async () => {
    const game = await board().build();
    await game.p1.cast("s1", { targets: "ogre" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["s1"]);
    const second = await game.p1.try((p) => p.cast("s2", { targets: "ogre" }));
    expect(second.ok).toBe(false);
    expect(game.zoneOf("s2")).toBe("hand");
  });

  test("a base-speed spell is not playable in a showdown, nor on the opponent's turn", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1"); // combat showdown opens, P1 holds Focus
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("cast", "s1")).toBe(false);
    await game.settle(); // showdown resolves
    expect(game.p1.can("cast", "s1")).toBe(true); // back in the open main phase
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("cast", "s1")).toBe(false); // not on the opponent's turn
  });

  test("marked damage survives an ordinary move but is cleared at end of turn", async () => {
    const game = await board().battlefield("bf2").unit(P1, "base", { might: 5, name: "Ally" }, "ally").build();
    await game.p1.cast("s1", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").damage).toBe(3);
    await game.p1.move("ally", "bf2"); // walking onto an open battlefield heals nothing
    await game.settle();
    expect(game.state("ally").damage).toBe(3);
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
    await game.advanceTurn(); // Expiration Step 3c heals all units
    expect(game.state("ally").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
