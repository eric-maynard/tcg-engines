/**
 * Ruling 4cd38f12ab0ea11b — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · [7][mind] · 7 Might
 *   "[Accelerate] When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Shen, Kinkou (OGN-241 → ogn-241-298) · [Reaction] unit · [3][order] · 3 Might — an enemy unit that
 *     can be played either DURING the Watcher's trigger or after it has already resolved.
 *
 * Q: Does the Watcher's debuff also hit enemy units played after it?
 * A: No. The trigger snapshots the board when it RESOLVES: only enemy units present at that moment take
 *    the -3. It is a one-shot effect, not a lingering aura, so anything that arrives later is unaffected.
 *    A unit played in reaction to the trigger, though, is already there when it resolves — and is hit.
 * Rules: 359.3 (an effect acts on what exists as it resolves), 355.10 ("all"-style instructions gather
 *        their objects at resolution), 611 (a resolved Might change is not a continuous aura).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const SHEN = "ogn-241-298"; // [Reaction] unit, 3 Might
const DREDGE_UP = "ven-049-166"; // a cheap spell, to reopen a chain later in P1's turn

/** P1's turn with [7][mind] (Watcher) plus [2] to spare; P2 has a 5-Might Veteran out and two Shens in hand with [8][order][order]. */
function board() {
  return scenario()
    .resources(P1, { energy: 9, power: { mind: 1 } })
    .resources(P2, { energy: 8, power: { order: 2 } })
    .unit(P2, "base", { might: 5, name: "Veteran" }, "veteran")
    .hand(P1, WATCHER, "ttw")
    .hand(P1, DREDGE_UP, "dredge")
    .hand(P2, SHEN, "shenEarly")
    .hand(P2, SHEN, "shenLate");
}

/** P1 plays the Watcher; the trigger is on the chain and P1 passes priority to P2. */
async function triggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("ttw");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ttw", controller: P1, triggered: true })]);
  expect(game.state("veteran").might).toBe(5); // nothing has happened yet
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 4cd38f12ab0ea11b — the Watcher snapshots the board when its trigger resolves", () => {
  test("the units on the board at resolution take the -3 (Veteran 5 → 2)", async () => {
    const game = await triggerOnChain();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("veteran")).toMatchObject({ baseMight: 5, might: 2 });
  });

  test("a unit played IN REACTION to the trigger is on the board when it resolves, so it is hit too (Shen 3 → floored at 1)", async () => {
    const game = await triggerOnChain();
    await game.p2.play("shenEarly", { to: "base" });
    expect(game.zoneOf("shenEarly")).toBe("base");
    expect(game.state("shenEarly").might).toBe(3);
    await game.settle();
    expect(game.state("shenEarly").might).toBe(1); // 3 − 3 = 0, floored to 1
    expect(game.state("veteran").might).toBe(2);
  });

  test("ruling 4cd38f12ab0ea11b — a unit played AFTER the trigger has resolved is untouched: the second Shen is a full 3", async () => {
    const game = await triggerOnChain();
    await game.settle();
    expect(game.chain()).toEqual([]);
    // A fresh chain later in the same turn; P2 answers it with the second Shen at Reaction speed.
    await game.p1.cast("dredge");
    await game.p1.passPriority();
    await game.p2.play("shenLate", { to: "base" });
    await game.settle();
    expect(game.zoneOf("shenLate")).toBe("base");
    expect(game.state("shenLate")).toMatchObject({ baseMight: 3, might: 3, mightModifier: 0 });
    expect(game.state("veteran").might).toBe(2); // the earlier victim keeps its -3
    expect(game.violations()).toEqual([]);
  });

  test("it is not an aura: the -3 is a 'this turn' modifier that lapses at end of turn, and it never re-applies", async () => {
    const game = await triggerOnChain();
    await game.settle();
    expect(game.state("veteran").might).toBe(2);
    await game.advanceTurn();
    expect(game.state("veteran")).toMatchObject({ might: 5, mightModifier: 0 });
  });
});
