/**
 * Dazzling Aurora — ogn-160-298 · Gear · Body · 9 energy + [body][body]
 *
 *   At the end of your turn, reveal cards from the top of your Main Deck until you reveal a
 *   unit and banish it. Play it, ignoring its cost, and recycle the rest.
 *
 * Rules: 317 (end-of-turn triggers resolve in the Ending Phase before the turn passes),
 * 356.1.b.1 ("ignoring its cost" zeroes Energy AND Power), 594 (recycle = bottom of Main Deck).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-160-298";
const MOBILIZE = "ogn-134-298"; // spell
const CLEAVE = "ogn-004-298"; // spell
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit
const VI = "ogn-036-298"; // unit with a Power cost: 2 energy + [fury]

function withAurora(unitDef = SKULKER) {
  return scenario()
    .gear(P1, CARD, "aurora")
    .deck(P1, [MOBILIZE, CLEAVE, unitDef, MOBILIZE], ["s1", "s2", "found", "s3"]);
}

describe("Dazzling Aurora (ogn-160-298)", () => {
  test("costs 9 energy + 2 body to play into the base; unaffordable with 8 energy or a single body", async () => {
    const game = await scenario().resources(P1, { energy: 9, power: { body: 2 } }).hand(P1, CARD, "aurora").build();
    await game.p1.play("aurora");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("aurora")).toBe("base");
    expect(game.p1.gear()).toContain("aurora");
    const low = await scenario().resources(P1, { energy: 8, power: { body: 2 } }).hand(P1, CARD, "aurora").build();
    expect(low.p1.can("play", "aurora")).toBe(false);
    const oneBody = await scenario().resources(P1, { energy: 9, power: { body: 1 } }).hand(P1, CARD, "aurora").build();
    expect(oneBody.p1.can("play", "aurora")).toBe(false);
  });

  test("at the end of YOUR turn the trigger goes on the chain during the Ending Phase", async () => {
    const game = await withAurora().build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  });

  test("reveals until a unit: the unit is played to the board for free, the revealed spells go to the bottom, the rest of the deck is untouched", async () => {
    const game = await withAurora().build();
    expect(game.p1.deck().slice(0, 4)).toEqual(["s1", "s2", "found", "s3"]);
    expect(game.p1.energy()).toBe(0);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("found")).toBe("base");
    expect(game.p1.units("base")).toContain("found");
    expect(game.p1.energy()).toBe(0); // ignoring its cost
    const deck = game.p1.deck();
    expect(deck[0]).toBe("s3"); // never revealed, still on top
    expect(deck.slice(-2).sort()).toEqual(["s1", "s2"]); // recycled to the bottom
    expect(game.zoneOf("s1")).toBe("mainDeck");
    expect(game.p1.banishment()).toEqual([]); // the banish is only a way-station before the play
    expect(game.p1.trash()).toEqual([]);
  });

  test("'ignoring its cost' covers Power too: a unit with a [fury] cost is played with no fury available", async () => {
    const game = await withAurora(VI).build();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.advanceTurn();
    expect(game.zoneOf("found")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("a unit on the very top is played and nothing is recycled", async () => {
    const game = await scenario().gear(P1, CARD, "aurora").deck(P1, [SKULKER, MOBILIZE], ["top", "next"]).build();
    await game.advanceTurn();
    expect(game.zoneOf("top")).toBe("base");
    expect(game.p1.deck()[0]).toBe("next");
  });

  test("only YOUR turn: the opponent ending their turn triggers nothing", async () => {
    const game = await withAurora().active(P2).build();
    await game.p2.endTurn();
    expect(game.chain().some((c) => c.cardId === "aurora")).toBe(false);
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("found")).toBe("mainDeck");
    // P1's draw step took s1; nothing else moved.
    expect(game.p1.deck().slice(0, 3)).toEqual(["s2", "found", "s3"]);
  });
});
