/**
 * Ruling 96bc5bca966d0adc — (no specific card) a stunned unit ganks battlefield-to-battlefield and
 *   is recalled: where does it land?
 *   Exercised with an inline [Ganking] unit and an inline [Action] "Recall a friendly unit."
 *
 * Q: I gank from one battlefield to another while stunned. Am I recalled to base, or back to the
 *    battlefield I came from?
 * A: To your base, always. A Recall is by definition "relocate a permanent from anywhere to its
 *    base"; it has no memory of where the unit came from and being stunned changes nothing.
 * Rules: 455 (a Recall relocates a Permanent from anywhere to its Base), 456 / 456.1 (Recalls are
 *        not Moves and fire no move triggers), 466.1.a.2 (a losing attacker is recalled),
 *        423.1.b (a Stunned unit contributes no Might in the combat damage step).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

/** 5 Might · [Ganking] · "When I move, draw 1." — the draw proves Recalls are not Moves. */
const GANKER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }],
  cardType: "unit",
  keywords: ["Ganking"],
  might: 5,
  name: "Test Ganker",
  rulesText: "[Ganking]\nWhen I move, draw 1.",
} as const;

/** [Action] "Recall a friendly unit." */
const WITHDRAW = {
  abilities: [
    { effect: { target: { controller: "friendly", type: "unit" }, type: "recall" }, timing: "action", type: "spell" },
  ],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Withdraw",
  rulesText: "[Action] Recall a friendly unit.",
  timing: "action",
} as const;

/** P1's turn: P1 holds bf1 with the (stunned) Ganker; bf2 is P2's, walled by a 9-Might Wall. */
const board = (stunned: boolean) =>
  scenario()
    .resources(P1, { energy: 2, power: { calm: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", GANKER, "ganker", stunned ? { stunned: true } : {})
    // 9 Might so the attacker can never win, and "I don't deal combat damage" so it survives to
    // be recalled rather than simply dying.
    .unit(P2, "bf2", { keywords: ["NoCombatDamage"], might: 9, name: "Wall" }, "wall")
    .hand(P1, WITHDRAW, "withdraw");

describe("Ruling 96bc5bca966d0adc — a Recall always ends at base", () => {
  test("a stunned unit that ganks into a losing combat is recalled to BASE, not back to bf1", async () => {
    const game = await board(true).build();
    expect(game.state("ganker").isStunned).toBe(true);
    await game.p1.gank("ganker", "bf2");
    expect(game.locationOf("ganker")).toBe("bf2");
    await game.settle();
    // 9-Might Wall vs a stunned attacker contributing nothing: the defender holds and the
    // attacker is recalled.
    expect(game.zoneOf("wall")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P2);
    expect(game.locationOf("ganker")).toBe("base"); // NOT "bf1"
    expect(game.zoneOf("ganker")).toBe("base");
    expect(game.violations()).toEqual([]);
  });

  test("the same for an unstunned loser — the origin battlefield is never a Recall destination", async () => {
    const game = await board(false).build();
    await game.p1.gank("ganker", "bf2");
    await game.settle();
    expect(game.locationOf("ganker")).toBe("base");
  });

  test("an effect that recalls a unit sitting on a battlefield also sends it to base", async () => {
    const game = await board(true).build();
    await game.p1.cast("withdraw", { targets: "ganker" });
    await game.settle();
    expect(game.locationOf("ganker")).toBe("base");
  });

  test("and a Recall is not a Move: the unit's 'when I move' trigger does not fire for it", async () => {
    const game = await board(true).build();
    const handBefore = game.p1.hand().length;
    await game.p1.cast("withdraw", { targets: "ganker" });
    await game.settle();
    expect(game.locationOf("ganker")).toBe("base");
    expect(game.p1.hand().length).toBe(handBefore - 1); // only the Withdraw left the hand
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
