/**
 * Ruling 41ac44ba52cba535 — (no specific card) losing a buff with damage already marked.
 *   Exercised with an inline base-speed spell "Deal 3 to a unit", an inline [Action] "Spend a buff
 *   from a friendly unit", and Stupefy (OGN-095 → ogn-095-298) "[Reaction] Give a unit -1 [Might]
 *   this turn, to a minimum of 1. Draw 1."
 *
 * Q: If a unit is dealt damage and then a buff is removed from it, does it die?
 * A: Yes. A buff is +1 [Might] (703); removing it lowers current Might, and a unit whose non-zero
 *    marked damage is ≥ its Might is killed at the next Cleanup (143.2.a / 323.5). The same holds for
 *    any other Might reduction — a spell, an ability, or the buff going away.
 * Rules: 703 (buff = +1 Might), 143.2.a (lethal check), 323.5 (deaths happen in Cleanup).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";

/** Base-speed "Deal 3 to a unit." */
const SHOCK = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Shock",
  rulesText: "Deal 3 to a unit.",
  timing: "standard",
} as const;

/** "[Action] Spend a buff from a friendly unit." — the buff simply goes away, nothing replaces it. */
const SIPHON = {
  abilities: [
    {
      effect: { target: { controller: "friendly", filter: "buffed", type: "unit" }, type: "spend-buff" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Siphon",
  rulesText: "[Action] Spend a buff from a friendly unit.",
  timing: "action",
} as const;

/** P1's 3-Might Bruiser carries a buff (effective 4) and P1 holds the damage spell + the buff-remover. */
function board() {
  return scenario()
    .unit(P1, "base", { might: 3, name: "Bruiser" }, "bruiser", { buffed: true })
    .hand(P1, SHOCK, "shock")
    .hand(P1, SIPHON, "siphon");
}

describe("Ruling 41ac44ba52cba535 — removing a buff from a damaged unit kills it", () => {
  test("setup: the buff is worth +1 [Might], so the buffed 3-Might unit survives 3 damage", async () => {
    const game = await board().build();
    expect(game.state("bruiser").isBuffed).toBe(true);
    expect(game.state("bruiser").baseMight).toBe(3);
    expect(game.state("bruiser").might).toBe(4);
    await game.p1.cast("shock", { targets: "bruiser" });
    await game.settle();
    expect(game.state("bruiser").damage).toBe(3);
    expect(game.zoneOf("bruiser")).toBe("base"); // 3 < 4
  });

  test("spending that buff afterwards drops Might to 3 — equal to the marked damage — and the unit dies", async () => {
    const game = await board().build();
    await game.p1.cast("shock", { targets: "bruiser" });
    await game.settle();
    await game.p1.cast("siphon", { targets: "bruiser" });
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("control: with no damage marked, losing the buff only drops Might back to 3 — nothing dies", async () => {
    const game = await board().build();
    await game.p1.cast("siphon", { targets: "bruiser" });
    await game.settle();
    expect(game.state("bruiser").isBuffed).toBe(false);
    expect(game.state("bruiser").might).toBe(3);
    expect(game.zoneOf("bruiser")).toBe("base");
  });

  test("the same principle for any Might reduction: Stupefy's -1 on a damaged 3-Might unit is lethal", async () => {
    const game = await scenario()
      .resources(P2, { energy: 1, power: { mind: 1 } })
      .unit(P1, "base", { might: 3, name: "Scout" }, "scout")
      .hand(P1, SHOCK, "shock")
      .hand(P2, STUPEFY, "stupefy")
      .build();
    await game.p1.cast("shock", { targets: "scout" });
    await game.p1.passPriority();
    // P2 answers the damage spell; both resolve, leaving 3 damage on a unit whose Might is now 2.
    await game.p2.cast("stupefy", { targets: "scout" });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
