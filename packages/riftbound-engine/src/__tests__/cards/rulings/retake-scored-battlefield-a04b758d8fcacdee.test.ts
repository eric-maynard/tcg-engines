/**
 * Ruling a04b758d8fcacdee — (no specific card) retreating off a battlefield you already scored this
 *   turn and walking back on: is that a Conquer?
 *   Exercised with Voracious Gromp (UNL-100 → unl-100-219) · 5 Might · "[Hunt 3] (When I conquer or
 *   hold, gain 3 XP.)" and an inline [Action] "Recall a friendly unit."
 *
 * Q: Does retreating all units from a battlefield you already scored this turn, then moving a unit
 *    back onto it, count as a Conquer and trigger Conquer effects?
 * A: No. A battlefield can only be Scored once per turn per player, and a Conquer that is not a
 *    Score triggers nothing and pays nothing. Holding scores happen only in the Beginning Phase,
 *    so re-taking it later in the turn gets you nothing at all.
 * Rules: 471.2.c (a battlefield's Score abilities cannot trigger more than once per turn for a
 *        player), 469 (Conquering = gaining control), 470 / 315.2 (Hold scores in the Beginning
 *        Phase), 323.6 (control lapses once the battlefield is empty in an Open State).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GROMP = "unl-100-219"; // 5 Might · [Hunt 3] — "when I conquer or hold, gain 3 XP"

/** [Action] "Recall a friendly unit." */
const WITHDRAW = {
  abilities: [
    {
      effect: { target: { controller: "friendly", type: "unit" }, type: "recall" },
      timing: "action",
      type: "spell",
    },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Withdraw",
  rulesText: "[Action] Recall a friendly unit.",
  timing: "action",
} as const;

/** P1's turn. bf1 and bf2 are P2's, each with a 1-Might Chaff. P1 has a Bruiser and the Gromp. */
const board = () =>
  scenario()
    .resources(P1, { energy: 2, power: { calm: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Chaff1" }, "chaff1")
    .unit(P2, "bf2", { might: 1, name: "Chaff2" }, "chaff2")
    .unit(P1, "base", { might: 6, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", GROMP, "gromp")
    .hand(P1, WITHDRAW, "withdraw");

describe("Ruling a04b758d8fcacdee — re-taking a battlefield you already scored this turn is worth nothing", () => {
  test("the first conquest scores normally", async () => {
    const game = await board().build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("retreat everything, then walk back in: control changes hands again but NO point and NO conquer trigger", async () => {
    const game = await board().build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);

    // pull the only unit off bf1 — control lapses once the board settles in an Open State
    await game.p1.cast("withdraw", { targets: "bruiser" });
    await game.settle();
    expect(game.locationOf("bruiser")).toBe("base");
    expect(game.p1.units("bf1")).toEqual([]);

    // …and walk the Gromp back on
    await game.p1.move("gromp", "bf1");
    await game.settle();
    expect(game.locationOf("gromp")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1); // still 1 — not scored twice
    expect(game.p1.xp()).toBe(0); // [Hunt 3] never paid out: no Score ⇒ no Conquer trigger
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a battlefield NOT yet scored this turn does pay out on the very same walk-in", async () => {
    const game = await board().build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.p1.move("gromp", "bf2"); // a different, unscored battlefield
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.xp()).toBe(3); // [Hunt 3] fires here
  });

  test("the once-per-turn lock is per turn: the same battlefield scores again on a later turn", async () => {
    const game = await board().build();
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    await game.advanceTurn(); // → P2's turn
    await game.advanceTurn(); // → P1's next Beginning Phase: the Hold score
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
  });
});
