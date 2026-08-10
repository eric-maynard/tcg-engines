/**
 * Ruling 82619873f4ff43be — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · 7 Might · "When you play me, give enemy units -3
 *   [Might] this turn, to a minimum of 1 [Might]."   × Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield · "Units here have
 *   +1 [Might]."   (Fight or Flight ogn-168-298 is used only to move the unit off the Camp afterwards.)
 *
 * Q: An enemy 1-Might unit (e.g. Scuttle) sits at the War Camp (+1 → 2). I play the Watcher — does it stay at 1? And if it then
 *    leaves the Camp?
 * A: The reduction is SNAPSHOTTED as the trigger resolves: current 2 → −3 floored at 1 ⇒ an effective −1 is locked in; the unit is 1
 *    at the Camp. Moving off the Camp later drops the +1 but keeps the locked −1: 1 base − 1 = 0.
 * Rules: 472.3.d.2.b (a "to a minimum of" reduction is computed once, on resolution, and then fixed for its duration), 476
 *        (the Camp's passive +1 is location-dependent and re-evaluated continuously).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const WAR_CAMP = "ogn-294-298";
const FIGHT_OR_FLIGHT = "ogn-168-298"; // [Action] "Move a unit from a battlefield to its base."

/** P1's turn 3. P2 holds the live War Camp with a printed-1 Scuttle and a printed-4 Bruiser. P1: Watcher [7][mind] + Fight or Flight [2][chaos]. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 9, power: { chaos: 1, mind: 1 } })
    .battlefield("camp", { controller: P2, def: WAR_CAMP, inert: false, owner: P2 })
    .unit(P2, "camp", { might: 1, name: "Scuttle" }, "scuttle")
    .unit(P2, "camp", { might: 4, name: "Bruiser" }, "bruiser")
    .hand(P1, WATCHER, "watcher")
    .hand(P1, FIGHT_OR_FLIGHT, "fof");
}

async function watcherResolved(): Promise<Game> {
  const game = await board().build();
  expect(game.state("scuttle")).toMatchObject({ baseMight: 1, might: 2 }); // 1 + Camp
  await game.p1.play("watcher");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true })]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.p1.resources()).toEqual({ energy: 2, power: { chaos: 1, mind: 0 } });
  return game;
}

describe("Ruling 82619873f4ff43be — Watcher's floored reduction is snapshotted: 1 at the Camp, 0 once it leaves", () => {
  test("at the Camp: Scuttle 1+1 = 2 → −3 floored ⇒ 1 (it 'stays at 1'); Bruiser 4+1 = 5 → 2", async () => {
    const game = await watcherResolved();
    expect(game.state("scuttle").might).toBe(1);
    expect(game.state("bruiser").might).toBe(2);
    expect(game.locationOf("scuttle")).toBe("camp");
  });

  test("the locked-in reduction is −1, not a live 'min 1' clamp: Fight or Flight sends Scuttle to base (losing the Camp's +1) and it reads 1 − 1 = 0", async () => {
    const game = await watcherResolved();
    await game.p1.cast("fof", { targets: "scuttle" });
    await game.settle();
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("scuttle")).toBe("base");
    expect(game.state("scuttle").baseMight).toBe(1);
    expect(game.state("scuttle").might).toBe(0);
    // The Bruiser, still at the Camp, is unchanged at 2.
    expect(game.state("bruiser").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("this turn only: next turn Scuttle (in base) is back to 1 and the Bruiser at the Camp to 5", async () => {
    const game = await watcherResolved();
    await game.p1.cast("fof", { targets: "scuttle" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("scuttle").might).toBe(1);
    expect(game.state("bruiser").might).toBe(5);
  });
});
