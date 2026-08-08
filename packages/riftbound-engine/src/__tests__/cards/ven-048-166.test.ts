/**
 * Cloud Drake — ven-048-166 · Unit · Mind · 6 energy · 5 Might
 *
 *   When you play me, draw 1.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - A Play Effect (383.4.a): the unit is finalized and ENTERS THE BOARD first, then the trigger is
 *    put on the chain (383.4.a.2). So the Drake is already in play (exhausted, 143.4) while the draw
 *    is still pending, and the opponent receives priority before the card is drawn.
 *  - Only PLAYING it counts: a Drake placed/moved/already on the board draws nothing; moving it to a
 *    battlefield is not a play.
 *  - Played to a battlefield you control (a legal play destination) it still draws.
 *  - "Draw 1" takes exactly the top card of the Main Deck — deck shrinks by one, hand grows by one,
 *    the second card becomes the new top.
 *  - Empty Main Deck (431 Burn Out): recycle trash into the deck, an opponent gains 1 point, THEN
 *    draw 1 (431.2.d) — the draw is completed, not lost.
 *  - Cost 6, no power pip; 5 energy is one short.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-048-166";
const UNIT = "ogn-175-298"; // Shipyard Skulker — deck fodder with a known identity
const SPELL = "ogn-004-298"; // Cleave

function ready() {
  return scenario()
    .resources(P1, { energy: 6 })
    .hand(P1, CARD, "drake")
    .deck(P1, [UNIT, SPELL, UNIT], ["top", "d2", "d3"]);
}

describe("Cloud Drake (ven-048-166)", () => {
  test("cost: 6 energy, no power; enters the base exhausted as a 5-Might unit; 5 energy is not enough", async () => {
    const game = await ready().build();
    await game.p1.play("drake");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.state("drake")).toMatchObject({ baseMight: 5, isExhausted: true, might: 5 });
    const poor = await scenario().resources(P1, { energy: 5, power: { mind: 3 } }).hand(P1, CARD, "drake").build();
    expect(poor.p1.can("play", "drake")).toBe(false);
  });

  test("383.4.a.2: the Drake is on the board and its play trigger sits on the chain BEFORE any card is drawn", async () => {
    const game = await ready().build();
    await game.p1.play("drake");
    expect(game.zoneOf("drake")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "drake", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("top")).toBe("mainDeck");
  });

  test("when the trigger resolves P1 draws exactly the TOP card; the deck shrinks by one and d2 is the new top", async () => {
    const game = await ready().build();
    const size = game.p1.deck().length;
    await game.p1.play("drake");
    await game.settle();
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p1.deck()).toHaveLength(size - 1);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.chain()).toHaveLength(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.hand()).toEqual([]); // "you" draw, not the opponent
  });

  test("the opponent gets priority on the play trigger before the draw happens", async () => {
    const game = await ready().build();
    await game.p1.play("drake");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.hand()).toEqual([]);
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["top"]);
  });

  test("played to a battlefield you control: still a play, still draws 1", async () => {
    const game = await ready().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 1, name: "Flag" }, "flag").build();
    await game.p1.play("drake", { to: "bf1" });
    expect(game.locationOf("drake")).toBe("bf1");
    await game.settle();
    expect(game.p1.hand()).toEqual(["top"]);
  });

  test("negative space — a Drake that MOVES (already on the board) is not being played: no trigger, no draw", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "drake")
      .deck(P1, [UNIT], ["top"])
      .build();
    await game.p1.move("drake", "bf1");
    expect(game.chain()).toHaveLength(0);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("negative space — across a whole turn cycle a Drake sitting on the board never draws extra (only the draw-phase card)", async () => {
    const game = await scenario().unit(P1, "base", CARD, "drake").build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: draw phase only
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("two Drakes played one after another draw one card each (2 total), in deck order", async () => {
    const game = await ready().resources(P1, { energy: 12 }).hand(P1, CARD, "drake2").build();
    await game.p1.play("drake");
    await game.settle();
    await game.p1.play("drake2");
    await game.settle();
    expect(game.p1.hand()).toEqual(["top", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.p1.energy()).toBe(0);
  });

  test("431 Burn Out: with an EMPTY Main Deck the draw recycles the trash into the deck, the opponent gains 1 point, and P1 still draws 1", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 6 })
      .hand(P1, CARD, "drake")
      .trash(P1, UNIT, "t1")
      .trash(P1, SPELL, "t2")
      .build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p2.points()).toBe(0);
    await game.p1.play("drake");
    await game.settle({ policy: "first" }); // "choose an opponent" has a single candidate
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(1);
    expect(["t1", "t2"]).toContain(game.p1.hand()[0] as string);
    expect(game.p1.deck()).toHaveLength(1);
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("drake")).toBe("base");
  });

  test("parsed abilities match the printed text: exactly one play-self trigger whose whole effect is draw 1 (not optional)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 6, might: 5 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as Record<string, unknown>;
    expect(ab).toMatchObject({ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" });
    expect(ab.optional).not.toBe(true);
    expect(ab.condition).toBeUndefined();
  });
});
