/**
 * Ruling c62b48ca2d1184df — Bellows Breath (SFD-080 → sfd-080-221) · Spell · [1][mind] · [Action]
 *   "[Repeat] [1][mind]. Deal 1 to up to three units at the same location."
 *
 * Q: Does Bellows Breath choose?
 * A: Yes — you choose the units. Up to three DISTINCT units, all at one location; the same unit cannot be named twice
 *    inside one instance, and "up to" means zero is a legal choice. Paying [Repeat] buys a second, independent set.
 * Rules: 355.10 (chosen objects are targets), 355.13 ("up to N" may be satisfied with fewer, even none),
 *        746.2.a (the repeated execution chooses afresh).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn. Three enemy bodies at bf1, one at bf2, one in P2's base. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 5, name: "Holder1" }, "h1")
    .unit(P1, "bf2", { might: 5, name: "Holder2" }, "h2")
    .unit(P2, "bf1", { might: 3, name: "A" }, "a")
    .unit(P2, "bf1", { might: 3, name: "B" }, "b")
    .unit(P2, "bf1", { might: 3, name: "C" }, "c")
    .unit(P2, "bf2", { might: 3, name: "D" }, "d")
    .hand(P1, BELLOWS_BREATH, "bb")
    .resources(P1, { energy: 3, power: { mind: 2 } });
}

describe("Ruling c62b48ca2d1184df — Bellows Breath really does choose its units", () => {
  test("the cast exposes a `targets` field — this is a choice, not a programmatic sweep", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "bb")?.fields.find((f) => f.arg === "targets");
    expect(targets).toMatchObject({ kind: "cards", min: 0, required: true });
    expect(targets?.options).toContainEqual(["a", "b", "c"]);
    expect(targets?.options).toContainEqual([]); // "up to" — none is allowed
  });

  test("three distinct units at ONE location is the maximum: all three take 1 and the other location is untouched", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 0, targets: ["a", "b", "c"] });
    await game.settle();
    expect([game.state("a").damage, game.state("b").damage, game.state("c").damage]).toEqual([1, 1, 1]);
    expect(game.state("d").damage).toBe(0);
    expect(game.state("h1").damage).toBe(0); // not chosen
  });

  test("the same unit cannot be chosen twice within one instance, and the set cannot straddle two locations", async () => {
    const game = await board().build();
    expect((await game.p1.try((p) => p.cast("bb", { repeat: 0, targets: ["a", "a"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("bb", { repeat: 0, targets: ["a", "d"] }))).ok).toBe(false);
    expect(game.zoneOf("bb")).toBe("hand");
  });

  test("choosing nobody is legal — the spell still resolves and costs its [1][mind]", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 0, targets: [] });
    expect(game.p1.resources()).toMatchObject({ energy: 2, power: { mind: 1 } });
    await game.settle();
    expect(game.zoneOf("bb")).toBe("trash");
    expect([game.state("a").damage, game.state("b").damage, game.state("c").damage, game.state("d").damage]).toEqual([0, 0, 0, 0]);
    expect(game.violations()).toEqual([]);
  });

  test("[Repeat] buys a fresh set, so the same unit CAN be chosen again across executions (2 damage total)", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a", "a"] });
    await game.settle();
    expect(game.state("a").damage).toBe(2);
  });
});
