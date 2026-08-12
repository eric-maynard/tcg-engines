/**
 * Ruling c78bc1aab6a2dc7b — Jinx, Demolitionist (OGN-030 → ogn-030-298) · Unit · Fury · [3][fury] · 4 Might
 *   "[Accelerate] · [Assault 2] · When you play me, discard 2."
 *
 * Q: Is the "discard two" a cost you must pay, or an ordinary "when you play" trigger?
 * A: A trigger. It happens AFTER Jinx has been played, and you do as much of it as you can: with one card
 *    in hand you discard one, with an empty hand you discard nothing — and Jinx is playable either way. A
 *    real cost would have read "as an additional cost to play me, discard a card".
 * Rules: 383.1 ("when you play me" is a triggered ability, put on the chain after the play),
 *        356.2 (an additional cost is worded as one and is paid during the play), 359.3.f (do as much as
 *        possible).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const JINX = "ogn-030-298";
const SPARE = "ogn-175-298";

/** P1's turn with exactly enough for Jinx, plus `extra` other cards in hand. */
function board(extra: number) {
  let b = scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .hand(P1, JINX, "jinx");
  for (let i = 0; i < extra; i += 1) {
    b = b.hand(P1, SPARE, `c${i}`);
  }
  return b;
}

describe("Ruling c78bc1aab6a2dc7b — Jinx's 'discard 2' is a trigger, not a cost", () => {
  test("ruling: Jinx is playable with NOTHING else in hand — a cost would have forbidden it", async () => {
    const game = await board(0).build();
    expect(game.p1.hand()).toEqual(["jinx"]);
    expect(game.p1.can("play", "jinx")).toBe(true);

    await game.p1.play("jinx");
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.p1.trash()).toEqual([]); // nothing to discard, and nothing was owed
  });

  test("ruling: Jinx is already on the board while the discard is still on the chain — he was played first", async () => {
    const game = await board(3).build();
    await game.p1.play("jinx");
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.locationOf("jinx")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jinx", triggered: true })]);
    expect(game.p1.hand()).toEqual(["c0", "c1", "c2"]); // the hand is still untouched
  });

  test("ruling: with one other card in hand you discard exactly that one — 'as much as you can'", async () => {
    const game = await board(1).build();
    await game.p1.play("jinx");
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.trash()).toEqual(["c0"]);
    expect(game.zoneOf("jinx")).toBe("base");
  });

  test("with two or more cards in hand, exactly two are discarded and the rest stay", async () => {
    const game = await board(3).build();
    await game.p1.play("jinx");
    await game.settle();
    await game.p1.pick("c0");
    await game.settle();
    await game.p1.pick("c1");
    await game.settle();

    expect(game.p1.trash().sort()).toEqual(["c0", "c1"]);
    expect(game.p1.hand()).toEqual(["c2"]);
    expect(game.violations()).toEqual([]);
  });
});
