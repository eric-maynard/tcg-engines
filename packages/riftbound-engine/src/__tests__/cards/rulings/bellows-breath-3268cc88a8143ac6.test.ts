/**
 * Ruling 3268cc88a8143ac6 — Bellows Breath (SFD-080 → sfd-080-221) · Mind · [1][mind] · [Action]
 *   "[Repeat] [1][mind]  Deal 1 to up to three units at the same location."
 *
 * Q: Can Bellows Breath target the same unit three times?
 * A: No — one instance of the spell chooses up to three DIFFERENT units. Paying [Repeat] is a second execution
 *    of the effect, and that one may name the same unit again: 1 + 1 = 2 damage on it. Lethal damage is only
 *    checked once the whole spell has finished resolving, so nothing dies between the two instances.
 * Rules: 355.9 (distinct objects for one target requirement), 820.1.d (Repeat executes the instructions again),
 *        142.4 / cleanup (lethal damage is checked after the resolution completes).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn. P2 holds bf1 with three units; `resources` decides whether [Repeat] is affordable. */
function board(energy: number, mind: number, aMight = 3) {
  return scenario()
    .resources(P1, { energy, power: { mind } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: aMight, name: "Alpha" }, "a")
    .unit(P2, "bf1", { might: 3, name: "Bravo" }, "b")
    .unit(P2, "bf1", { might: 3, name: "Charlie" }, "c")
    .hand(P1, BELLOWS_BREATH, "bb");
}

describe("Ruling 3268cc88a8143ac6 — one Bellows Breath needs three DIFFERENT units; [Repeat] is what lets you hit one twice", () => {
  test("ruling: with only [1][mind] (no Repeat affordable) the same unit cannot be named twice or three times", async () => {
    const game = await board(1, 1).build();
    expect((await game.p1.try((p) => p.cast("bb", { targets: ["a", "a", "a"] }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("bb", { targets: ["a", "a"] }))).ok).toBe(false);
    expect(game.zoneOf("bb")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } }); // nothing paid
  });

  test("…three DIFFERENT units is the legal shape, and each takes exactly 1", async () => {
    const game = await board(1, 1).build();
    await game.p1.cast("bb", { targets: ["a", "b", "c"] });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("b").damage).toBe(1);
    expect(game.state("c").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("ruling: paying [Repeat] is a second execution, so the SAME unit may be chosen again — 1 + 1 = 2 on it", async () => {
    const game = await board(2, 2).build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a", "a"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // base cost + the Repeat cost
    await game.settle();
    expect(game.state("a").damage).toBe(2);
    expect(game.zoneOf("a")).toBe("battlefield-bf1"); // 2 < 3 Might
    expect(game.state("b").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("…and nothing dies between the two instances: a 2-Might Alpha takes both points and only then is defeated", async () => {
    const game = await board(2, 2, 2).build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a", "a"] });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash"); // both instances landed on the same unit
  });
});
