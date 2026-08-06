/**
 * Darius, Trifarian — ogn-027-298 · Champion Unit · Fury · 5 energy + 1 [fury] · 5 might
 *
 *   When you play your second card in a turn, give me +2 [Might] this turn and ready me.
 *
 * Rule 383.1 — "When …" triggered ability; the condition counts cards YOU play
 * this turn while Darius is on the board. Rule 143.4 — units enter exhausted.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-027-298";
const cheap = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name });

/** Darius already on the board (ready); three cheap cards in P1's hand, two in P2's. */
function board(active = P1) {
  return scenario()
    .active(active)
    .resources(P1, { energy: 10 })
    .resources(P2, { energy: 10 })
    .unit(P1, "base", CARD, "darius")
    .hand(P1, cheap("A"), "a")
    .hand(P1, cheap("B"), "b")
    .hand(P1, cheap("C"), "c")
    .hand(P2, cheap("X"), "x")
    .hand(P2, cheap("Y"), "y");
}

describe("Darius, Trifarian (ogn-027-298)", () => {
  test("costs 5 energy + 1 fury power to play (enters exhausted); unaffordable without the fury power", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "darius").build();
    await game.p1.play("darius", { to: "base" });
    await game.settle();
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "darius").build();
    expect(noPower.p1.can("play", "darius")).toBe(false);
  });

  test("the first card you play in a turn does not trigger him", async () => {
    const game = await board().build();
    await game.p1.play("a", { to: "base" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("darius").might).toBe(5);
  });

  test("your second card puts his trigger on the chain; it resolves for +2 Might", async () => {
    const game = await board().build();
    await game.p1.play("a", { to: "base" });
    await game.settle();
    await game.p1.play("b", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", triggered: true })]);
    await game.settle();
    expect(game.state("darius").might).toBe(7);
  });

  test("…and readies him: Darius played first (exhausted), then a second card → ready with 7 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1 } })
      .hand(P1, CARD, "darius")
      .hand(P1, cheap("A"), "a")
      .build();
    await game.p1.play("darius", { to: "base" });
    await game.settle();
    expect(game.state("darius").isExhausted).toBe(true);
    await game.p1.play("a", { to: "base" });
    await game.settle();
    expect(game.state("darius").might).toBe(7);
    expect(game.state("darius").isReady).toBe(true);
  });

  test("only the second card: a third card in the same turn does not trigger again", async () => {
    const game = await board().build();
    for (const id of ["a", "b", "c"]) {
      await game.p1.play(id, { to: "base" });
      await game.settle();
    }
    expect(game.state("darius").might).toBe(7);
  });

  test("'this turn': the +2 Might is gone after the turn ends", async () => {
    const game = await board().build();
    await game.p1.play("a", { to: "base" });
    await game.settle();
    await game.p1.play("b", { to: "base" });
    await game.settle();
    expect(game.state("darius").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("darius").might).toBe(5);
  });

  test("'you play': the opponent playing two cards on their turn does not trigger Darius", async () => {
    const game = await board(P2).build();
    await game.p2.play("x", { to: "base" });
    await game.settle();
    await game.p2.play("y", { to: "base" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("darius").might).toBe(5);
  });

  test("'in a turn': the count resets — one card last turn + one card this turn is not a second card", async () => {
    const game = await board().build();
    await game.p1.play("a", { to: "base" });
    await game.settle();
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 again (2 fresh runes channelled)
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.tapRunes(2);
    await game.p1.play("b", { to: "base" });
    await game.settle();
    expect(game.state("darius").might).toBe(5);
    await game.p1.play("c", { to: "base" });
    await game.settle();
    expect(game.state("darius").might).toBe(7);
  });
});
