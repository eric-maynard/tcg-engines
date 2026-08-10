/**
 * Ruling f24ac67dd887ecb9 — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · Mind · [7]+[mind] · 7 Might
 *     "When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield · "Units here have +1 [Might]. (This includes attackers.)"
 *   (+ Charm ogn-043-298 "Move an enemy unit." to relocate the unit; Discipline ogn-058-298 "+2 [Might] this turn" as
 *    the later buff.)
 *
 * Q: Enemy units sit at the War Camp (+1) when I play the Watcher — do they still "get the +1" afterwards?
 * A: The Watcher works from the unit's CURRENT Might (which includes the Camp's +1): 2 base + 1 = 3, −3 floored ⇒ 1.
 *    The unit reads 1 at the Camp. Moving back to the Camp it is still 1. A later +N buff applies normally on top
 *    (1 + N). [The ruling also claims it stays 1 after moving AWAY — see RULING-CONFLICT below.]
 * Rules: 359.2 (one-shot evaluated on resolution), 476–478 (Might arithmetic; the Camp's +1 is a continuous,
 *        location-dependent bonus).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const WAR_CAMP = "ogn-294-298";
const CHARM = "ogn-043-298";
const DISCIPLINE = "ogn-058-298";

/**
 * P1's turn. P2 holds the live War Camp with a printed-2 Grunt and a printed-4 Sentry, and bf2 (inert) with a Holder.
 * P1: Watcher, two Charms, Discipline in hand and exactly the resources for all four.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 11, power: { calm: 2, mind: 1 } })
    .battlefield("camp", { controller: P2, def: WAR_CAMP, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "camp", { might: 2, name: "Grunt" }, "grunt")
    .unit(P2, "camp", { might: 4, name: "Sentry" }, "sentry")
    .unit(P2, "bf2", { might: 3, name: "Holder" }, "holder")
    .hand(P1, WATCHER, "watcher")
    .hand(P1, CHARM, "charm1")
    .hand(P1, CHARM, "charm2")
    .hand(P1, DISCIPLINE, "discipline");
}

async function watcherResolved(): Promise<Game> {
  const game = await board().build();
  expect(game.state("grunt")).toMatchObject({ baseMight: 2, might: 3 }); // 2 + Camp
  expect(game.state("sentry").might).toBe(5);
  await game.p1.play("watcher");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", triggered: true })]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  return game;
}

/** Charm `grunt` to `dest` and let it resolve. */
async function charmGrunt(game: Game, charm: string, dest: string): Promise<void> {
  await game.p1.cast(charm, { targets: "grunt" });
  if (game.decision()?.kind === "pick") {
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick(`battlefield-${dest}`);
  }
  await game.settle();
  expect(game.zoneOf(charm)).toBe("trash");
  expect(game.locationOf("grunt")).toBe(dest);
}

describe("Ruling f24ac67dd887ecb9 — Watcher at the War Camp: current (Camp-boosted) Might −3, floored at 1", () => {
  test("example sequence: Grunt 2 base + 1 Camp = 3; Watcher resolves ⇒ Grunt is 1 at the Camp (3 − 3 = 0, floored to 1); Sentry 5 ⇒ 2", async () => {
    const game = await watcherResolved();
    expect(game.locationOf("grunt")).toBe("camp");
    expect(game.state("grunt").might).toBe(1);
    expect(game.state("sentry").might).toBe(2);
    expect(game.state("holder").might).toBe(1); // 3 − 3 = 0 → floored 1 (not at the Camp)
    expect(game.violations()).toEqual([]);
  });

  test("moving away from the Camp: the locked-in reduction stays and the Camp's +1 is lost", async () => {
    const game = await watcherResolved();
    await charmGrunt(game, "charm1", "bf2");
    // RULING-CONFLICT: riftjudge f24ac67dd887ecb9 says the Grunt "remains 1" off the Camp (Might set to a fixed value);
    // riftjudge 82619873f4ff43be (same two cards) and the engine's CR 359.2/476 model say the Watcher locks in a −2
    // MODIFIER (3 → 1), so off the Camp the unit reads 2 − 2 = 0 — engine follows the modifier model.
    expect(game.state("grunt")).toMatchObject({ baseMight: 2, might: 0 });
  });

  test("moving back to the Camp: the Grunt is 1 again (the Camp's +1 re-applies on top of the locked reduction; no re-flooring)", async () => {
    const game = await watcherResolved();
    await charmGrunt(game, "charm1", "bf2");
    await charmGrunt(game, "charm2", "camp");
    expect(game.state("grunt").might).toBe(1);
    expect(game.state("sentry").might).toBe(2);
  });

  test("future buffs apply normally to the reduced value: Discipline (+2) on the Sentry at the Camp ⇒ 2 + 2 = 4", async () => {
    const game = await watcherResolved();
    await game.p1.cast("discipline", { targets: "sentry" });
    await game.settle();
    expect(game.zoneOf("discipline")).toBe("trash");
    expect(game.state("sentry").might).toBe(4);
    expect(game.state("grunt").might).toBe(1);
  });

  test("'this turn': next turn the Grunt at the Camp is 3 and the Sentry 5 again", async () => {
    const game = await watcherResolved();
    await game.advanceTurn();
    expect(game.state("grunt").might).toBe(3);
    expect(game.state("sentry").might).toBe(5);
  });
});
