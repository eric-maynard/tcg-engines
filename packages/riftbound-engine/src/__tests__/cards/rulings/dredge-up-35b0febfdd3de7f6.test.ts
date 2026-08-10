/**
 * Ruling 35b0febfdd3de7f6 — Dredge Up (VEN-049 → ven-049-166) · Spell · Mind · 2 · "Draw 1. [Flow] [2]"
 *   × Applied Researchers (VEN-055 → ven-055-166) · Unit · 4 Might "[Empower] [3] …
 *     [Empowered][>] Your spells cost [1][rainbow] less, to a minimum of [1]."
 *
 * Q: With an Empowered Applied Researchers, does the discount apply to Flow costs — do I Flow Dredge Up for 1 or 2?
 * A: 1. Flow replaces the base cost with the Flow cost [2] during finalization; total-cost discounts then apply
 *    to that (2 - 1 = 1). The "minimum of [1]" holds — it cannot drop to 0. She must actually be Empowered.
 * Rules: 829.1.c.1 (Flow: alternative cost from trash, then banish), 356.4 (cost determination / reductions),
 *        356.4.e (minimums).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const DREDGE_UP = "ven-049-166";
const APPLIED_RESEARCHERS = "ven-055-166";

function board(energy: number, empowered: boolean) {
  return scenario()
    .resources(P1, { energy })
    .unit(P1, "base", APPLIED_RESEARCHERS, "ar", empowered ? { empowered: true } : {})
    .trash(P1, DREDGE_UP, "dredge");
}

describe("Ruling 35b0febfdd3de7f6 — Applied Researchers' discount applies to Dredge Up's Flow cost: 2 → 1", () => {
  test("Empowered + exactly 1 energy: Dredge Up in the trash is playable via Flow, costs 1, draws 1 and is banished", async () => {
    const game = await board(1, true).build();
    expect(game.state("ar").isEmpowered).toBe(true);
    expect(game.zoneOf("dredge")).toBe("trash");
    expect(game.p1.can("cast", "dredge")).toBe(true);
    const flow = game.p1.option("cast", "dredge")?.fields.find((f) => f.arg === "flow");
    expect(flow?.options).toEqual([true]); // only as a Flow play (it is in the trash)
    const hand = game.p1.hand().length;
    await game.p1.cast("dredge", { flow: true });
    expect(game.p1.energy()).toBe(0); // paid 1, not 2
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1); // Draw 1
    expect(game.zoneOf("dredge")).toBe("banishment"); // "Then banish it."
    expect(game.violations()).toEqual([]);
  });

  test("with 2 energy floating it still charges only 1 (1 left over) — a real discount, not a legality waiver", async () => {
    const game = await board(2, true).build();
    await game.p1.cast("dredge", { flow: true });
    expect(game.p1.energy()).toBe(1);
  });

  test("'to a minimum of [1]': with 0 energy the Flow play is not legal even while Empowered", async () => {
    const game = await board(0, true).build();
    expect(game.p1.can("cast", "dredge")).toBe(false);
  });

  test("she must actually be Empowered: un-empowered, the Flow costs the full 2 (1 energy is not enough; 2 → 0)", async () => {
    const short = await board(1, false).build();
    expect(short.state("ar").isEmpowered).toBe(false);
    expect(short.p1.can("cast", "dredge")).toBe(false);
    const full = await board(2, false).build();
    await full.p1.cast("dredge", { flow: true });
    expect(full.p1.energy()).toBe(0);
  });
});
