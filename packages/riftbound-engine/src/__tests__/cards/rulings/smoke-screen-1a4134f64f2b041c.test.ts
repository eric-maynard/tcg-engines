/**
 * Ruling 1a4134f64f2b041c — Smoke Screen (OGN-093 → ogn-093-298) · Reaction [2][mind]
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × En Garde (OGN-046 → ogn-046-298) · Reaction [1][calm] "Give a friendly unit +1 [Might] this turn, then an
 *     additional +1 [Might] this turn if it is the only unit you control there."
 *
 * Q: How do buffs and the Smoke Screen debuff combine — e.g. base 1 Might with a +1 buff, hit by Smoke Screen?
 * A: Increases apply, then Smoke Screen computes its reduction against the CURRENT Might when it resolves (floor 1)
 *    and snapshots that amount for the turn. 1 base + 1 buff = 2 → Smoke takes only −1 → 1. Later buffs that turn add
 *    on top of the snapshotted debuff (from 1, not from a negative). En Garde first on a 1-Might unit: 3 → Smoke
 *    snapshots −2 → 1 → a second En Garde → 3.
 * Rules: arithmetic layer for temporary Might; "to a minimum of 1" locks the amount actually taken; 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const EN_GARDE = "ogn-046-298";

/** P1's turn; P1's lone unit "target" in base; P1 holds Smoke Screen + two En Gardes with [4] + mind + 2 calm. */
function board(unit: { might: number; buffed?: boolean }) {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: unit.might, name: "Target" }, "target", unit.buffed ? { buffed: true } : undefined)
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, EN_GARDE, "eg1")
    .hand(P1, EN_GARDE, "eg2")
    .resources(P1, { energy: 4, power: { calm: 2, mind: 1 } });
}

describe("Ruling 1a4134f64f2b041c — Smoke Screen snapshots its floored reduction; buffs before/after add around it", () => {
  test("the question's case: base 1 + a +1 buff = 2 Might; Smoke Screen resolves → 1, and the snapshotted reduction is only −1 (not −4)", async () => {
    const game = await board({ buffed: true, might: 1 }).build();
    expect(game.state("target")).toMatchObject({ baseMight: 1, isBuffed: true, might: 2 });
    await game.p1.cast("smoke", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.state("target").might).toBe(1);
    expect(game.state("target").mightModifier).toBe(-1);
  });

  test("buffing the Smoke-Screened unit later that turn counts up from 1 (not from a negative): En Garde (+2, alone) → 1 + 1 + 2 − 1 = 3", async () => {
    const game = await board({ buffed: true, might: 1 }).build();
    await game.p1.cast("smoke", { targets: "target" });
    await game.settle();
    expect(game.state("target").might).toBe(1);
    await game.p1.cast("eg1", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("eg1")).toBe("trash");
    expect(game.state("target").might).toBe(3);
    expect(game.state("target").mightModifier).toBe(1); // −1 (snapshotted) + 2
  });

  test("En Garde BEFORE Smoke Screen on a plain 1-Might unit: 1 + 2 = 3, then Smoke snapshots −2 (3 → 1), then a second En Garde → 1 + 2 + 2 − 2 = 3", async () => {
    const game = await board({ might: 1 }).build();
    await game.p1.cast("eg1", { targets: "target" });
    await game.settle();
    expect(game.state("target").might).toBe(3);
    await game.p1.cast("smoke", { targets: "target" });
    await game.settle();
    expect(game.state("target").might).toBe(1);
    expect(game.state("target").mightModifier).toBe(0); // +2 − 2 (only −2 taken, not −4)
    await game.p1.cast("eg2", { targets: "target" });
    await game.settle();
    expect(game.state("target").might).toBe(3);
    expect(game.state("target").mightModifier).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("the snapshot lasts the turn and then expires with the other 'this turn' changes — next turn the unit is back to base 1 + buff = 2", async () => {
    const game = await board({ buffed: true, might: 1 }).build();
    await game.p1.cast("smoke", { targets: "target" });
    await game.settle();
    await game.p1.cast("eg1", { targets: "target" });
    await game.settle();
    expect(game.state("target").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("target").mightModifier).toBe(0);
    expect(game.state("target").might).toBe(2);
  });
});
