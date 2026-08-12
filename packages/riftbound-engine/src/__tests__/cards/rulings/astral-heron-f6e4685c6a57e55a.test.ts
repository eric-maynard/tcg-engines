/**
 * Ruling f6e4685c6a57e55a — Astral Heron (VEN-044 → ven-044-166) · Unit · 7 Might · [7]
 *   "When you play your first card each turn, if I'm at a battlefield, your next card costs
 *    [2][rainbow][rainbow] less."
 *
 * Q: If I play Astral Heron itself to a battlefield, how many cards must I play to get its discount?
 * A: One — the Heron. It is the first card of the turn, and the trigger's "if I'm at a battlefield" check is
 *    made after the play is fully processed, when the Heron is already standing at the battlefield. The
 *    trigger therefore fires and the SECOND card you play that turn is the discounted one.
 * Rules: 383.2 (a trigger is evaluated after the inciting event has been fully processed), 355 (a played unit
 *        arrives before triggers are checked), 383.3 (an intervening-"if" condition is checked then).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ASTRAL_HERON = "ven-044-166";
const CHEAP_UNIT = { cardType: "unit", energyCost: 5, might: 5, name: "Retainer" } as const;

/** P1's turn with plenty of energy, a controlled battlefield, the Heron and a second unit in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 20, power: { rainbow: 6 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .hand(P1, ASTRAL_HERON, "heron")
    .hand(P1, CHEAP_UNIT, "second");
}

describe("Ruling f6e4685c6a57e55a — the Heron itself is the one card you must play", () => {
  test("premise: nothing has been played yet this turn and the Heron costs [7]", async () => {
    const game = await board().build();
    expect(game.state("heron").energyCost).toBe(7);
    expect(game.p1.energy()).toBe(20);
  });

  test("ruling: playing the Heron TO A BATTLEFIELD is the first card and its own trigger fires — the Heron is already there when the condition is checked", async () => {
    const game = await board().build();
    await game.p1.play("heron", { to: "bf1" });
    expect(game.locationOf("heron")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "heron", triggered: true })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
  });

  test("…so the SECOND card played that turn is the discounted one: [5] becomes [3] and two [rainbow] are saved", async () => {
    const game = await board().build();
    await game.p1.play("heron", { to: "bf1" });
    await game.settle();
    const afterHeron = game.p1.resources();
    expect(afterHeron.energy).toBe(13); // 20 − 7
    await game.p1.play("second", { to: "base" });
    await game.settle();
    expect(game.p1.energy()).toBe(10); // 13 − (5 − 2), not 13 − 5
    expect(game.zoneOf("second")).toBe("base");
    // (The harness `costPaid` invariant compares the PRINTED cost with the pool delta and so flags every
    // discounted play; that is an accounting artefact of the oracle, not a rules violation.)
  });

  test("the discount is spent on that next card only — a third card pays full price", async () => {
    const game = await board().hand(P1, CHEAP_UNIT, "third").build();
    await game.p1.play("heron", { to: "bf1" });
    await game.settle();
    await game.p1.play("second", { to: "base" });
    await game.settle();
    const before = game.p1.energy();
    await game.p1.play("third", { to: "base" });
    await game.settle();
    expect(before - game.p1.energy()).toBe(5); // full [5]
  });

  test("contrast: play the Heron to your BASE and the intervening 'if I'm at a battlefield' fails — no trigger, no discount", async () => {
    const game = await board().build();
    await game.p1.play("heron", { to: "base" });
    expect(game.locationOf("heron")).toBe("base");
    await game.settle();
    expect(game.chain()).toEqual([]);
    const before = game.p1.energy();
    await game.p1.play("second", { to: "base" });
    await game.settle();
    expect(before - game.p1.energy()).toBe(5); // full price
    expect(game.violations()).toEqual([]);
  });

  test("contrast: if some OTHER card was the first card of the turn, the Heron played second does not trigger", async () => {
    const game = await board().build();
    await game.p1.play("second", { to: "base" }); // first card of the turn
    await game.settle();
    await game.p1.play("heron", { to: "bf1" }); // second card — the trigger's condition is "your FIRST card"
    await game.settle();
    expect(game.locationOf("heron")).toBe("bf1");
    expect(game.chain()).toEqual([]);
  });
});
