/**
 * Ruling 806dbce95f6edbb3 — Ezreal, Dashing (SFD-082 → sfd-082-221) · Unit · Mind · [4][mind] · 3 Might
 *   "When I attack or defend, deal damage equal to my Might to an enemy unit here.
 *    I don't deal combat damage.
 *    [mind]: [Action] — Move me to your base."
 *
 * Q: Ezreal is attacked and the attacker passes priority. Can I use his [Action] to run him home BEFORE his
 *    "when I defend" damage resolves?
 * A: No. The defend trigger goes on the Initial Chain and resolves first; while anything is on the chain only
 *    reaction-speed things may be played, and his ability is an [Action]. Once that chain empties you may use it.
 * Rules: 336 (Initial Chain on attack/defend), 347 (only [Reaction] speed while items are on the chain),
 *        383 (triggered abilities go on the chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EZREAL_DASHING = "sfd-082-221";

/** P2's turn. P1 defends bf1 with Ezreal and holds the [mind] his escape ability costs. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P1, { power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", EZREAL_DASHING, "ezreal")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

async function attacked(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("ezreal").combatRole).toBe("defender");
  return game;
}

describe("Ruling 806dbce95f6edbb3 — Ezreal's [Action] escape cannot pre-empt his own 'when I defend' trigger", () => {
  test("defending puts his trigger on the Initial Chain before anyone may act", async () => {
    const game = await attacked();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ezreal", controller: P1, triggered: true })]);
  });

  test("with that item on the chain the [Action] ability is NOT offered, even to Ezreal's controller", async () => {
    const game = await attacked();
    expect(game.p1.can("activate", "ezreal")).toBe(false);
    expect((await game.p1.try((p) => p.activate("ezreal", 3))).ok).toBe(false);
    expect(game.locationOf("ezreal")).toBe("bf1");
  });

  test("the trigger resolves first — the Raider eats Ezreal's 3 damage", async () => {
    const game = await attacked();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").damage).toBe(3);
  });

  test("…and only THEN is the [Action] available: he may run home once the chain is empty", async () => {
    const game = await attacked();
    await game.acting().passPriority();
    await game.acting().passPriority();
    await game.p2.passFocus(); // the attacker holds Focus first; P1 acts next
    expect(game.p1.can("activate", "ezreal")).toBe(true);
    await game.p1.activate("ezreal", 3);
    await game.settle();
    expect(game.locationOf("ezreal")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
