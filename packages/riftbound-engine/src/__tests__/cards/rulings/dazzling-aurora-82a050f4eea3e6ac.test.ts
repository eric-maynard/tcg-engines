/**
 * Ruling 82a050f4eea3e6ac — Dazzling Aurora (OGN-160 → ogn-160-298) · Gear · Body · [9][body][body]
 *     "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit and banish it.
 *      Play it, ignoring its cost, and recycle the rest."
 *
 * Q: What happens when Dazzling Aurora triggers and there are no units left in my deck?
 * A: Nothing bad — no Burn Out. You reveal the whole deck, find no unit, do as much as you can, and recycle every
 *    revealed card back into the Main Deck. The cards were never removed from the Main Deck zone by revealing, so
 *    the deck was never empty and no draw/reveal from an empty deck was ever attempted.
 * Rules: 359.3.e.11 (carry out as much of the instruction as possible), 413.2 / 415 (Burn Out only when you must
 *        draw or reveal from an already-empty Main Deck), 419.1.a (recycle returns the cards to the deck).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const SPELL = "ogn-009-298"; // Hextech Ray — a non-unit
const UNIT = "ogn-175-298"; // Shipyard Skulker — a unit

/** P1's turn with the Aurora out. P1's deck is exactly `deck`; P2 keeps a healthy deck so its own turn is normal. */
function board(deck: readonly string[]) {
  return scenario()
    .fillDecks({ main: 0, runes: 20 })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .deck(P1, deck)
    .deck(P2, [SPELL, SPELL, SPELL, SPELL, SPELL, SPELL]);
}

describe("Ruling 82a050f4eea3e6ac — a unitless deck means no unit found, no Burn Out", () => {
  test("premise: P1's whole deck is three non-units", async () => {
    const game = await board([SPELL, SPELL, SPELL]).build();
    expect(game.p1.deck()).toHaveLength(3);
  });

  test("ending the turn reveals the lot, finds no unit, and recycles everything: the deck is whole again", async () => {
    const game = await board([SPELL, SPELL, SPELL]).build();
    await game.advanceTurn();
    expect(game.p1.deck()).toHaveLength(3);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.units("bf1")).toEqual(["holder"]); // nothing was played
  });

  test("no Burn Out: the game is still running and P1 has not lost", async () => {
    const game = await board([SPELL, SPELL, SPELL]).build();
    await game.advanceTurn();
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control — the reveal really does stop at a unit: with a unit at the bottom it is taken out of the deck and the two revealed non-units are recycled", async () => {
    const game = await board([SPELL, SPELL, UNIT]).build();
    await game.advanceTurn();
    const skulkers = game.findAll({ name: "Shipyard Skulker", owner: P1 });
    expect(skulkers).toHaveLength(1);
    expect(game.zoneOf(skulkers[0]!)).toBe("banishment"); // "…and banish it"
    expect(game.p1.deck()).toHaveLength(2); // the two revealed spells went back
    expect(game.isOver()).toBe(false);
  });

  test("the clause continues 'Play it, ignoring its cost' — the banished unit arrives on the board", async () => {
    const game = await board([SPELL, SPELL, UNIT]).build();
    await game.advanceTurn();
    // rule 355.4 — the play names its own location, so its controller picks one.
    await game.p1.pick("battlefield-bf1");
    const skulker = game.find({ name: "Shipyard Skulker", owner: P1 });
    expect(game.p1.banishment()).toEqual([]);
    expect(["base", "bf1"]).toContain(game.locationOf(skulker));
  });
});
