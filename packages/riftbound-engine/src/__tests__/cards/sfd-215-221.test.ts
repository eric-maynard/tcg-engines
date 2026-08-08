/**
 * Ravenbloom Conservatory — sfd-215-221 · Battlefield
 *
 *   When you defend here, reveal the top card of your Main Deck. If it's a spell, put it in
 *   your hand. Otherwise, recycle it.
 *
 * Rules: 190.6.d ("you" = the battlefield's controller); 383.4.f (Defend Trigger, once per combat,
 * 383.4.f.2.a); 464.2.e (goes on the Combat Chain, defender's item last-in/first-out); reveal =
 * show the card, exactly ONE card ("the top card"); recycle (Game Actions) = put on the BOTTOM of
 * its Main Deck; not a draw → an empty Main Deck reveals nothing and causes no Burn Out (431 is
 * only for drawing).
 *
 * Head-judge corner cases for THIS card:
 *   1. Top card is a spell → it moves to the controller's hand (deck −1, hand +1, that exact card).
 *   2. Top card is a unit/gear → it is RECYCLED: same deck size, that card is now the bottom card,
 *      the old second card is the new top; hand unchanged.
 *   3. Exactly one card is revealed: unit on top with a spell right under it → the spell is NOT dug
 *      out; it simply becomes the new top card.
 *   4. "here": defending at a DIFFERENT battlefield I control must not trigger the Conservatory.
 *   5. "you": only the defender/controller's deck is touched — the attacker's deck and hand are not.
 *   6. Empty Main Deck: trigger resolves harmlessly (no burn-out, game continues, combat resolves).
 *   7. Mirror seat: P1 controls it, P2 attacks on P2's turn → P1 reveals.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-215-221";
const CLEAVE = "ogn-004-298"; // spell
const SKULKER = "ogn-175-298"; // unit
const FILLERS = 10;

/** P2 controls the Conservatory with a 2-Might defender; P1 has a 3-Might attacker; P2's deck top-first. */
function board(deckTopFirst: string[], aliases: string[]) {
  return scenario()
    .battlefield("rc", { controller: P2, def: CARD, inert: false, owner: P2 })
    .unit(P2, "rc", { might: 2, name: "Gardener" }, "def")
    .unit(P1, "base", { might: 3, name: "Raider" }, "atk")
    .deck(P2, deckTopFirst, aliases);
}

describe("Ravenbloom Conservatory (sfd-215-221)", () => {
  test("registry payload: a Defend Trigger for the controller that reveals ONE card from the deck, spell → hand, else recycle — and it should be scoped to 'here'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Ravenbloom Conservatory" });
    const abilities = (def?.abilities ?? []) as { type: string; trigger?: Record<string, unknown>; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { amount: 1, from: "deck", type: "reveal" },
      trigger: { event: "defend", on: "controller" },
      type: "triggered",
    });
  });

  test("the parsed trigger has no `location: \"here\"` — printed text is 'When you defend HERE'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    const trigger = (def?.abilities?.[0] as { trigger?: Record<string, unknown> } | undefined)?.trigger;
    expect(trigger).toMatchObject({ event: "defend", location: "here", on: "controller" });
  });

  test("P1 attacks the Conservatory → one triggered item controlled by P2 (the defender) goes on the chain; nothing is asked (no choice to make)", async () => {
    const game = await board([CLEAVE], ["topSpell"]).build();
    await game.p1.move("atk", "rc");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "rc", controller: P2, name: "Ravenbloom Conservatory", triggered: true }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.hand()).toEqual([]); // not yet resolved
  });

  test("top card is a SPELL → it is put into the controller's hand (that exact card); deck shrinks by one; then combat resolves normally", async () => {
    const game = await board([CLEAVE, SKULKER], ["topSpell", "second"]).build();
    expect(game.p2.deck()[0]).toBe("topSpell");
    const deck0 = game.p2.deck().length;
    await game.p1.move("atk", "rc");
    await game.p2.passPriority();
    await game.p1.passPriority(); // trigger resolves, showdown still open
    expect(game.p2.hand()).toEqual(["topSpell"]);
    expect(game.zoneOf("topSpell")).toBe("hand");
    expect(game.p2.deck()).toHaveLength(deck0 - 1);
    expect(game.p2.deck()[0]).toBe("second");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash"); // 3 vs 2 — the battlefield grants no Might
    expect(game.gameState.battlefields.rc?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("a non-spell top card is not recycled — 'Otherwise, recycle it' should put the unit on the BOTTOM of the Main Deck (same size, new top = old second card)", async () => {
    // Expected: deck [unit, spell, f2..f9] → [spell, f2..f9, unit]; hand unchanged.
    // Actual: the revealed unit is left on top of the deck.
    const game = await board([SKULKER, CLEAVE], ["topUnit", "second"]).build();
    const deck0 = game.p2.deck().length;
    await game.p1.move("atk", "rc");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck()).toHaveLength(deck0);
    expect(game.p2.deck()[0]).toBe("second");
    expect(game.p2.deck().at(-1)).toBe("topUnit");
    expect(game.zoneOf("topUnit")).toBe("mainDeck");
  });

  test("exactly ONE card is revealed: unit on top with a spell directly under it → the spell is not dug out and nothing reaches the hand", async () => {
    const game = await board([SKULKER, CLEAVE], ["topUnit", "buriedSpell"]).build();
    await game.p1.move("atk", "rc");
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p2.hand()).toEqual([]);
    expect(game.zoneOf("buriedSpell")).toBe("mainDeck");
    expect(game.zoneOf("topUnit")).toBe("mainDeck");
    expect(game.p2.deck()).toHaveLength(2 + (FILLERS - 2));
  });

  test("'you' = the defender: the ATTACKER's deck and hand are untouched even when the attacker's top card is a spell", async () => {
    const game = await board([SKULKER], ["p2top"]).deck(P1, [CLEAVE], ["p1top"]).build();
    const p1deck0 = game.p1.deck().length;
    await game.p1.move("atk", "rc");
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(p1deck0);
    expect(game.p1.deck()[0]).toBe("p1top");
  });

  test("'here' — defending at a DIFFERENT battlefield I control must not trigger the Conservatory (no chain item, no reveal)", async () => {
    // Expected: attacking bf2 leaves the Conservatory silent. Actual: the trigger has no location
    // scope, so any defend by its controller fires it and the top spell lands in P2's hand.
    const game = await scenario()
      .battlefield("rc", { controller: P2, def: CARD, inert: false, owner: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "rc", { might: 2, name: "Gardener" }, "def")
      .unit(P2, "bf2", { might: 2, name: "Outrider" }, "def2")
      .unit(P1, "base", { might: 3, name: "Raider" }, "atk")
      .deck(P2, [CLEAVE], ["topSpell"])
      .build();
    await game.p1.move("atk", "bf2");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.p2.hand()).toEqual([]);
    expect(game.zoneOf("topSpell")).toBe("mainDeck");
  });

  test("negative space: walking onto an EMPTY uncontrolled Conservatory is no combat → no reveal for anyone", async () => {
    const game = await scenario()
      .battlefield("rc", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 3, name: "Raider" }, "atk")
      .deck(P1, [CLEAVE], ["p1top"])
      .deck(P2, [CLEAVE], ["p2top"])
      .build();
    await game.p1.move("atk", "rc");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.gameState.battlefields.rc?.controller).toBe(P1);
  });

  test("383.4.f.2.a once per combat: two defenders here → exactly one Conservatory trigger, one card revealed", async () => {
    const game = await scenario()
      .battlefield("rc", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "rc", { might: 1, name: "G1" }, "g1")
      .unit(P2, "rc", { might: 1, name: "G2" }, "g2")
      .unit(P1, "base", { might: 3, name: "Raider" }, "atk")
      .deck(P2, [CLEAVE, CLEAVE], ["s1", "s2"])
      .build();
    await game.p1.move("atk", "rc");
    expect(game.chain()).toHaveLength(1);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p2.hand()).toEqual(["s1"]);
    expect(game.zoneOf("s2")).toBe("mainDeck");
  });

  test("empty Main Deck: the trigger resolves harmlessly — no burn-out, nothing in hand, combat still resolves and the game goes on", async () => {
    const game = await scenario()
      .fillDecks(false)
      .battlefield("rc", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "rc", { might: 2, name: "Gardener" }, "def")
      .unit(P1, "base", { might: 3, name: "Raider" }, "atk")
      .build();
    expect(game.p2.deck()).toEqual([]);
    await game.p1.move("atk", "rc");
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.isOver()).toBe(false);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p1.points()).toBe(1); // conquered; no burn-out point handed around
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("def")).toBe("trash");
  });

  test("mirror seat: P1 controls the Conservatory, P2 attacks on P2's turn → P1 is 'you' and P1's top spell goes to P1's hand", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("rc", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P1, "rc", { might: 4, name: "Warden" }, "warden")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .deck(P1, [CLEAVE], ["p1top"])
      .deck(P2, [CLEAVE], ["p2top"])
      .build();
    await game.p2.move("raider", "rc");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rc", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.zoneOf("raider")).toBe("trash"); // 3 into 4
    expect(game.gameState.battlefields.rc?.controller).toBe(P1);
  });
});
