/**
 * Ruling c3ffed94d09b00b0 — Moonlight Affliction (UNL-066 → unl-066-219) · Reaction · Mind · 7
 *   "Give a unit -10 [Might] this turn."
 *   × Voracious Gromp (UNL-100 → unl-100-219) · Unit · Body · 5 · 5 Might · "[Hunt 3]"
 *
 * Q: If I Moonlight Affliction my opponent's Voracious Gromp, does it die?
 * A: Only if it already has damage. Reducing Might — even to 0 (5 − 10, treated as 0) — never kills by itself; a unit dies
 *    only when NON-ZERO damage marked on it is ≥ its Might. Undamaged Gromp stays on the board at 0 for the turn; a Gromp
 *    with 1+ damage dies as soon as its Might drops to or below that damage.
 * Rules: 140.3 / 142.3 (lethal = non-zero damage ≥ Might), 520 (cleanup kill), 476–478 (negative Might reads as 0).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MOONLIGHT_AFFLICTION = "unl-066-219";
const VORACIOUS_GROMP = "unl-100-219";

/** P1's turn with [7]; P2's Gromp at P2's bf1 (optionally pre-damaged). */
function board(gromDamage: number) {
  return scenario()
    .resources(P1, { energy: 7 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", VORACIOUS_GROMP, "gromp", gromDamage > 0 ? { damage: gromDamage } : undefined)
    .hand(P1, MOONLIGHT_AFFLICTION, "moon");
}

describe("Ruling c3ffed94d09b00b0 — Moonlight Affliction on Voracious Gromp: dies only if it already carries damage", () => {
  test("undamaged Gromp: −10 takes its 5 Might to 0 (never below) for the turn, but with NO damage marked it stays on the board", async () => {
    const game = await board(0).build();
    expect(game.state("gromp")).toMatchObject({ damage: 0, might: 5 });
    await game.p1.cast("moon", { targets: "gromp" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("moon")).toBe("trash");
    expect(game.zoneOf("gromp")).toBe("battlefield-bf1");
    expect(game.state("gromp")).toMatchObject({ damage: 0, might: 0, mightModifier: -10 });
    expect(game.p2.trash()).not.toContain("gromp");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
    // "this turn": next turn it is a 5 again
    await game.advanceTurn();
    expect(game.state("gromp")).toMatchObject({ might: 5, mightModifier: 0 });
  });

  test("Gromp with 1 damage already marked: the moment its Might drops to ≤ 1 (here 0) that damage is lethal and it dies in the cleanup", async () => {
    const game = await board(1).build();
    expect(game.state("gromp")).toMatchObject({ damage: 1, might: 5, zone: "battlefield-bf1" }); // 1 < 5: fine before
    await game.p1.cast("moon", { targets: "gromp" });
    await game.settle();
    expect(game.zoneOf("moon")).toBe("trash");
    expect(game.zoneOf("gromp")).toBe("trash");
    expect(game.p2.trash()).toContain("gromp");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
