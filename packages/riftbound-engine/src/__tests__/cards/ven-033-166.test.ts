/**
 * Pakaa Protector — ven-033-166 · Unit · Calm · 5 energy · 4 Might
 *
 *   When I move, reveal the top card of your Main Deck. If it's a unit, draw it.
 *   Otherwise, put it in your trash and give me +2 [Might] this turn.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - "When I move" fires on ANY move of this unit (base → battlefield, battlefield → base, or
 *    battlefield → battlefield); other units' moves and enemy moves are irrelevant. Moves do not use
 *    the chain but the trigger does, and a staged combat only opens once the chain is empty (460)
 *    — so on an attack the reveal (and a possible +2) lands BEFORE combat damage: a 4-Might
 *    Protector that flips a non-unit swings for 6 and beats a 5-Might defender it would otherwise
 *    lose to.
 *  - Exactly ONE card is revealed (424: shown to everyone, stays put until moved). Unit → drawn to
 *    hand (deck shrinks by one, next card is the new top). Non-unit (spell, gear, …) → that card goes
 *    to the TRASH (not recycled, not banished) AND the Protector gets +2 Might this turn. The two
 *    branches are exclusive: drawing a unit gives no Might; trashing gives no card.
 *  - "+2 [Might] this turn" expires in the Expiration Step.
 *  - Empty Main Deck: nothing to reveal → neither branch happens (no Might, no crash).
 *  - Sibling: Apprentice Smith (sfd-041-221) is the same template keyed on gear/recycle.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-033-166";
const UNIT = "ogn-175-298"; // Shipyard Skulker — a plain unit
const SPELL = "ogn-004-298"; // Cleave — a spell
const GEAR = "ogn-120-298"; // Seal of Insight — a gear

/** Protector in P1's base, an open battlefield, P1's deck = [top, d2, d3, …filler]. */
function board(top: string) {
  return scenario()
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", CARD, "pakaa")
    .unit(P1, "base", { might: 2, name: "Other" }, "other")
    .deck(P1, [top, UNIT, UNIT], ["top", "d2", "d3"]);
}

describe("Pakaa Protector (ven-033-166)", () => {
  test("cost: 5 energy, no power; 4 Might, enters exhausted, no play trigger; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "pakaa").build();
    await game.p1.play("pakaa");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("pakaa")).toBe("base");
    expect(game.state("pakaa")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.chain()).toHaveLength(0); // playing is not moving
    expect((await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "pakaa").build()).p1.can("play", "pakaa")).toBe(false);
  });

  test("moving to a battlefield puts the move trigger on the chain under P1's control; the opponent gets priority before it resolves", async () => {
    const game = await board(UNIT).build();
    await game.p1.move("pakaa", "bf1");
    expect(game.locationOf("pakaa")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pakaa", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.zoneOf("top")).toBe("mainDeck"); // nothing revealed/drawn yet
  });

  test("a UNIT on top is drawn into hand; the deck's next card becomes the top; no Might change (effect parsed as raw no-op)", async () => {
    // Expected: "top" (Shipyard Skulker) → P1's hand, d2 now on top, Protector still 4 Might.
    // Actual: the ability's effect is `{type:"raw"}` so resolution does nothing.
    const game = await board(UNIT).build();
    const size = game.p1.deck().length;
    await game.p1.move("pakaa", "bf1");
    await game.settle();
    expect(game.zoneOf("top")).toBe("hand");
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p1.deck()).toHaveLength(size - 1);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.state("pakaa").might).toBe(4);
    expect(game.p1.trash()).toEqual([]);
  });

  test("a SPELL on top goes to the trash and the Protector gets +2 Might this turn (6); hand stays empty", async () => {
    // Expected: "top" (Cleave) → trash, Protector 6 Might, nothing drawn. Actual: raw no-op.
    const game = await board(SPELL).build();
    await game.p1.move("pakaa", "bf1");
    await game.settle();
    expect(game.zoneOf("top")).toBe("trash");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.state("pakaa")).toMatchObject({ baseMight: 4, isBuffed: false, might: 6 });
  });

  test("a GEAR is 'otherwise' too — trashed (not recycled, not banished) and +2 Might", async () => {
    // Expected: gear → trash (bottom of deck untouched), Protector 6. Actual: raw no-op.
    const game = await board(GEAR).build();
    await game.p1.move("pakaa", "bf1");
    await game.settle();
    expect(game.zoneOf("top")).toBe("trash");
    const deck = game.p1.deck();
    expect(deck[0]).toBe("d2");
    expect(deck[deck.length - 1]).not.toBe("top");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.state("pakaa").might).toBe(6);
  });

  test("'this turn' — the +2 from a trashed non-unit is gone after the turn ends (6 → 4)", async () => {
    // Expected: 6 during P1's turn, 4 on P2's turn. Actual: never reaches 6 (raw no-op).
    const game = await board(SPELL).build();
    await game.p1.move("pakaa", "bf1");
    await game.settle();
    expect(game.state("pakaa").might).toBe(6);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("pakaa").might).toBe(4);
    expect(game.zoneOf("top")).toBe("trash"); // the trashed card stays trashed
  });

  test("460 — on an attack the trigger resolves before combat: flipping a non-unit makes it 6 and it beats a 5-Might defender", async () => {
    // Expected: chain first (context "chain"), then showdown; Protector 6 kills the 5, survives
    // with 5 damage < 6, conquers. Actual: stays 4, dies to the defender.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "pakaa")
      .deck(P1, [SPELL, UNIT], ["top", "d2"])
      .build();
    await game.p1.move("pakaa", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("chain");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("pakaa").might).toBe(6);
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("pakaa")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space: the same attack when the top card is a UNIT — no Might bonus, the 4-Might Protector loses to the 5-Might wall", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "pakaa")
      .deck(P1, [UNIT, UNIT], ["top", "d2"])
      .build();
    await game.p1.move("pakaa", "bf1");
    await game.settle();
    expect(game.zoneOf("pakaa")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("moving battlefield → BASE is also 'When I move': the trigger goes on the chain again", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "pakaa")
      .deck(P1, [UNIT, UNIT], ["top", "d2"])
      .build();
    await game.p1.move("pakaa", "base");
    expect(game.locationOf("pakaa")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pakaa", triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative space: ANOTHER friendly unit moving, or an ENEMY unit moving, reveals nothing and triggers nothing", async () => {
    const game = await board(UNIT).build();
    await game.p1.move("other", "bf1");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("pakaa").might).toBe(4);

    const enemy = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "pakaa")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .deck(P1, [SPELL], ["top"])
      .build();
    await enemy.p2.move("foe", "bf1");
    expect(enemy.chain()).toHaveLength(0);
    await enemy.settle();
    expect(enemy.zoneOf("top")).toBe("mainDeck");
    expect(enemy.state("pakaa").might).toBe(4);
  });

  test("empty Main Deck: the trigger still goes on the chain but there is nothing to reveal — no card moves, no Might, no dangling prompt", async () => {
    const game = await scenario()
      .fillDecks(false)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "pakaa")
      .build();
    expect(game.p1.deck()).toEqual([]);
    await game.p1.move("pakaa", "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.state("pakaa").might).toBe(4);
    expect(game.isOver()).toBe(false);
  });

  test("parsed abilities match the printed text — a self move trigger whose effect is a structured 1-card reveal (unit → draw; else → trash + modify-might +2 turn), not a raw string", async () => {
    // Expected: a machine-readable effect tree. Actual: `{type:"raw", text:"reveal the top card …"}`.
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 5, might: 4 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; trigger: unknown; effect: { type: string } };
    expect(ab).toMatchObject({ trigger: { event: "move", on: "self" }, type: "triggered" });
    expect(ab.effect.type).not.toBe("raw");
    const json = JSON.stringify(ab.effect);
    expect(json).toMatch(/"reveal"/);
    expect(json).toMatch(/"unit"/);
    expect(json).toMatch(/trash|discard/);
    expect(json).toMatch(/"modify-might"/);
    expect(json).toMatch(/"amount":2/);
    expect(json).toMatch(/"duration":"turn"/);
  });
});
