/**
 * Ruling 34c155515683a1cb — Moonfall (UNL-198 → unl-198-219) · [Action] · [3][rainbow]
 *     "Choose a battlefield where you have units. You may move up to one enemy unit to that battlefield.
 *      Then give enemy units there -2 [Might] this turn."
 *   × Charm (OGN-043 → ogn-043-298) · Calm · [1][calm] · "Move an enemy unit."
 *
 * Q: If I play Moonfall and then a unit arrives at that battlefield, does the newcomer also get -2?
 * A: No. Moonfall's -2 snapshots the enemy units standing there when it RESOLVES; anything that arrives
 *    afterwards (Ambush, a standard move, Charm, …) is untouched by that casting.
 * Rules: 359 (effects apply on resolution), 611 (one-shot continuous effects fix their affected set).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MOONFALL = "unl-198-219";
const CHARM = "ogn-043-298";

/** P1's main phase. P1 holds bf1 with an Anchor; P2's Early (5) already stands there, Later (5) waits at home. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1, calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Anchor" }, "anchor")
    .unit(P2, "bf1", { might: 5, name: "Early" }, "early")
    .unit(P2, "base", { might: 5, name: "Later" }, "later")
    .hand(P1, MOONFALL, "moonfall")
    .hand(P1, CHARM, "charm");
}

/**
 * Cast Moonfall (bf1 is the only battlefield where P1 has units, so it is bound automatically),
 * decline its optional "move up to one enemy unit", and let the -2 resolve.
 */
async function moonfallAtBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("moonfall");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, allowDecline: true });
  await game.p1.decline(); // move nobody in — we only care about who is already standing there
  await game.settle();
  expect(game.zoneOf("moonfall")).toBe("trash");
  return game;
}

describe("Ruling 34c155515683a1cb — Moonfall's -2 only hits the enemy units present at resolution", () => {
  test("the enemy unit standing at the battlefield when Moonfall resolves gets -2 (5 → 3)", async () => {
    const game = await moonfallAtBf1();
    expect(game.state("early")).toMatchObject({ might: 3, mightModifier: -2 });
    expect(game.state("anchor").might).toBe(3); // friendly units are untouched
  });

  test("ruling: an enemy unit Charmed to that battlefield AFTERWARDS keeps its full Might (no -2)", async () => {
    const game = await moonfallAtBf1();
    await game.p1.cast("charm", { targets: "later", answers: ["bf1"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("later")).toBe("bf1");
    expect(game.state("later")).toMatchObject({ might: 5, mightModifier: 0 });
    expect(game.state("early").might).toBe(3); // the snapshot victim is unchanged
    expect(game.violations()).toEqual([]);
  });

  test("the -2 is a 'this turn' effect: it wears off at the end of the turn", async () => {
    const game = await moonfallAtBf1();
    expect(game.state("early").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("early")).toMatchObject({ might: 5, mightModifier: 0 });
  });
});
