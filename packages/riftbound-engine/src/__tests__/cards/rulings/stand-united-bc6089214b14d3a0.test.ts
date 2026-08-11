/**
 * Ruling bc6089214b14d3a0 — Stand United (OGN-053 → ogn-053-298) · Action · Calm · 3
 *   "Buff a friendly unit. Buffs give an additional +1 [Might] to friendly units this turn."
 *   × Lee Sin, Ascetic (OGN-078 → ogn-078-298) · 5 Might · "[Shield] [Exhaust]: Buff me. I can have any number of buffs."
 *   × Smoke Screen (OGN-093 → ogn-093-298) · Reaction · 2 + [mind] · "Give a unit -4 [Might] this turn, to a minimum of 1."
 *   × Wallop (OGN-146 → ogn-146-298) · Action · 2 · "…you may spend a buff as an additional cost… Ready a unit."
 *
 * Q: How is Lee Sin's Might computed with several buffs once Stand United has resolved, and after a buff is then spent?
 * A: While Stand United's rider is active each buff is worth +2. Count all buffs at their current value, then apply the
 *    fixed Smoke Screen reduction: after Stand United 5 + (4 × 2) − 4 = 9; after Wallop spends one buff 5 + (3 × 2) − 4 = 7.
 *    Smoke Screen's −4 is snapshotted when it resolves and stays −4. Lee Sin can take buffs from any source.
 * Rules: 702 / 703 (buffs; +1 each), 702.3 exception (Lee Sin), 710 (Might arithmetic), 356 (Wallop's additional cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const STAND_UNITED = "ogn-053-298";
const LEE_SIN = "ogn-078-298";
const SMOKE_SCREEN = "ogn-093-298";
const WALLOP = "ogn-146-298";

/** P1's turn. Exhausted Lee Sin with THREE buffs (5 + 3 = 8) in base; Smoke Screen, Stand United, Wallop in hand; 7 energy + [mind]. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .unit(P1, "base", LEE_SIN, "lee", { buffed: true, exhausted: true, extraBuffs: 2 })
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, STAND_UNITED, "su")
    .hand(P1, WALLOP, "wallop");
}

/** Steps 1–3: Smoke Screen Lee Sin (8 → 4), then Stand United buffing Lee Sin (4th buff; every buff now +2). */
async function throughStandUnited(): Promise<Game> {
  const game = await board().build();
  expect(game.state("lee")).toMatchObject({ baseMight: 5, isBuffed: true, might: 8 });
  await game.p1.cast("smoke", { targets: "lee" });
  await game.settle();
  expect(game.zoneOf("smoke")).toBe("trash");
  expect(game.state("lee")).toMatchObject({ might: 4, mightModifier: -4 }); // 8 − 4 (floor of 1 not reached)
  await game.p1.cast("su", { targets: "lee" });
  await game.settle();
  expect(game.zoneOf("su")).toBe("trash");
  return game;
}

describe("Ruling bc6089214b14d3a0 — Stand United doubles each of Lee Sin's buffs; Smoke Screen stays a flat −4", () => {
  test("step 3: Stand United gives Lee Sin a 4th buff (he 'can have any number', from any source) and each buff is now worth +2: 5 + (4 × 2) − 4 = 9", async () => {
    const game = await throughStandUnited();
    expect(game.state("lee").isBuffed).toBe(true);
    expect(game.state("lee").meta.extraBuffs).toBe(3); // 1 + 3 = four buffs
    expect(game.state("lee")).toMatchObject({ might: 9, mightModifier: -4 }); // Smoke Screen did not re-snapshot
    expect(game.p1.resources()).toEqual({ energy: 2, power: { mind: 0 } });
  });

  // Spending ONE of four buffs leaves three, each still +2 under Stand United → 5 + 6 − 4 = 7, and Lee Sin is still a
  // buffed unit (the rider keeps applying to the remaining buffs).
  test("step 5: Wallop spending one of Lee Sin's buffs leaves 3 buffs → 5 + (3 × 2) − 4 = 7, still buffed", async () => {
    const game = await throughStandUnited();
    await game.p1.cast("wallop", { answers: ["lee"], payOptional: true, targets: "lee" });
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("lee");
    }
    expect(game.p1.energy()).toBe(2); // "ignore this spell's cost"
    await game.settle();
    expect(game.zoneOf("wallop")).toBe("trash");
    expect(game.state("lee").isReady).toBe(true); // "Ready a unit."
    expect(game.state("lee").isBuffed).toBe(true); // three buffs remain
    expect(game.state("lee")).toMatchObject({ might: 7, mightModifier: -4 });
  });

  test("all of it is 'this turn': next turn Lee Sin is back to base 5 + his remaining buffs at +1 each, no −4", async () => {
    const game = await throughStandUnited();
    await game.advanceTurn();
    expect(game.state("lee").mightModifier).toBe(0);
    expect(game.state("lee").staticMightBonus).toBe(0);
    expect(game.state("lee").might).toBe(9 + 4 - 4); // 5 + 4 buffs × 1
  });
});
