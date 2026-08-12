/**
 * Ruling e7b41bad1061348e — Smoke Screen (OGN-093 → ogn-093-298) · [Reaction] spell · [2][mind]
 *   "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Feral Strength (SFD-034 → sfd-034-221) · [Reaction] · [2] · "Give a unit +2 [Might] this turn."
 *
 * Q: A 2-Might unit is floored to 1 by Smoke Screen; the opponent then gives it +2. What is its Might?
 * A: 3. Same-layer effects apply in TIMESTAMP order: the floor is applied when Smoke Screen resolves (2 → 1) and
 *    the later +2 is added on top of that result (1 → 3) — it is not re-summed as 2 − 4 + 2 = 0 → 1.
 * Rules: 195 (Might calculation), 340.2 (timestamp order for same-layer effects), 359.3.e (minimum applied at resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const FERAL_STRENGTH = "sfd-034-221";

/** P2's turn: P2 attacks P1's battlefield with a 2-Might unit; P1 defends. Both sides hold a Reaction. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", { might: 2, name: "Warden" }, "warden")
    .unit(P2, "base", { might: 2, name: "Runner" }, "runner")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P2, FERAL_STRENGTH, "feral")
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .resources(P2, { energy: 2 });
}

/** P2 attacks; P1 Smoke Screens the attacker and it RESOLVES (2 → 1). */
async function smoked(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("runner", "bf1");
  await game.p2.passFocus();
  await game.p1.cast("smoke", { targets: "runner" });
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.zoneOf("smoke")).toBe("trash");
  return game;
}

describe("Ruling e7b41bad1061348e — Smoke Screen's floor then +2 leaves the unit at 3 Might, not 1", () => {
  test("Smoke Screen alone floors the 2-Might attacker at 1 (−4 would be −2)", async () => {
    const game = await smoked();
    expect(game.state("runner")).toMatchObject({ baseMight: 2, might: 1 });
  });

  test("the opponent's later +2 is applied to that result: 1 + 2 = 3", async () => {
    const game = await smoked();
    await game.p2.cast("feral", { targets: "runner" });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.zoneOf("feral")).toBe("trash");
    expect(game.state("runner").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("both are 'this turn' effects — the unit is back to its printed 2 Might next turn", async () => {
    const game = await smoked();
    await game.p2.cast("feral", { targets: "runner" });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.state("runner").might).toBe(3);
    await game.settle(); // the 3-Might attacker kills the 2-Might Warden and survives
    expect(game.zoneOf("runner")).toBe("battlefield-bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("runner").might).toBe(2);
  });
});
