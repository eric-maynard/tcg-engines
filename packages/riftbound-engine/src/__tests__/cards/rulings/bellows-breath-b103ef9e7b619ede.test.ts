/**
 * Ruling b103ef9e7b619ede — Bellows Breath (SFD-080 → sfd-080-221) · Spell · [1][mind] · [Action]
 *   "[Repeat] [1][mind]. Deal 1 to up to three units at the same location."
 *
 * Q: When I pay the [Repeat] cost, may I choose different units the second time?
 * A: Yes. The extra execution makes its own set of choices — a different location and different units, or the same
 *    unit again for a second point of damage. Everything happens while the one spell resolves.
 * Rules: 746.2.a (choices for the additional execution need not match the first), 820.2 ([Repeat]),
 *        352.10 (each execution chooses its own objects).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn. Two enemy bodies at bf1, one at bf2. Pool = base cost [1][mind] plus the [Repeat] [1][mind]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Holder1" }, "h1")
    .unit(P1, "bf2", { might: 5, name: "Holder2" }, "h2")
    .unit(P2, "bf1", { might: 3, name: "A" }, "a")
    .unit(P2, "bf1", { might: 3, name: "B" }, "b")
    .unit(P2, "bf2", { might: 3, name: "C" }, "c")
    .hand(P1, BELLOWS_BREATH, "bb")
    .resources(P1, { energy: 3, power: { mind: 2 } });
}

describe("Ruling b103ef9e7b619ede — a repeated Bellows Breath makes brand-new choices", () => {
  test("the second execution may pick a DIFFERENT location and different units (bf1's A+B, then bf2's C)", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a", "b", "c"] });
    expect(game.p1.resources()).toMatchObject({ energy: 1, power: { mind: 0 } }); // [1][mind] twice
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(1);
    expect(game.state("c").damage).toBe(1); // reached only because the repeat re-chose the location
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("without paying the repeat, one execution cannot span two locations — A and C together is refused", async () => {
    const game = await board().build();
    const attempt = await game.p1.try((p) => p.cast("bb", { repeat: 0, targets: ["a", "c"] }));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("bb")).toBe("hand");
    expect(game.state("a").damage).toBe(0);
  });

  test("the repeat may instead re-choose the SAME unit, stacking to 2 damage on it", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a", "a"] });
    await game.settle();
    expect(game.state("a").damage).toBe(2);
    expect(game.state("b").damage).toBe(0);
  });

  test("one instance still cannot name the same unit twice — 'a, a' is illegal without the repeat", async () => {
    const game = await board().build();
    const attempt = await game.p1.try((p) => p.cast("bb", { repeat: 0, targets: ["a", "a"] }));
    expect(attempt.ok).toBe(false);
    await game.p1.cast("bb", { repeat: 0, targets: ["a", "b"] });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(1);
    expect(game.p1.resources()).toMatchObject({ energy: 2, power: { mind: 1 } }); // only the base cost paid
  });
});
