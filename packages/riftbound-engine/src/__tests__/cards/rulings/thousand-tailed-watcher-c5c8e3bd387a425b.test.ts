/**
 * Ruling c5c8e3bd387a425b — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · 7 Might
 *   "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Wuju Bladesman - Starter (ogs-019-024) — "While a friendly unit defends alone, it gets +2 [Might]."
 *   × En Garde (ogn-046-298) — "[Reaction] Give a friendly unit +1 [Might] this turn, then +1 more if alone."
 *
 * Q: A 2-Might Poro is reduced by 3 (floored at 1). When later bonuses arrive (+1 for defending, +2 from
 *    Wuju Style), does it go back up, or does the whole -3 keep applying?
 * A: Might changes are a SNAPSHOT: the Poro drops to 1 (only -1 was actually applied, because of the
 *    minimum) and later bonuses build on that 1 rather than being swallowed by the original -3.
 * Rules: 105.2/740.1 (a "-N to a minimum of M" is applied once, as a snapshot, at resolution), 709 (Might
 *        is recomputed from the modifiers that are actually on the card).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const EN_GARDE = "ogn-046-298";
const CLEAVE = "ogn-004-298";
const WUJU_BLADESMAN = "ogs-019-024";

/** P1's turn. P2 has a 2-Might Poro and a 5-Might unit at bf1; P1 plays the Watcher from hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { fury: 1, mind: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Poro" }, "poro")
    .unit(P2, "bf1", { might: 5, name: "Big One" }, "big")
    .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
    .hand(P1, WATCHER, "watcher")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, EN_GARDE, "garde");
}

describe("Ruling c5c8e3bd387a425b — the Watcher's -3 is a snapshot, so later bonuses stack on the floored value", () => {
  test("the floor is applied as a snapshot: the 2-Might Poro records only -1 (down to 1), the 5-Might unit records the full -3", async () => {
    const game = await board().build();
    await game.p1.play("watcher");
    await game.settle();
    expect(game.state("poro").might).toBe(1);
    expect(game.state("poro").mightModifier).toBe(-1); // not -3
    expect(game.state("big").might).toBe(2);
    expect(game.state("big").mightModifier).toBe(-3);
  });

  test("ruling: a later +1 lifts the Poro to 2 — it is NOT dragged back down by the original -3", async () => {
    const game = await board().build();
    await game.p1.play("watcher");
    await game.settle();
    expect(game.state("poro").might).toBe(1);

    await game.p1.cast("cleave", { targets: "ally" }); // open a chain so P2 may react
    await game.p1.passPriority();
    await game.p2.cast("garde", { targets: "poro" }); // +1 (not alone: the Big One is here too)
    await game.settle();

    expect(game.state("poro").might).toBe(2); // 1 + 1, not max(1, 2 - 3 + 1)
    expect(game.violations()).toEqual([]);
  });

  test("ruling, the question's shape: a lone defender's +2 from Wuju Style takes the floored Poro to 3", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { mind: 1 } })
      .legend(P2, WUJU_BLADESMAN, "yi")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Poro" }, "poro")
      .unit(P1, "base", { might: 3, name: "Ally" }, "ally")
      .hand(P1, WATCHER, "watcher")
      .build();
    await game.p1.play("watcher");
    await game.settle();
    expect(game.state("poro").might).toBe(1);

    await game.p1.move("ally", "bf1"); // the Poro now defends alone
    expect(game.state("poro").combatRole).toBe("defender");
    expect(game.state("poro").might).toBe(3); // 1 + 2, on top of the snapshot
  });

  test("the debuff lasts only this turn", async () => {
    const game = await board().build();
    await game.p1.play("watcher");
    await game.settle();
    expect(game.state("big").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("big").might).toBe(5);
    expect(game.state("poro").might).toBe(2);
  });
});
