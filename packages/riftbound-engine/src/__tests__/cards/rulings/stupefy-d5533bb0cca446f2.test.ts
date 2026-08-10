/**
 * Ruling d5533bb0cca446f2 — Stupefy (OGN-095 → ogn-095-298) · Reaction · Mind · [1]
 *     "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   × Void Gate (OGN-296 → ogn-296-298) · Battlefield · "Spells and abilities deal 1 Bonus Damage to units here."
 *   (Imperial Decree OGN-221 is cited in the answer only as precedent: "Stupefy does not deal damage".)
 *
 * Q: Stupefy on an enemy unit at Void Gate — is it -2 or -1 Might?
 * A: -1. Void Gate only increases DAMAGE dealt; Stupefy is a Might reduction, not damage, so no bonus applies.
 *    The unit simply loses 1 Might (min 1) and takes no damage.
 * Rules: 432 (damage is marked), Bonus Damage modifies instances of damage dealt; a Might modifier is not damage.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const VOID_GATE = "ogn-296-298";
/** Inline "Deal 1 to a unit." — positive control that Void Gate's text is live in this scenario. */
const PING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 1,
  name: "Test Ping",
  timing: "action",
};

/** P1's turn. Void Gate (live) held by P2 with a 3-Might Brute and a 2-Might Scout on it. P1 holds Stupefy + Ping, [2]. */
function board() {
  return scenario()
    .battlefield("gate", { controller: P2, def: VOID_GATE, inert: false })
    .unit(P2, "gate", { might: 3, name: "Brute" }, "brute")
    .unit(P2, "gate", { might: 2, name: "Scout" }, "scout")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P1, PING, "ping")
    .resources(P1, { energy: 2 });
}

describe("Ruling d5533bb0cca446f2 — Stupefy at Void Gate is -1 Might, not -2 (it deals no damage)", () => {
  test("Stupefy on the 3-Might Brute at Void Gate: 3 → 2 Might, 0 damage marked, P1 draws 1", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("stupefy", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("brute")).toMatchObject({ baseMight: 3, damage: 0, might: 2 });
    expect(game.zoneOf("brute")).toBe("battlefield-gate");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.violations()).toEqual([]);
  });

  test("Stupefy on the 2-Might Scout at Void Gate: floors at 1 Might with no damage — a phantom '-2'/'+1 damage' would have killed or zeroed it", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "scout" });
    await game.settle();
    expect(game.state("scout")).toMatchObject({ damage: 0, might: 1 });
    expect(game.zoneOf("scout")).toBe("battlefield-gate");
  });

  test("positive control: Void Gate IS live — Ping (deal 1) on the 2-Might Scout there becomes 2 and kills it", async () => {
    const game = await board().build();
    await game.p1.cast("ping", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
  });

  test("the effect is a this-turn Might modifier: after the turn passes the Brute is back to 3", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "brute" });
    await game.settle();
    expect(game.state("brute").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("brute").might).toBe(3);
  });
});
