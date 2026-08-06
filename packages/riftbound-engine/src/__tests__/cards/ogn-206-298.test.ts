/**
 * Back to Back — ogn-206-298 · Spell (Reaction) · Order · 3 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give two friendly units each +2 [Might] this turn.
 *
 * Rule 355.8: valid choices must be made for all targets — two distinct friendly units.
 */

import { describe, expect, test } from "bun:test";
import type { SeatHandle } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const BACK_TO_BACK = "ogn-206-298";
const CLEAVE = "ogn-004-298"; // 1-energy action spell (opens a chain on P2's turn)

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 1, name: "A" }, "a")
    .unit(P1, "bf1", { might: 2, name: "B" }, "b")
    .unit(P1, "base", { might: 3, name: "C" }, "c")
    .unit(P2, "bf1", { might: 3, name: "Foe" }, "foe")
    .hand(P1, BACK_TO_BACK, "btb");
}

/** Cast on a + b; tolerate the engine's current single-target shape so duration/cost can be checked. */
async function castOnAandB(p: SeatHandle) {
  const two = await p.try((s) => s.cast("btb", { targets: ["a", "b"] }));
  if (!two.ok) {
    await p.cast("btb", { targets: "a" });
  }
}

describe("Back to Back (ogn-206-298)", () => {
  test("costs 3 energy and goes to trash; not castable with 2 energy", async () => {
    const game = await board().build();
    await castOnAandB(game.p1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("btb")).toBe("chain");
    await game.settle();
    expect(game.zoneOf("btb")).toBe("trash");
    const poor = await board().resources(P1, { energy: 2 }).build();
    expect(poor.p1.energy()).toBe(2);
    expect(poor.p1.can("cast", "btb")).toBe(false);
  });

  test.failing("BUG: TWO friendly units are chosen and each gets +2 Might", async () => {
    // Expected: the spell takes two distinct friendly targets (a: 1→3, b: 2→4, c untouched).
    // Actual: the play enumerator only accepts a single target and only that unit gets +2.
    const game = await board().build();
    const field = game.p1.option("cast", "btb")?.fields.find((f) => f.arg === "targets");
    expect(field?.max).toBe(2);
    await game.p1.cast("btb", { targets: ["a", "b"] });
    await game.settle();
    expect(game.state("a").might).toBe(3);
    expect(game.state("b").might).toBe(4);
    expect(game.state("c").might).toBe(3);
  });

  test("the bonus is +2 Might and lasts only this turn", async () => {
    const game = await board().build();
    await castOnAandB(game.p1);
    await game.settle();
    expect(game.state("a").might).toBe(3);
    expect(game.state("a").baseMight).toBe(1);
    await game.advanceTurn();
    expect(game.state("a").might).toBe(1);
    expect(game.state("b").might).toBe(2);
  });

  test("only FRIENDLY units are legal targets (anywhere on the board); the enemy unit is not offered", async () => {
    const game = await board().build();
    const options = game.p1.option("cast", "btb")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    const offered = new Set((options as string[][]).flat());
    expect(offered).toEqual(new Set(["a", "b", "c"]));
    const t = await game.p1.try((p) => p.cast("btb", { targets: ["foe", "a"] }));
    expect(t.ok).toBe(false);
    const t2 = await game.p1.try((p) => p.cast("btb", { targets: "foe" }));
    expect(t2.ok).toBe(false);
  });

  test("Reaction: castable on the opponent's turn in response to their spell, resolving first", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1 }).hand(P2, CLEAVE, "cleave").build();
    await game.p2.cast("cleave", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "btb")).toBe(true);
    await castOnAandB(game.p1);
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave", "btb"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().map((i) => i.cardId)).toEqual(["cleave"]);
    expect(game.state("a").might).toBe(3);
  });

  test("Reaction: castable by the defender during a showdown on the opponent's turn", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1 }, "a")
      .unit(P1, "bf1", { might: 2 }, "b")
      .unit(P2, "base", { might: 4 }, "attacker")
      .hand(P1, BACK_TO_BACK, "btb")
      .build();
    await game.p2.move("attacker", "bf1");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "btb")).toBe(true);
  });
});
