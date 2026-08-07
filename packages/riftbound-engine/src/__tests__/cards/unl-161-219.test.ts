/**
 * Divining Shells — unl-161-219 · Gear · Order · 2 energy (no power)
 *
 *   [Vision] (When you play this, look at the top card of your Main Deck. You may recycle it.)
 *   [Action][>] Kill this, [Exhaust]: Give a unit +2 [Might] this turn.
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. Vision (817) on a GEAR: one triggered "when this is played, Predict" — exactly ONE prompt even
 *      though the payload carries both the keyword and its expanded triggered sibling; recycling puts
 *      the card on the BOTTOM (436), declining leaves it on top; an empty deck predicts nothing and
 *      does not Burn Out (436.4.a); only YOUR deck is looked at.
 *   2. Gear enters READY (359.2.d) → the [Action] ability is usable the turn it lands: play → Vision
 *      → activate → +2, all for [2].
 *   3. Both costs are paid up front: Shells is EXHAUSTED-then-KILLED (in the trash) while the +2 sits
 *      on the chain; the effect still resolves. An already-exhausted Shells cannot pay [Exhaust].
 *   4. [Action] timing (806.1.c.2): your open main phase — yes; while YOU hold Focus in a showdown on
 *      the opponent's turn — yes (and the +2 flips the combat); the opponent's open main phase — no;
 *      in response on a chain (Closed state) — no, it is not [Reaction].
 *   5. "a unit": friendly or enemy, base or battlefield; +2 is a modifier (not a buff) and expires
 *      with the turn. With no unit on the board the ability cannot be played (no legal target).
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-161-219";
const FILLER = "ogn-175-298"; // vanilla 3-Might unit used as a known deck card

function inHand(energy = 2) {
  return scenario().resources(P1, { energy }).hand(P1, CARD, "shells").deckTop(P1, FILLER, "top").unit(P1, "base", { might: 2, name: "Ally" }, "ally");
}

function onBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .gear(P1, CARD, "shells")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "bf1", { might: 4, name: "Foe" }, "foe");
}

describe("Divining Shells (unl-161-219)", () => {
  test("registry payload: Vision keyword and an [Action] activated ability costing exhaust + kill-self for +2 Might (turn) to a unit", async () => {
    const game = await scenario().hand(P1, CARD, "shells").build();
    expect(game.state("shells")).toMatchObject({ cardType: "gear", energyCost: 2, name: "Divining Shells" });
    expect(game.state("shells").powerCost).toEqual([]);
    const abilities = peekDefaultCardPool()?.get(CARD)?.abilities as Record<string, unknown>[];
    expect(abilities[0]).toEqual({ effect: { amount: 1, from: "deck", then: { recycle: 1 }, type: "look" }, keyword: "Vision", type: "keyword" });
    const activated = abilities.find((a) => a.type === "activated");
    expect(activated).toEqual({
      cost: { exhaust: true, kill: "self" },
      effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      timing: "action",
      type: "activated",
    });
    // Whatever the expansion, there must be exactly one thing that fires on play (817.2 counts
    // instances): the printed [Vision] keyword ability is itself that one thing — the engine
    // synthesises its play-self trigger — so no separate `triggered` sibling may sit beside it.
    expect(
      abilities.filter((a) => a.type === "triggered" || (a.type === "keyword" && a.keyword === "Vision")),
    ).toHaveLength(1);
  });

  test("cost: 2 energy, no power; lands in base READY (359.2.d); 1 energy is not enough", async () => {
    const game = await inHand(2).build();
    await game.p1.play("shells");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("shells")).toBe("base");
    expect(game.state("shells").isReady).toBe(true);
    const poor = await inHand(1).build();
    expect(poor.p1.can("play", "shells")).toBe(false);
  });

  test("Vision: exactly one prompt showing the top card; recycling sends it to the BOTTOM of the deck, nothing is drawn", async () => {
    const game = await inHand().build();
    expect(game.p1.deck()[0]).toBe("top");
    await game.p1.play("shells");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shells", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key)).toEqual(["top"]);
    await game.p1.pick("top");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).not.toBe("top");
    expect(deck.at(-1)).toBe("top");
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 }); // no second Vision prompt
  });

  test("Vision: declining leaves the card on top; the opponent's deck is never looked at", async () => {
    const game = await inHand().deckTop(P2, FILLER, "theirTop").build();
    await game.p1.play("shells");
    await game.settle();
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.p2.deck()[0]).toBe("theirTop");
    expect(game.decision()?.kind).toBe("action");
  });

  test("Vision with an EMPTY Main Deck: nothing to predict, no Burn Out (436.4.a) — the gear simply lands", async () => {
    const game = await scenario().fillDecks({ main: 0, runes: 12 }).resources(P1, { energy: 2 }).hand(P1, CARD, "shells").build();
    expect(game.p1.deck()).toEqual([]);
    const pointsBefore = game.p2.points();
    await game.p1.play("shells");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("shells")).toBe("base");
    expect(game.p2.points()).toBe(pointsBefore);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("activated: exhaust + kill are paid up front (Shells is in the trash while the ability is on the chain), then the chosen unit gets +2 Might this turn — a modifier, not a buff", async () => {
    const game = await onBoard().build();
    expect(game.p1.can("activate", "shells")).toBe(true);
    await game.p1.activate("shells", undefined, { targets: "ally" });
    expect(game.zoneOf("shells")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "shells", controller: P1, triggered: false })]);
    expect(game.state("ally").might).toBe(2); // not resolved yet
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.state("ally")).toMatchObject({ baseMight: 2, isBuffed: false, might: 4 });
    expect(game.p1.gear()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // no resource cost at all
    expect(game.violations()).toEqual([]);
  });

  test("'a unit': an ENEMY unit at a battlefield is a legal recipient too", async () => {
    const game = await onBoard().build();
    await game.p1.activate("shells", undefined, { targets: "foe" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("foe");
      await game.settle();
    }
    expect(game.state("foe").might).toBe(6);
    expect(game.state("ally").might).toBe(2);
  });

  test("'this turn': the +2 is gone after the turn ends; Shells stays in the trash", async () => {
    const game = await onBoard().build();
    await game.p1.activate("shells", undefined, { targets: "ally" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(2);
    expect(game.state("ally").mightModifier).toBe(0);
    expect(game.zoneOf("shells")).toBe("trash");
  });

  test("full line for [2] in one turn: play → Vision (decline) → activate immediately (entered ready) → +2", async () => {
    const game = await inHand(2).build();
    await game.p1.play("shells");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.can("activate", "shells")).toBe(true);
    await game.p1.activate("shells", undefined, { targets: "ally" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("ally");
      await game.settle();
    }
    expect(game.state("ally").might).toBe(4);
    expect(game.zoneOf("shells")).toBe("trash");
  });

  test("cost negative space: an EXHAUSTED Shells cannot pay [Exhaust] — not activatable, nothing is killed", async () => {
    const game = await scenario().gear(P1, CARD, "shells", { exhausted: true }).unit(P1, "base", { might: 2 }, "ally").build();
    expect(game.state("shells").isExhausted).toBe(true);
    expect(game.p1.can("activate", "shells")).toBe(false);
    const r = await game.p1.try((p) => p.activate("shells", 2, { targets: "ally" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("shells")).toBe("base");
    expect(game.state("ally").might).toBe(2);
  });

  test("no unit anywhere on the board → no legal target, so the ability cannot be played and Shells is not sacrificed", async () => {
    const game = await scenario().gear(P1, CARD, "shells").build();
    expect(game.p1.can("activate", "shells")).toBe(false);
    expect(game.zoneOf("shells")).toBe("base");
    expect(game.state("shells").isReady).toBe(true);
  });

  test("[Action] timing: not in the opponent's open main phase; not in response on a chain during your own turn (it is not [Reaction])", async () => {
    const oppTurn = await onBoard().active(P2).build();
    expect(oppTurn.p1.can("activate", "shells")).toBe(false);
    expect((await oppTurn.p1.try((p) => p.activate("shells", 2, { targets: "ally" }))).ok).toBe(false);
    expect(oppTurn.zoneOf("shells")).toBe("base");
    // Own turn, but a chain is open (a second Shells' Vision trigger pending) → Closed state.
    const closed = await onBoard().resources(P1, { energy: 2 }).hand(P1, CARD, "second").build();
    await closed.p1.play("second");
    expect(closed.chain()).toHaveLength(1);
    expect((closed.decision() as ActionDecision).context).toBe("chain");
    expect(closed.p1.can("activate", "shells")).toBe(false);
  });

  test("[Action] in a showdown on the OPPONENT's turn: holding Focus as the defender, cash in Shells for +2 and turn a lost combat (3 v 4) into a kill", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .gear(P1, CARD, "shells")
      .build();
    expect(game.p1.can("activate", "shells")).toBe(false); // their Neutral Open state
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "shells")).toBe(true);
    await game.p1.activate("shells", undefined, { targets: "guard" });
    expect(game.zoneOf("shells")).toBe("trash");
    game.script(P1, ["guard"]);
    await game.settle();
    // Guard 5 ≥ Raider 4 → Raider dies; Raider's 4 < 5 → Guard lives; bf1 stays P1's, no conquer point.
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("control for the showdown test: without Shells the 3-Might Guard dies to the 4-Might Raider and bf1 is conquered", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});
