/**
 * Ruling b9c37868beb4469f — Catalyst of Aeons (OGN-138 → ogn-138-298) · Action [4] Body
 *     "Channel 2 runes exhausted. If you couldn't channel 2 runes this way, draw 1."
 *
 * Q: If I channel just 1 rune (not 2), do I also draw 1?
 * A: Yes — channeling only 1 means you "couldn't channel 2", so you draw 1 as well.
 * Rules: 430.3 (channel as many as the Rune Deck allows), 359.3.e.14 (linked "if you couldn't … this way").
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const CATALYST = "ogn-138-298";
const BODY_RUNE = { cardType: "rune", domain: "body", name: "Body Rune" } as const;

/** P1's turn with [4], Catalyst in hand and a Rune Deck of exactly `runes` runes (main deck still auto-filled). */
function board(runes: number) {
  return scenario()
    .fillDecks({ main: 10, runes: 0 })
    .resources(P1, { energy: 4 })
    .hand(P1, CATALYST, "catalyst")
    .runeDeck(P1, Array.from({ length: runes }, () => BODY_RUNE));
}

describe("Ruling b9c37868beb4469f — Catalyst of Aeons: channeling only 1 rune still draws 1", () => {
  test("Rune Deck of exactly 1: that rune is channeled EXHAUSTED, and because 2 couldn't be channeled P1 also draws 1", async () => {
    const game = await board(1).build();
    expect(game.p1.runeDeck()).toHaveLength(1);
    const hand0 = game.p1.hand().length;
    const pool0 = game.p1.runes().length;
    await game.p1.cast("catalyst");
    await game.settle();
    expect(game.zoneOf("catalyst")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(pool0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(0);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // spent Catalyst, drew 1
    expect(game.violations()).toEqual([]);
  });

  test("Rune Deck empty: nothing channeled, still draw 1", async () => {
    const game = await board(0).build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("catalyst");
    await game.settle();
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
  });

  test("control: Rune Deck of 2+ — both runes channeled exhausted and NO draw", async () => {
    const game = await board(3).build();
    const hand0 = game.p1.hand().length;
    await game.p1.cast("catalyst");
    await game.settle();
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toHaveLength(2);
    expect(game.p1.runeDeck()).toHaveLength(1);
    expect(game.p1.hand()).toHaveLength(hand0 - 1);
  });
});
