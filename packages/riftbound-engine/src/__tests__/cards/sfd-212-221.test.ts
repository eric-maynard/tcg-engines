/**
 * Minefield — sfd-212-221 · Battlefield
 *
 *   When you conquer here, put the top 2 cards of your Main Deck into your trash.
 *
 * Rules: 383.4.c.2.b / 471.2.a ("When you conquer here" = the conquering player's Conquer Effect at THIS
 * battlefield; holding is not conquering), 440.1 / 440.4 (this is a Burn 2: mandatory, top of YOUR Main
 * Deck → your trash, as many as possible), 431.1.b / 431.2 (moving deck cards in excess of the deck burns
 * you out: do what you can, recycle your trash into the deck, an opponent gains 1 point, then finish),
 * 385.2 / 383.2.c (a "When you conquer … from your trash" card only triggers if it was ALREADY in the
 * trash when the conquer happened — being milled by this very trigger is too late).
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. It hurts the CONQUEROR: P1 taking P2's Minefield mills P1's deck; P2's deck is untouched (and vice
 *     versa when P2 takes it back). Not optional.
 *  2. Exactly the top two, in order — the third card is your next draw.
 *  3. Deck sizes: exactly 2 → both milled, deck empty, NO burn out (nothing was "in excess"); 1 → mill it,
 *     burn out (trash incl. that card reshuffled in, opponent +1 point), mill 1 more; 0 with a trash →
 *     burn out first, then mill 2 off the recycled deck.
 *  4. Trash synergies it feeds immediately: Dr. Mundo (Might + cards in trash) conquering here grows by 2;
 *     Rhasa the Sunderer in hand gets [2] cheaper.
 *  5. Super Mega Death Rocket! ("When you conquer, you may discard 1 to return this from your trash")
 *     milled BY the Minefield trigger does not get to trigger off the same conquer; one already in the
 *     trash does.
 *  6. Negative space: holding Minefield, or conquering the battlefield next door, mills nothing.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-212-221";
const FILLER = "ogn-175-298";
const DR_MUNDO = "ogn-109-298"; // 6 Might · My Might is increased by the number of cards in your trash.
const RHASA = "ogn-195-298"; // 10 energy · I cost [1] less for each card in your trash.
const SMDR = "ogn-252-298"; // Spell · When you conquer, you may discard 1 to return this from your trash to your hand.

/** Minefield is P2's, held by a 1-Might defender; decks are explicit (no filler); P1's deck = `p1Deck` aliases d0…, top first. */
function board(p1Deck = 4) {
  const ids = Array.from({ length: p1Deck }, (_, i) => `d${i}`);
  const s = scenario()
    .fillDecks({ main: 0, runes: 12 })
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 1, name: "Defender" }, "def")
    .deck(P2, [FILLER, FILLER, FILLER], ["e0", "e1", "e2"]);
  if (p1Deck > 0) {
    s.deck(P1, ids.map(() => FILLER), ids);
  }
  return s;
}

describe("Minefield (sfd-212-221)", () => {
  test("registry payload: one conquer-here trigger (friendly conquer, here) whose effect is mill 2", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Minefield" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 2, type: "mill" },
        trigger: { event: "conquer", on: { controller: "friendly", location: "here" } },
        type: "triggered",
      },
    ]);
  });

  test("conquering here mills exactly the top 2 of the CONQUEROR's deck in order; the 3rd card becomes the top; the owner's (P2's) deck is untouched", async () => {
    const game = await board(4).build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open"); // mandatory, nothing to answer
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toEqual(["d0", "d1"]);
    expect(game.p1.deck()).toEqual(["d2", "d3"]);
    expect(game.p2.deck()).toEqual(["e0", "e1", "e2"]);
    expect(game.p2.trash()).toEqual(["def"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the trigger is a chain item controlled by the conqueror (P1), sourced from the battlefield, before it resolves", async () => {
    const game = await board(4).build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bf1", controller: P1, name: "Minefield", triggered: true })]);
    expect(game.p1.trash()).toEqual([]); // nothing milled until it resolves
    await game.settle();
    expect(game.p1.trash()).toEqual(["d0", "d1"]);
  });

  test("deck of exactly 2: both are milled and the deck is empty — no Burn Out (nothing was in excess), P2 scores nothing", async () => {
    const game = await board(2).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.p1.trash()).toEqual(["d0", "d1"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
  });

  test("deck of 1 (+2 in trash): mill the 1, BURN OUT (trash reshuffled into the deck, P2 +1 point), then mill 1 more — 1 in trash, 2 in deck (440.4 / 431.2)", async () => {
    const game = await board(1).trash(P1, FILLER, "t0").trash(P1, FILLER, "t1").build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.trash()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(2);
    expect([...game.p1.trash(), ...game.p1.deck()].sort()).toEqual(["d0", "t0", "t1"]);
  });

  test("empty deck with 3 in trash: burn out FIRST (P2 +1), then mill 2 off the recycled deck — 2 in trash, 1 in deck", async () => {
    const game = await board(0).trash(P1, FILLER, "t0").trash(P1, FILLER, "t1").trash(P1, FILLER, "t2").build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.p1.trash()).toHaveLength(2);
    expect(game.p1.deck()).toHaveLength(1);
  });

  test("'you' is the conqueror: P2 re-taking their own Minefield mills P2's deck, not P1's", async () => {
    const game = await scenario()
      .active(P2)
      .fillDecks({ main: 0, runes: 12 })
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P2, "base", { might: 3 }, "raider")
      .unit(P1, "bf1", { might: 1 }, "def")
      .deck(P1, [FILLER, FILLER, FILLER], ["d0", "d1", "d2"])
      .deck(P2, [FILLER, FILLER, FILLER], ["e0", "e1", "e2"])
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.p2.trash()).toEqual(["e0", "e1"]);
    expect(game.p2.deck()).toEqual(["e2"]);
    expect(game.p1.deck()).toEqual(["d0", "d1", "d2"]);
  });

  test("negative space — HOLDING Minefield scores the hold point and mills nothing (deck shrinks only by the draw-phase card)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks({ main: 0, runes: 12 })
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d0", "d1", "d2", "d3"])
      .deck(P2, [FILLER, FILLER], ["e0", "e1"])
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d0"]);
    expect(game.p1.deck()).toEqual(["d1", "d2", "d3"]);
  });

  test("negative space — conquering the battlefield NEXT DOOR mills nothing", async () => {
    const game = await board(4).battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 1 }, "other").build();
    await game.p1.move("raider", "bf2");
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toEqual(["d0", "d1", "d2", "d3"]);
  });

  test("partner — Dr. Mundo (Might + cards in your trash) conquering Minefield alone: 6 Might going in, 8 after his own conquer mills two", async () => {
    const game = await board(4).unit(P1, "base", DR_MUNDO, "mundo").build();
    expect(game.state("mundo").might).toBe(6);
    await game.p1.move("mundo", "bf1");
    await game.settle();
    expect(game.locationOf("mundo")).toBe("bf1");
    expect(game.p1.trash()).toEqual(["d0", "d1"]);
    expect(game.state("mundo").might).toBe(8);
  });

  test("partner — Rhasa the Sunderer (10, [1] less per card in trash): unaffordable at 8 energy before, playable for exactly 8 after the Minefield mill", async () => {
    const game = await board(4).hand(P1, RHASA, "rhasa").resources(P1, { energy: 8, power: { chaos: 2 } }).build();
    expect(game.p1.can("play", "rhasa")).toBe(false);
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.p1.trash()).toHaveLength(2);
    expect(game.p1.can("play", "rhasa")).toBe(true);
    await game.p1.play("rhasa", { to: "base" });
    expect(game.p1.energy()).toBe(0);
  });

  test("Super Mega Death Rocket! milled BY the Minefield trigger was not in the trash when you conquered → no 'return this' offer; the same card already in the trash IS offered (385.2)", async () => {
    const milled = await board(0).hand(P1, FILLER, "fodder").deck(P1, [SMDR, FILLER, FILLER], ["smdr", "d1", "d2"]).build();
    await milled.p1.move("raider", "bf1");
    const r = await milled.settle();
    expect(milled.p1.trash()).toEqual(["smdr", "d1"]);
    expect(r.reason).toBe("open");
    expect(milled.decision()?.kind).toBe("action");
    expect(milled.p1.hand()).toEqual(["fodder"]);

    const already = await board(3).hand(P1, FILLER, "fodder").trash(P1, SMDR, "smdr").build();
    await already.p1.move("raider", "bf1");
    const r2 = await already.settle();
    expect(r2.reason).toBe("unanswered");
    expect(already.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  });
});
