/**
 * Shadow Temple — ven-165-166 · Battlefield · no domain · no cost
 *
 *   When you hold here, [Burn 3]. (Put the top 3 cards of your Main Deck into your trash.)
 *
 * Rules: 469.2 / 315.2.b (Hold = keep control of a battlefield during YOUR Beginning Phase's Scoring
 * Step; worth 1 point), 471.2.b ("hold here" abilities trigger at the battlefield that was Held —
 * once per battlefield per turn, 471.2.c), 383.4.d (a Hold effect is a triggered ability → a chain
 * item; nothing is burned while it is pending), 190.6.d ("you"/"your Main Deck" = the Temple's
 * CONTROLLER, i.e. the holder — the card's owner is irrelevant; uncontrolled → nobody), 440 (Burn X =
 * top X of Main Deck → trash, in order; it is mandatory, not "may"), 440.4 + 431 (burning past the end
 * of the deck: burn what is there, Burn Out — recycle trash into deck, an opponent gains 1 point —
 * then burn the rest), 315.4 (the Draw Phase comes AFTER, so the drawn card is the 4th card down).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Exact cards and order: with a known deck d1..d4 the trash receives d1, d2, d3 and the Draw
 *     Phase hands over d4 — the burn resolves before Channel/Draw.
 *  2. Not optional: there is no prompt; the controller cannot decline milling themselves.
 *  3. Controller ≠ owner: P2 squatting on P1's Temple burns P2's deck on P2's turn; P1's is untouched.
 *  4. Negative space: CONQUERING the Temple burns nothing; the opponent's Beginning Phase burns
 *     nothing; holding a different battlefield while the Temple is uncontrolled or enemy-held burns
 *     nothing.
 *  5. "here" = once: holding the Temple AND another battlefield burns exactly 3, not 6.
 *  6. Deck of 2 (440.4): burn 2 → Burn Out (trash recycled into the deck, opponent +1 point) → burn 1
 *     more → then draw 1: the holder nets +1/-0 but hands the opponent a point.
 *  7. It keeps costing: two of your turns on the Temple = 6 cards burned for 2 points.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-165-166";
const FILLER = "ogn-175-298"; // vanilla 3-Might unit used as known deck cards

/** P2 is about to end turn 2; P1 controls the Temple with a sitter; P1's deck is d1..d4 on top of filler. */
function aboutToHold() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("temple", { controller: P1, def: CARD, inert: false, owner: P2 })
    .unit(P1, "temple", { might: 3, name: "Sitter" }, "sitter")
    .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"]);
}

describe("Shadow Temple (ven-165-166)", () => {
  test("registry payload: a battlefield with exactly one NON-optional 'hold here (controller)' trigger that mills 3 from your own deck", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Shadow Temple" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 3, player: "self", type: "mill" },
        trigger: { event: "hold", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
    expect((def?.abilities?.[0] as { optional?: boolean }).optional).not.toBe(true);
  });

  test("holding it: 1 point, ONE triggered item controlled by P1 with the trash still empty while pending; after it resolves d1-d3 are in the trash (in order) and the Draw Phase gives d4", async () => {
    const game = await aboutToHold().build();
    expect(game.p1.deck().slice(0, 4)).toEqual(["d1", "d2", "d3", "d4"]);
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1); // scored first; the effect triggers off the hold (383.4.d.2.b)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "temple", controller: P1, name: "Shadow Temple", triggered: true })]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // a priority window, not a yes/no
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.trash()).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.hand()).toEqual(["d4"]);
    expect(game.p1.deck()).toHaveLength(10 - 3 - 1);
    expect(game.p2.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("not optional (440.3.a): the controller is never offered a yes/no — with a strict empty script the turn still settles and 3 cards are burned", async () => {
    const game = await aboutToHold().script(P1, [], { strict: true }).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.trash()).toHaveLength(3);
  });

  test("controller ≠ owner (190.6.d): P2 holding a Temple that P1 owns burns 3 from P2's deck on P2's turn; P1's deck and trash are untouched", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("temple", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "temple", { might: 3, name: "Squatter" }, "squatter")
      .build();
    const p1Deck = game.p1.deck().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p2.trash()).toHaveLength(3);
    expect(game.p2.hand()).toHaveLength(1);
    expect(game.p1.trash()).toHaveLength(0);
    expect(game.p1.deck()).toHaveLength(p1Deck);
  });

  test("negative space — only YOUR hold: across the opponent's Beginning Phase the Temple's controller burns nothing and scores nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("temple", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "temple", { might: 3 }, "sitter")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.trash()).toHaveLength(0);
    expect(game.p2.trash()).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
  });

  test("negative space — CONQUERING the Temple (walk onto it empty) scores 1 but burns nothing and raises no item", async () => {
    const game = await scenario()
      .battlefield("temple", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
      .build();
    await game.p1.move("walker", "temple");
    await game.settle();
    await game.settle();
    expect(game.gameState.battlefields.temple?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  // BUG — expected (190.6.d: an uncontrolled battlefield's "you" is no one; 471.2.b: only the HELD
  // battlefield's hold abilities trigger): P1 holds bf2 only → 1 point, nothing burned, no item. Actual: a
  // "Shadow Temple" item controlled by P1 (the card's owner) goes on the chain and P1 burns 3.
  test("an UNCONTROLLED Temple owned by the turn player triggers when that player holds a DIFFERENT battlefield (190.6.d / 471.2.b)", async () => {
    const uncontrolled = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("temple", { controller: null, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2 }, "other")
      .build();
    await uncontrolled.p2.endTurn();
    expect(uncontrolled.chain()).toEqual([]);
    await uncontrolled.settle();
    expect(uncontrolled.p1.points()).toBe(1);
    expect(uncontrolled.p1.trash()).toHaveLength(0);
  });

  test("negative space — 'here': P1 holds a DIFFERENT battlefield while P2 controls the Temple → P1 scores 1 and burns nothing; P2 burns nothing", async () => {
    const enemyHeld = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("temple", { controller: P2, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "temple", { might: 2 }, "squatter")
      .unit(P1, "bf2", { might: 2 }, "other")
      .build();
    await enemyHeld.p2.endTurn();
    expect(enemyHeld.chain()).toEqual([]);
    await enemyHeld.settle();
    expect(enemyHeld.p1.points()).toBe(1);
    expect(enemyHeld.p1.trash()).toHaveLength(0);
    expect(enemyHeld.p2.trash()).toHaveLength(0);
  });

  // BUG — expected (471.2.b/c: hold abilities trigger at the battlefield that was Held, once): holding the
  // Temple AND a plain bf2 = 2 points and ONE Temple item → exactly 3 cards burned. Actual: two "Shadow
  // Temple" items go on the chain (one per battlefield held) and 6 cards are burned.
  test("'When you hold HERE' fires once per battlefield held — Temple + another battlefield burns 6 instead of 3 (471.2.b)", async () => {
    const game = await aboutToHold().battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2, name: "Other" }, "other").build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.cardId === "temple")).toHaveLength(1);
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.p1.trash()).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.hand()).toEqual(["d4"]);
  });

  test("Burn past the end of the deck (440.4 / 431.2): 2-card deck + 3-card trash → burn 2, Burn Out (trash recycled into the deck, P2 gains 1 point), burn 1 more, then draw 1", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("temple", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "temple", { might: 3, name: "Sitter" }, "sitter")
      .fillDecks({ main: 2, runes: 12 })
      .deck(P1, [FILLER, FILLER], ["a", "b"])
      .trash(P1, FILLER, "x")
      .trash(P1, FILLER, "y")
      .trash(P1, FILLER, "z")
      .build();
    expect(game.p1.deck()).toEqual(["a", "b"]);
    expect(game.p1.trash()).toEqual(["x", "y", "z"]);
    await game.advanceTurn({ policy: "first" }); // 431.2.c — "choose an opponent" is forced with one opponent
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1); // the hold
    expect(game.p2.points()).toBe(1); // the Burn Out
    // 5 cards total: 1 in trash (the post-Burn-Out burn), 1 in hand (draw phase), 3 left in the deck.
    expect(game.p1.trash()).toHaveLength(1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(3);
    expect([...game.p1.trash(), ...game.p1.hand(), ...game.p1.deck()].sort()).toEqual(["a", "b", "x", "y", "z"]);
    expect(game.isOver()).toBe(false);
  });

  test("responding window: the opponent gets priority on the pending burn; nothing is milled until both pass", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p1.trash()).toEqual([]);
    await game.p2.passPriority();
    expect(game.p1.trash()).toEqual(["d1", "d2", "d3"]);
    await game.settle();
    expect(game.phase()).toBe("main");
  });

  test("multi-turn: it keeps costing — after two of P1's turns on the Temple P1 has 2 points and 6 burned cards (plus 2 drawn)", async () => {
    const game = await aboutToHold().build();
    await game.advanceTurn(); // P1: hold → 1 pt, burn 3, draw 1
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1: hold → 2 pts, burn 3 more, draw 1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.p1.trash()).toHaveLength(6);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.deck()).toHaveLength(10 - 6 - 2);
    expect(game.locationOf("sitter")).toBe("temple");
  });

  test("inert control: the same hold on an abilities-stripped Temple scores 1 and burns nothing (so every milled card above came from the printed trigger)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("temple", { controller: P1, def: CARD, inert: true, owner: P2 })
      .unit(P1, "temple", { might: 3 }, "sitter")
      .build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toHaveLength(0);
    expect(game.p1.hand()).toHaveLength(1);
  });
});
