/**
 * Call to Glory — ogn-207-298 · Spell · Order · 3 energy (no power)
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   As you play this, you may spend a buff as an additional cost. If you do, ignore this spell's cost.
 *   Give a unit +3 [Might] this turn.
 *
 * Rule 702.2.b — spending a buff removes the buff counter from a unit you control.
 * Rule 356.1.b.1 — "ignore its cost" sets the base energy/power cost to 0.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-207-298";
const HEXTECH_RAY = "ogn-009-298"; // [Action] 1 energy + [fury]: Deal 3 to a unit at a battlefield.

function board(energy = 3) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "bf1", { might: 2 }, "ally")
    .unit(P1, "base", { might: 2 }, "donor", { buffed: true })
    .unit(P2, "bf1", { might: 4 }, "foe")
    .hand(P1, CARD, "ctg");
}

describe("Call to Glory (ogn-207-298)", () => {
  test("costs 3 energy; gives the chosen unit +3 Might this turn; spell goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("ctg", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    expect(game.state("ally").baseMight).toBe(2);
    expect(game.state("donor").isBuffed).toBe(true); // buff untouched on the normal path
    expect(game.zoneOf("ctg")).toBe("trash");
  });

  test("can target an enemy unit too ('a unit')", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "ctg")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["ally"], ["donor"], ["foe"]]));
    await game.p1.cast("ctg", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").might).toBe(7);
  });

  test("'this turn': the +3 is gone on the next turn", async () => {
    const game = await board().build();
    await game.p1.cast("ctg", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
  });

  test("without a buff to spend, 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 2 }, "ally").hand(P1, CARD, "ctg").build();
    expect(game.p1.can("cast", "ctg")).toBe(false);
  });

  test("optional additional cost — spending a friendly buff makes the spell free (0 energy paid, donor loses its buff)", async () => {
    // Expected: with 0 energy but a buffed friendly unit, Call to Glory is castable by spending that
    // buff; the donor's buff is removed and no energy is paid. Actual: the parsed ability has no
    // optional spend-buff cost, so with 0 energy the spell is simply not legal.
    const game = await board(0).build();
    expect(game.p1.can("cast", "ctg")).toBe(true);
    await game.p1.cast("ctg", { payOptional: true, targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("donor").isBuffed).toBe(false);
    await game.settle();
    expect(game.state("ally").might).toBe(5);
  });

  test("[Reaction]: castable on the opponent's turn in response to their spell, resolving first", async () => {
    const game = await board()
      .active(P2)
      .resources(P2, { energy: 1, power: { fury: 1 } })
      .hand(P2, HEXTECH_RAY, "ray")
      .build();
    await game.p2.cast("ray", { targets: "ally" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "ctg")).toBe(true);
    await game.p1.cast("ctg", { targets: "ally" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "ctg"]);
    await game.settle();
    // +3 resolved first, so the 2-might ally (now 5) survives the 3 damage.
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.state("ally")).toMatchObject({ damage: 3, might: 5 });
  });
});
