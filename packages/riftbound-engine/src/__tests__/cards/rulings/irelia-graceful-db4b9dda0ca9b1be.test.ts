/**
 * Ruling db4b9dda0ca9b1be — Irelia, Graceful (SFD-141 → sfd-141-221) · Champion Unit · Chaos · 4 Might
 *     "Your spells that choose me cost [1] or [rainbow] less."
 *   × Blood Rush (sfd-003-221) · Spell · Fury · 1 · [Action] "[Repeat] [1]. Give a unit [Assault 2] this turn."
 *
 * Q: Does Irelia, Graceful reduce a [Repeat] cost?
 * A: Yes — Repeat is an optional ADDITIONAL cost and discounts apply to the spell's total cost including it. But the
 *    discount applies only ONCE per spell: repeating the effect is not a new spell.
 * Rules: 356.1.b / 356.4 (additional costs are part of the cost; reductions apply to the total), 820 (Repeat repeats the
 *        effect of the same spell), 366.2 (cost modification).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const IRELIA_GRACEFUL = "sfd-141-221";
const BLOOD_RUSH = "sfd-003-221";

/** P1's turn: Irelia (4) and a vanilla Other (2) in base, Blood Rush in hand, `energy` in the pool. */
function board(energy: number) {
  return scenario()
    .resources(P1, { energy })
    .unit(P1, "base", IRELIA_GRACEFUL, "irelia")
    .unit(P1, "base", { might: 2, name: "Other" }, "other")
    .hand(P1, BLOOD_RUSH, "rush");
}

describe("Ruling db4b9dda0ca9b1be — Irelia's discount covers a Repeated spell's total cost, but only once", () => {
  test("baseline: Blood Rush choosing Irelia WITHOUT Repeat costs 1 − 1 = 0 (castable on an empty pool); choosing Other still costs 1", async () => {
    const free = await board(0).build();
    expect(free.p1.can("cast", "rush")).toBe(true);
    await free.p1.cast("rush", { targets: "irelia" });
    expect(free.p1.energy()).toBe(0);
    const other = await board(0).build();
    expect((await other.p1.try((p) => p.cast("rush", { targets: "other" }))).ok).toBe(false);
  });

  test("with Repeat and Irelia chosen: total [1] + Repeat [1] = 2, minus Irelia's [1] ONCE = 1 — castable with exactly 1 energy, pool empties, and the effect runs twice (two Assault 2 grants)", async () => {
    const game = await board(1).build();
    await game.p1.cast("rush", { repeat: 1, targets: "irelia" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.state("irelia").grantedKeywords).toEqual([
      { duration: "turn", keyword: "Assault", value: 2 },
      { duration: "turn", keyword: "Assault", value: 2 },
    ]);
    expect(game.violations()).toEqual([]);
  });

  test("NOT twice: with 0 energy the Repeated cast at Irelia is illegal (it would need the discount to apply per execution, 2 − 2 = 0)", async () => {
    const game = await board(0).build();
    const r = await game.p1.try((p) => p.cast("rush", { repeat: 1, targets: "irelia" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("rush")).toBe("hand");
    expect(game.p1.energy()).toBe(0);
  });

  test("and the discount needs Irelia to be CHOSEN: the Repeated cast at Other costs the full 2 (illegal on 1 energy, leaves 0 of 2)", async () => {
    const short = await board(1).build();
    expect((await short.p1.try((p) => p.cast("rush", { repeat: 1, targets: "other" }))).ok).toBe(false);
    const full = await board(2).build();
    await full.p1.cast("rush", { repeat: 1, targets: "other" });
    expect(full.p1.energy()).toBe(0);
  });
});
