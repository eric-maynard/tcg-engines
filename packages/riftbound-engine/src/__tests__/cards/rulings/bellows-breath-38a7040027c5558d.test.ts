/**
 * Ruling 38a7040027c5558d — Bellows Breath (SFD-080 → sfd-080-221) · Spell · Mind · [1][mind] · [Action]
 *   "[Repeat] [1][mind] — Deal 1 to up to three units at the same location."
 *
 * Q: Can you target the same unit twice with Bellows Breath if you pay the [Repeat] cost?
 * A: Yes. One instance may not name a unit twice, but [Repeat] is a SEPARATE set of choices, so the second
 *    execution may name the same unit again (1 + 1 = 2 on it). It may also pick a different location.
 *    Damage does not reduce Might and lethal damage is only checked once the whole spell has finished
 *    resolving — a 1-Might unit is still there to take the second point and is defeated only at cleanup.
 * Rules: 746.2.a (repeat choices need not match), 355.9 (one requirement = distinct objects), 820.1.d ([Repeat]),
 *        437 / cleanup (marked damage; lethal checked after the resolution completes).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BELLOWS_BREATH = "sfd-080-221";

/** P1's turn. P2 has Alpha + Bravo at bf1 and Charlie at bf2. P1: Bellows Breath and `energy`/`mind` to spend. */
function board(energy: number, mind: number, alphaMight = 3) {
  return scenario()
    .resources(P1, { energy, power: { mind } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: alphaMight, name: "Alpha" }, "a")
    .unit(P2, "bf1", { might: 3, name: "Bravo" }, "b")
    .unit(P2, "bf2", { might: 3, name: "Charlie" }, "c")
    .hand(P1, BELLOWS_BREATH, "bb");
}

describe("Ruling 38a7040027c5558d — [Repeat] is a fresh set of choices, so the same unit may be named again", () => {
  test("without [Repeat] a single instance may NOT name the same unit twice (355.9)", async () => {
    const game = await board(1, 1).build();
    expect((await game.p1.try((p) => p.cast("bb", { targets: ["a", "a"] }))).ok).toBe(false);
    expect(game.zoneOf("bb")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
  });

  test("ruling: paying [Repeat] [1][mind] lets the second execution name the SAME unit — it takes 1 then 1 = 2", async () => {
    const game = await board(2, 2).build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a", "a"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } }); // [1][mind] base + [1][mind] repeat
    await game.settle();
    expect(game.state("a").damage).toBe(2);
    expect(game.state("b").damage).toBe(0);
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling nuance (746.2.a): the second execution may instead pick a unit at a DIFFERENT location", async () => {
    const game = await board(2, 2).build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a", "c"] });
    await game.settle();
    expect(game.state("a").damage).toBe(1);
    expect(game.state("c").damage).toBe(1);
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.locationOf("c")).toBe("bf2");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: a 1-Might Alpha named twice survives the first point and is only defeated after the whole spell resolves", async () => {
    const game = await board(2, 2, 1).build();
    await game.p1.cast("bb", { repeat: 1, targets: ["a", "a"] });
    // Both executions are part of ONE resolution — nothing is checked for lethal damage in between.
    expect(game.zoneOf("a")).toBe("battlefield-bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bb"]);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("bb")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
