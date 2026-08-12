/**
 * Ruling 3f11e8902671896e — Thousand-Tailed Watcher (OGN-116 → ogn-116-298) · Unit · 7 Might · [7][mind]
 *   "[Accelerate] … When you play me, give enemy units -3 [Might] this turn, to a minimum of 1 [Might]."
 *   × Shen, Kinkou (OGN-241 → ogn-241-298) · Unit · 3 Might · [3][order] · [Reaction] "[Shield 2] [Tank]"
 *
 * Q: Does the Watcher's -3 apply to Shen if Shen is played as a reaction after the Watcher's trigger?
 * A: Yes, if Shen is played in RESPONSE to the trigger: he hits the field before the trigger resolves, and the
 *    trigger affects every enemy unit present at resolution — not just those there when it fired. Shen played
 *    later in the turn, after the trigger has already resolved, is unaffected.
 * Rules: 340 (chain resolves backwards), 359.3 (an "all" instruction reads the board at resolution), 419.4.a.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WATCHER = "ogn-116-298";
const SHEN = "ogn-241-298";
const CLEAVE = "ogn-004-298"; // [1] Action — give a unit +3 [Might] this turn (used only to reopen a priority window)

/** P1's turn. P1: the Watcher + Cleave + [8][mind] and a Squire; P2: Shen in hand + [3][order] and a Grunt (4). */
function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { mind: 1 } })
    .resources(P2, { energy: 3, power: { order: 1 } })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .unit(P2, "base", { might: 4, name: "Grunt" }, "grunt")
    .hand(P1, WATCHER, "watcher")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, SHEN, "shen");
}

/** P1 plays the Watcher; its "when you play me" trigger sits on the chain, unresolved, and P2 has priority. */
async function watcherTriggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("watcher", { to: "base" });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true })]);
  expect(game.state("grunt").might).toBe(4); // nothing has resolved yet
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 3f11e8902671896e — the Watcher's -3 hits whoever is present when the TRIGGER resolves", () => {
  test("ruling: Shen may be played in response to the trigger, and he is on the board while the trigger still waits", async () => {
    const game = await watcherTriggerOnChain();
    expect(game.p2.can("play", "shen")).toBe(true);
    await game.p2.play("shen", { to: "base" });
    expect(game.locationOf("shen")).toBe("base"); // a [Reaction] unit enters at once
    expect(game.chain().map((c) => c.cardId)).toEqual(["watcher"]); // the trigger has NOT resolved yet
    expect(game.state("shen").might).toBe(3);
  });

  test("ruling: when the trigger then resolves it reads the CURRENT set of enemy units — Shen takes the -3 too (3 → 1 floor)", async () => {
    const game = await watcherTriggerOnChain();
    await game.p2.play("shen", { to: "base" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("shen").might).toBe(1); // 3 − 3 = 0, floored at the printed minimum of 1
    expect(game.state("grunt").might).toBe(1); // 4 − 3
    expect(game.violations()).toEqual([]);
  });

  test("ruling: Shen played LATER in the turn — after the trigger has resolved — is untouched and stays 3", async () => {
    const game = await watcherTriggerOnChain();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("grunt").might).toBe(1);
    // A fresh chain item gives P2 another window; the Watcher's trigger is long gone.
    await game.p1.cast("cleave", { targets: "squire" });
    await game.p1.passPriority();
    await game.p2.play("shen", { to: "base" });
    await game.settle();
    expect(game.state("shen").might).toBe(3);
    expect(game.state("grunt").might).toBe(1); // the earlier victim keeps the debuff for the turn
    expect(game.violations()).toEqual([]);
  });

  test("the debuff is 'this turn' only — the responding Shen is back to 3 next turn", async () => {
    const game = await watcherTriggerOnChain();
    await game.p2.play("shen", { to: "base" });
    await game.settle();
    expect(game.state("shen").might).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("shen").might).toBe(3);
    expect(game.state("grunt").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
