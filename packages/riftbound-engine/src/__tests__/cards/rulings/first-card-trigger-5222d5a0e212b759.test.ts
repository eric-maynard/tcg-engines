/**
 * Ruling 5222d5a0e212b759 — (a hypothetical unit; no printed card exists)
 *   The question's card is "When you play your first card each turn, if I'm at a battlefield, <benefit>."
 *   Modelled inline as Sequence Herald — same trigger and same "if I'm at a battlefield" condition, with a
 *   draw as the benefit (the timing question is about WHEN the condition is checked, not what it grants).
 *
 * Q: If I play this card itself to a battlefield, and it is the first card I've played this turn, does its own
 *    trigger see it there and give me the benefit?
 * A: Yes. The trigger condition is evaluated after the inciting event — playing the card — has been fully
 *    processed, by which time the unit has finalized and entered the battlefield. So "if I'm at a battlefield"
 *    is true and the trigger goes on the chain.
 * Rules: 383.2.c (a trigger is evaluated after the event that incited it is fully processed), 383.2.c.1 (an
 *        object whose ability is active in a zone can evaluate its trigger when it enters that zone at the same
 *        time the condition is met), 383.3.e (the "if" condition is checked when the trigger would be queued).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

/** Inline [2] 2-Might unit: "When you play your first card each turn, if I'm at a battlefield, draw 1." */
const SEQUENCE_HERALD = {
  abilities: [
    {
      condition: { type: "while-at-battlefield" },
      effect: { amount: 1, type: "draw" },
      trigger: {
        event: "play-card",
        on: "controller",
        restrictions: [{ count: 1, type: "nth-time-each-turn" }],
      },
      type: "triggered",
    },
  ],
  cardType: "unit",
  energyCost: 2,
  might: 2,
  name: "Sequence Herald",
};

const FILLER = { cardType: "unit", energyCost: 1, might: 1, name: "Filler" };

/** P1's turn with [4]. P1 already controls bf1 (an Anchor holds it), so the Herald may be played there. */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Anchor" }, "anchor")
    .hand(P1, SEQUENCE_HERALD, "herald")
    .hand(P1, FILLER, "filler");
}

describe("Ruling 5222d5a0e212b759 — the unit's own play is the first card, and by the time the condition is checked it is already at the battlefield", () => {
  test("played to bf1 as the first card of the turn: the trigger fires and the benefit lands (P1 draws 1)", async () => {
    const game = await board().build();
    expect(game.p1.hand().sort()).toEqual(["filler", "herald"]);
    await game.p1.play("herald", { to: "bf1" });
    expect(game.locationOf("herald")).toBe("bf1"); // finalized and on the board before the trigger is evaluated
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2); // herald left the hand, the draw replaced it
    expect(game.p1.hand()).toContain("filler");
    expect(game.violations()).toEqual([]);
  });

  test("played to BASE instead, the same first-card trigger finds the condition false and nothing happens", async () => {
    const game = await board().build();
    await game.p1.play("herald");
    expect(game.locationOf("herald")).toBe("base");
    await game.settle();
    expect(game.p1.hand()).toEqual(["filler"]); // no draw
  });

  test("it really is the FIRST card each turn: with another card played first, a later Herald at bf1 gets nothing", async () => {
    const game = await board().build();
    await game.p1.play("filler"); // the first card this turn
    await game.settle();
    const hand = game.p1.hand().length;
    await game.p1.play("herald", { to: "bf1" });
    await game.settle();
    expect(game.locationOf("herald")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(hand - 1); // only the Herald left the hand; nothing was drawn
  });
});
