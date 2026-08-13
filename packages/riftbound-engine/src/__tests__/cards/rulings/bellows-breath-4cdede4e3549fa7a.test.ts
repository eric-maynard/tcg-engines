/**
 * Ruling 4cdede4e3549fa7a — Bellows Breath (SFD-080 → sfd-080-221) · [Action] · [1][mind]
 *   "[Repeat] [1][mind] — Deal 1 to up to three units at the same location."
 *
 * Q: With [Repeat] paid, can the repeated execution pick a DIFFERENT battlefield?
 * A: Yes. The two sets of damage are chosen separately, so the first execution can hit up to three units at
 *    one battlefield and the second up to three at another. Within ONE execution the targets must still all
 *    share a location — and a base counts as a location for that purpose.
 * Rules: 820 ([Repeat] repeats the effect; each execution makes its own choices), 355.16 (choices for the
 *        additional execution are independent), 355.9 ("at the same location" constrains a single execution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn with base + one Repeat ([2] and two mind). A and B sit at bf1, C at bf2, D in P2's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "A" }, "a")
    .unit(P2, "bf1", { might: 5, name: "B" }, "b")
    .unit(P2, "bf2", { might: 5, name: "C" }, "c")
    .unit(P2, "base", { might: 5, name: "D" }, "d")
    .hand(P1, BELLOWS_BREATH, "bellows");
}

describe("Ruling 4cdede4e3549fa7a — a Repeat-paid Bellows Breath may aim each execution at a different battlefield", () => {
  test("ruling: one execution at bf1 and the other at bf2 — A and C each take 1, from a SINGLE chain item", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { repeat: 1, targets: ["a", "c"] });
    expect(game.chain()).toHaveLength(1); // Repeat is not a second copy
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("c").damage).toBe(1);
    expect(game.state("b").damage).toBe(0);
    expect(game.state("d").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("each execution keeps its own 'up to three': two units at bf1 plus one at bf2 all take 1", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { repeat: 1, targets: ["a", "b", "c"] });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(1);
    expect(game.state("c").damage).toBe(1);
  });

  test("nuance: a BASE is a valid location for the spell — D can be hit even without leaving P2's base", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { targets: ["d"] });
    await game.settle();
    expect(game.state("d").damage).toBe(1);
    expect(game.state("a").damage).toBe(0);
  });

  test("without paying the Repeat only ONE execution exists, so only one battlefield's worth of damage is dealt", async () => {
    const game = await board().build();
    await game.p1.cast("bellows", { targets: ["a", "b"] });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(1);
    expect(game.state("c").damage).toBe(0);
    expect(game.p1.power("mind")).toBe(1); // the Repeat pip was never spent
  });

  // The engine accepts a single (un-repeated) execution whose targets sit at two different battlefields and
  // deals damage to both; the ruling requires every target of ONE execution to share a location.
  test("ruling 4cdede4e3549fa7a — without Repeat, the engine lets one execution hit units at two different battlefields", async () => {
    const game = await board().build();
    const mixed = await game.p1.try((p) => p.cast("bellows", { targets: ["a", "c"] }));
    expect(mixed.ok).toBe(false);
    expect(game.state("a").damage).toBe(0);
    expect(game.state("c").damage).toBe(0);
  });
});
