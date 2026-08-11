/**
 * Ruling 1a56ca60931c63e2 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7][mind] · 7 Might
 *   "[Accelerate] … When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Discipline (OGN-058 → ogn-058-298) · Spell · Reaction · [2] · "Give a unit +2 [Might] this turn. Draw 1."
 *
 * Q: Does the Watcher's -3 persist if the units are buffed later, or is it a one-time reduction?
 * A: One-time. On resolution each enemy unit's CURRENT Might drops by 3, floored at 1 — and only the amount
 *    actually applied is stored, so a unit that would have gone below 1 keeps a smaller reduction, never a
 *    negative "credit". A later Might increase is then added to that current value: a unit floored to 1 and
 *    given +2 reads 3, not 1.
 * Rules: 472.3.d.2.b (a "to a minimum of" reduction is computed once, on resolution, then fixed for its
 *        duration), 700 (Might arithmetic: modifiers sum), 317.2 ("this turn" ends in the Expiration Step).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1's turn with [9][mind] — enough for the Watcher ([7][mind]) and two Disciplines ([2] each).
 * P2 holds bf1 with four units: a 5-Might Brute, a 2-Might Runt, a 1-Might Scrap, and a printed-3 Blessed
 * carrying a +1 Buff counter (current Might 4). P1's own 4-Might Ally is in base — the Watcher spares it.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .unit(P2, "bf1", { might: 2, name: "Runt" }, "runt")
    .unit(P2, "bf1", { might: 1, name: "Scrap" }, "scrap")
    .unit(P2, "bf1", { might: 3, name: "Blessed" }, "blessed", { buffed: true })
    .unit(P1, "base", { might: 4, name: "Ally" }, "ally")
    .hand(P1, WATCHER, "ttw")
    .hand(P1, DISCIPLINE, "disc1")
    .hand(P1, DISCIPLINE, "disc2");
}

/** Play the Watcher and let its play trigger resolve. */
async function watcherResolved(): Promise<Game> {
  const game = await board().build();
  expect(game.state("blessed")).toMatchObject({ baseMight: 3, isBuffed: true, might: 4 });
  await game.p1.play("ttw");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ttw", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling 1a56ca60931c63e2 — the Watcher's -3 is a one-time, floored reduction; later Might gains add on top of it", () => {
  test("on resolution every enemy unit takes the reduction from its CURRENT Might, floored at 1; P1's own Ally is untouched", async () => {
    const game = await watcherResolved();
    expect(game.state("brute").might).toBe(2); // 5 − 3
    expect(game.state("runt").might).toBe(1); // 2 − 3 → floored
    expect(game.state("scrap").might).toBe(1); // 1 − 3 → floored
    expect(game.state("blessed").might).toBe(1); // (3 + buff 1) − 3
    expect(game.state("ally").might).toBe(4);
  });

  test("negative Might below 1 is not stored: only the amount actually applied is kept, so the Runt carries −1 and the Scrap 0 — not −3", async () => {
    const game = await watcherResolved();
    expect(game.state("brute").mightModifier).toBe(-3);
    expect(game.state("runt").mightModifier).toBe(-1); // 2 → 1 costs only 1
    expect(game.state("scrap").mightModifier).toBe(0); // already at the floor
    expect(game.state("blessed").mightModifier).toBe(-3); // 4 → 1 costs the full 3
  });

  test("ruling 1a56ca60931c63e2 — a later +2 is added to the CURRENT value: the floored 1-Might Runt becomes 3, not 1", async () => {
    const game = await watcherResolved();
    await game.p1.cast("disc1", { targets: "runt" });
    await game.settle();
    expect(game.zoneOf("disc1")).toBe("trash");
    expect(game.state("runt")).toMatchObject({ baseMight: 2, might: 3, mightModifier: 1 }); // −1 + 2
  });

  test("…and the reduction is not undone by the increase: the Brute buffed by +2 reads 4 (5 − 3 + 2), still 3 below its printed Might", async () => {
    const game = await watcherResolved();
    await game.p1.cast("disc2", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ baseMight: 5, might: 4, mightModifier: -1 });
  });

  test("it is one-time, not a continuous 'enemy units have -3' effect: the Scrap, already at the floor, gains the full +2 → 3", async () => {
    const game = await watcherResolved();
    await game.p1.cast("disc1", { targets: "scrap" });
    await game.settle();
    expect(game.state("scrap")).toMatchObject({ baseMight: 1, might: 3, mightModifier: 2 });
  });

  test("all of it lasts only 'this turn': next turn the units are back to printed Might (the Blessed keeps its permanent buff counter)", async () => {
    const game = await watcherResolved();
    await game.p1.cast("disc1", { targets: "runt" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("brute")).toMatchObject({ might: 5, mightModifier: 0 });
    expect(game.state("runt")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.state("scrap")).toMatchObject({ might: 1, mightModifier: 0 });
    expect(game.state("blessed")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.violations()).toEqual([]);
  });
});
