/**
 * Ruling 4a8220ffee8a59d2 — Bellows Breath (SFD-080 → sfd-080-221) · [Action] · [1][mind]
 *   "[Repeat] [1][mind] — Deal 1 to up to three units at the same location."
 *
 * Q: Does a repeated Bellows Breath deal two instances of 2, or 4 damage at once?
 * A: Neither. Repeat runs the printed instruction — "deal 1 to up to three units at the same location" —
 *    one extra time. That is two separate instances of 1, not one lump of 4 and not 2 per instance. The
 *    second execution may name different units, and even units at a different location; a unit named by
 *    both ends up with 2 damage marked.
 * Rules: 746.1.d / 820 (Repeat executes the instructions one additional time, on the same chain item),
 *        437 (damage is marked as it is dealt), 323 (deaths are checked in the Cleanup after the whole
 *        resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn with exactly base + Repeat ([2] + 2 mind). P2 keeps a Tough (3) at bfA, and a Weak (2) + Other (3) at bfB. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 2 } })
    .battlefield("bfA", { controller: P2 })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfA", { might: 3, name: "Tough" }, "tough")
    .unit(P2, "bfB", { might: 2, name: "Weak" }, "weak")
    .unit(P2, "bfB", { might: 3, name: "Other" }, "other")
    .hand(P1, BELLOWS_BREATH, "bb");
}

/** The full flat target lists the engine will accept for a Repeat-paid Bellows Breath. */
function repeatVariants(game: Game): string[][] {
  return (game.p1.option("cast", "bb")?.variants ?? [])
    .filter((v) => (v.params as { repeatCount?: number }).repeatCount === 1)
    .map((v) => ((v.params as { targets?: string[] }).targets ?? []).map(String));
}

describe("Ruling 4a8220ffee8a59d2 — Repeat gives Bellows Breath two separate instances of 1 damage", () => {
  test("ruling 4a8220ffee8a59d2 (1) — each instance is 1, not 2: a unit named in ONE execution takes exactly 1 and a 2-Might unit survives it", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 1, targets: ["weak", "tough"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // base AND repeat paid up front
    expect(game.chain()).toHaveLength(1); // ONE chain item, not two
    await game.settle();
    expect(game.state("weak")).toMatchObject({ damage: 1, zone: "battlefield-bfB" });
    expect(game.state("tough")).toMatchObject({ damage: 1, zone: "battlefield-bfA" });
    expect(game.violations()).toEqual([]);
  });

  test("ruling 4a8220ffee8a59d2 (2) — a unit named by BOTH executions ends up with 2 damage marked, one instance at a time", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 1, targets: ["tough", "tough"] });
    await game.settle();
    expect(game.state("tough")).toMatchObject({ damage: 2, might: 3, zone: "battlefield-bfA" }); // 1 + 1, and 2 < 3 so it lives
  });

  test("ruling 4a8220ffee8a59d2 (3) — the second execution may name a different LOCATION: bfA for one, bfB for the other", async () => {
    const game = await board().build();
    expect(repeatVariants(game)).toContainEqual(["tough", "weak"]);
    await game.p1.cast("bb", { repeat: 1, targets: ["tough", "weak"] });
    await game.settle();
    expect(game.state("tough").damage).toBe(1);
    expect(game.state("weak").damage).toBe(1);
    expect(game.state("other").damage).toBe(0);
  });

  test("it is not 4 damage in one lump either: three units at one location take 1 each per execution, so two of them can be finished off and a 3-Might one cannot", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { repeat: 1, targets: ["weak", "other", "weak", "other"] });
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash"); // 1 + 1 ≥ 2
    expect(game.state("other")).toMatchObject({ damage: 2, zone: "battlefield-bfB" }); // 1 + 1 < 3
    expect(game.state("tough").damage).toBe(0);
  });

  test("without paying Repeat it is a single execution — the same unit takes 1", async () => {
    const game = await board().build();
    await game.p1.cast("bb", { targets: "tough" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    await game.settle();
    expect(game.state("tough").damage).toBe(1);
  });
});
