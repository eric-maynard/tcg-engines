/**
 * Ruling 9748095cd0ff4172 — (no specific card) responding to a Hold score.
 *
 * Q: Can I react to my opponent scoring a point by Holding a battlefield?
 * A: No. Holding scores automatically during the Beginning Phase. Scoring is not a triggered ability,
 *    it puts nothing on the chain and it opens no priority window, so there is nothing to respond to
 *    and no state in which a Reaction could be played "in response" to it.
 * Rules: 469.2 (Hold: control maintained during your Beginning Phase), 471 (what Scoring does —
 *        gain a point, then trigger Score abilities AT the battlefield), 471.2.b (only a printed Hold
 *        ability makes a chain item), 337.4 (priority exists only while a Finalized item is on the chain).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** [Reaction] "Deal 1 to a unit." — P2's would-be answer to the score. */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** P2's turn about to end; P1 holds bf1 with a Warden and P2 sits on a Reaction. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Warden" }, "warden")
    .hand(P2, STING, "sting");
}

describe("Ruling 9748095cd0ff4172 — a Hold score is automatic: no chain item, no priority, nothing to react to", () => {
  test("the point simply appears as P1's Beginning Phase runs, with an empty chain", async () => {
    const game = await board().build();
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1); // scored on the way through the Beginning Phase
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("P2 is never given a window: right after the score P2 is not acting and its [Reaction] is not castable", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p2.can("cast", "sting")).toBe(false);
    expect((await game.p2.try((p) => p.cast("sting", { targets: "warden" }))).ok).toBe(false);
    expect(game.zoneOf("sting")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("there is no window to aim at: P2 may cast its Reaction freely on its OWN turn, but the score is not yet a thing to answer", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0); // nothing has scored yet — there is nothing to respond to
    await game.p2.cast("sting", { targets: "warden" }); // legal, but simply an ordinary play on P2's turn
    await game.settle();
    expect(game.state("warden").damage).toBe(1);
    expect(game.p1.points()).toBe(0);
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1); // the Hold scores anyway, uninterruptible
    expect(game.violations()).toEqual([]);
  });

  test("killing the Warden the turn before is the only way to stop it — the score itself is untouchable once the phase runs", async () => {
    const game = await board().build();
    await game.advanceTurn(); // P2 ends, P1's turn begins and the Hold scores
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
