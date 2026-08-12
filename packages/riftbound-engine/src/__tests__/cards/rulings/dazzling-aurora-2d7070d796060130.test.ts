/**
 * Ruling 2d7070d796060130 — Dazzling Aurora (OGN-160 → ogn-160-298) · Body gear · [9][body][body]
 *   "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it.
 *    Play it, ignoring its cost, and recycle the rest."
 *
 * Q: If there is no unit anywhere in the deck, does revealing the whole deck give my opponent a point for
 *    decking out?
 * A: No. Cards being revealed are still in the Main Deck zone, so the deck is never empty while you reveal;
 *    you complete as much of the instruction as possible and then recycle everything back. A Burn Out only
 *    happens when you try to draw or reveal from an ALREADY empty deck.
 * Rules: Burn Out (a point is awarded only when the deck is empty before the action), zone membership while
 *        revealing, 354.2 (perform as much of an instruction as possible).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const HEXTECH_RAY = "ogn-009-298"; // a spell — never a unit
const SKULKER = "ogn-175-298"; // a 3-Might unit

/** P1's turn with the Aurora on board. `deck` is P1's whole Main Deck (no filler). */
function board(deck: readonly string[], aliases: readonly string[]) {
  return scenario()
    .gear(P1, DAZZLING_AURORA, "aurora")
    .deck(P1, [...deck], [...aliases])
    .deck(P2, [SKULKER, SKULKER, SKULKER], ["e1", "e2", "e3"])
    .fillDecks(false);
}

describe("Ruling 2d7070d796060130 — revealing a unit-less deck to the bottom is not a Burn Out", () => {
  test("ruling: three spells and no unit — P1's turn ends, the whole deck is revealed, and P2 gains NO point", async () => {
    const game = await board([HEXTECH_RAY, HEXTECH_RAY, HEXTECH_RAY], ["s1", "s2", "s3"]).build();
    expect(game.p1.deck()).toHaveLength(3);
    expect(game.p2.points()).toBe(0);
    await game.p1.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(0); // no Burn Out
    expect(game.isOver()).toBe(false);
  });

  test("…and every revealed card is recycled back: the deck is the same size, nothing went to the trash", async () => {
    const game = await board([HEXTECH_RAY, HEXTECH_RAY, HEXTECH_RAY], ["s1", "s2", "s3"]).build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.p1.deck()).toHaveLength(3);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control: with a unit in the deck the Aurora does its job — the unit is played for free and the rest recycled", async () => {
    const game = await board([HEXTECH_RAY, SKULKER, HEXTECH_RAY], ["s1", "skulker", "s2"]).build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.p1.deck()).toHaveLength(2); // the two revealed spells went back
    expect(game.p1.resources().energy).toBe(0); // ignoring its cost
    expect(game.p2.points()).toBe(0);
  });
});
