/**
 * Ruling b826dd88b5ce8df4 — Scuttle Crab (UNL-053 → unl-053-219) · Unit · [2] · 0 [Might]
 *   "When you play me, draw 1. [Deathknell] — Choose an opponent. They reveal their hand. You can look at their
 *    facedown cards this turn. Gain 1 XP."
 *
 * Q: Does my Scuttle Crab's [Deathknell] resolve after the battlefield is conquered, or before?
 * A: Before. The death queues the [Deathknell] on the Chain during combat cleanup and the Chain is resolved first;
 *    control is only established (and the Conquer scored) once the Chain is empty and cleanup is finished.
 * Rules: 808.1.d.2/808.1.d.3 ([Deathknell] is queued in cleanup, then the Chain resolves),
 *        466.5 / 348.2.a (control is established after the Chain empties and combat cleanup completes).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SCUTTLE_CRAB = "unl-053-219";

/** P2's turn: a 2-[Might] raider walks into P1's bf1, where the 0-[Might] Scuttle Crab is the only defender. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", SCUTTLE_CRAB, "crab")
    .unit(P1, "bf2", { might: 3, name: "Home" }, "home")
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
    .hand(P1, SCUTTLE_CRAB, "spare"); // something for the "reveal their hand" clause to see
}

/** Declare the attack and pass Focus on both sides, so combat damage is dealt and the Crab dies. */
async function toDeathknellOnChain() {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus();
  return game;
}

describe("Ruling b826dd88b5ce8df4 — the Crab's [Deathknell] resolves before the battlefield changes hands", () => {
  test("the Crab dies in combat and its [Deathknell] is a Chain item, not something already applied", async () => {
    const game = await toDeathknellOnChain();
    expect(game.zoneOf("crab")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "crab", controller: P1, triggered: true })]);
    expect(game.p1.xp()).toBe(0); // not yet
  });

  test("at that moment P1 still controls bf1 and P2 has scored nothing", async () => {
    const game = await toDeathknellOnChain();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("the [Deathknell] resolves first — P1 gains its XP while bf1 is still P1's", async () => {
    const game = await toDeathknellOnChain();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.p1.xp()).toBe(1);
    expect(game.chain()).toEqual([]);
  });

  test("only once the Chain is empty does P2 establish control and take the Conquer point", async () => {
    const game = await toDeathknellOnChain();
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
