/**
 * Ruling 622855b2e39dca43 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7][mind] · 7 Might
 *     "[Accelerate] … When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield "Units here have +1 [Might]. (This includes attackers.)"
 *
 * Q: Enemy 1-Might and 4-Might units stand at the War Camp (+1). Watcher gives them -3 (min 1). Final Might?
 * A: Apply the battlefield's static +1 first, then the -3 with its floor: 1+1=2 → 2-3 → 1 (minimum); 4+1=5 → 5-3 = 2.
 * Rules: 705/706 (continuous static bonus already part of current Might), 358 (one-shot -N "to a minimum of 1" is
 *        computed from the unit's current Might as it resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const WAR_CAMP = "ogn-294-298";

/** P1's turn with exactly [7][mind]. P2 holds the live War Camp with a printed-1 Runt and a printed-4 Bruiser; a printed-4 Homebody sits in P2's base. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { mind: 1 } })
    .battlefield("camp", { controller: P2, def: WAR_CAMP, inert: false, owner: P2 })
    .unit(P2, "camp", { might: 1, name: "Runt" }, "runt")
    .unit(P2, "camp", { might: 4, name: "Bruiser" }, "bruiser")
    .unit(P2, "base", { might: 4, name: "Homebody" }, "home")
    .hand(P1, WATCHER, "watcher");
}

async function watcherResolved(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("watcher");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("watcher")).toBe("base");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  return game;
}

describe("Ruling 622855b2e39dca43 — Watcher's -3 (min 1) at the War Camp: 1 → 1 and 4 → 2", () => {
  test("before Watcher: the War Camp's static +1 is already in their Might — Runt 1+1 = 2, Bruiser 4+1 = 5 (Homebody in base: 4)", async () => {
    const game = await board().build();
    expect(game.state("runt")).toMatchObject({ baseMight: 1, might: 2 });
    expect(game.state("bruiser")).toMatchObject({ baseMight: 4, might: 5 });
    expect(game.state("home")).toMatchObject({ baseMight: 4, might: 4 });
  });

  test("ruling: after Watcher's play trigger resolves the printed-1 Runt is 1 (2 - 3 floored at 1) and the printed-4 Bruiser is 2 (5 - 3)", async () => {
    const game = await watcherResolved();
    expect(game.state("runt").might).toBe(1);
    expect(game.state("bruiser").might).toBe(2);
    // Sanity on the rest of the effect: the base-bound Homebody (no camp bonus) is 4 - 3 = 1; Watcher itself untouched.
    expect(game.state("home").might).toBe(1);
    expect(game.state("watcher").might).toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("the floor is not 'printed 1 then +1': the Runt does NOT end at 2, and the Bruiser does NOT end at 1 (-3 from printed) or 3", async () => {
    const game = await watcherResolved();
    expect(game.state("runt").might).not.toBe(2);
    expect([1, 3]).not.toContain(game.state("bruiser").might);
  });

  test("this turn only: next turn the Runt is 2 and the Bruiser 5 again at the Camp", async () => {
    const game = await watcherResolved();
    await game.advanceTurn();
    expect(game.state("runt").might).toBe(2);
    expect(game.state("bruiser").might).toBe(5);
    expect(game.state("home").might).toBe(4);
  });
});
