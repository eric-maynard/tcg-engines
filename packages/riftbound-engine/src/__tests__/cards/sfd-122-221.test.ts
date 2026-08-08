/**
 * Called Shot — sfd-122-221 · Spell · Chaos · 0 energy + [chaos] · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   [Repeat] [chaos] (You may pay the additional cost to repeat this spell's effect.)
 *   Look at the top 2 cards of your Main Deck. Draw one and recycle the other.
 *
 * Head-judge notes (the tricky cases covered below):
 *  - The whole cost is one chaos POWER (0 energy): energy alone never casts it; Repeat is an
 *    optional ADDITIONAL [chaos] paid as you play it (820.1.d) — with a single chaos the repeat
 *    variant is simply not legal while the plain cast is.
 *  - Resolution order matters: draw the picked card, recycle (bottom of Main Deck) the other, so
 *    with Repeat the second look sees two FRESH cards (the recycled one went under the deck) —
 *    net +2 in hand, 2 on the bottom, in the order they were recycled.
 *  - Short deck: with exactly one card left you look at one, draw it, recycle nothing.
 *  - [Action] timing (145 / Action keyword): own turn in an Open state, or in a showdown while
 *    holding Focus on either player's turn; NOT in the opponent's Open state, NOT while the
 *    opponent holds Focus, and NOT onto an already-open chain (that needs [Reaction]).
 *  - The look is private to the caster: the opponent's view of the pending pick carries no card
 *    identities.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-122-221";
const SKULKER = "ogn-175-298";
const CLEAVE = "ogn-004-298";
const BLOCK = "ogn-057-298";

/** P1 with `chaos` power, Called Shot in hand and a known 4-card deck top (d1..d4), filler below. */
function board(chaos: number) {
  return scenario()
    .resources(P1, { energy: 0, power: { chaos } })
    .deck(P1, [SKULKER, CLEAVE, BLOCK, SKULKER], ["d1", "d2", "d3", "d4"])
    .hand(P1, CARD, "cs");
}

describe("Called Shot (sfd-122-221)", () => {
  test("cost: 0 energy + 1 chaos; goes on the chain; on resolution shows exactly the top 2, draws the pick and recycles the other to the BOTTOM", async () => {
    const game = await board(1).build();
    await game.p1.cast("cs");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cs", controller: P1, triggered: false })]);
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1, semantics: "from-revealed" });
    expect(d.options.map((o) => o.card)).toEqual(["d1", "d2"]);
    expect(d.allowDecline).toBe(false); // "Draw one" is not optional
    await game.p1.pick("d2");
    expect(game.p1.hand()).toEqual(["d2"]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("d3");
    expect(deck[deck.length - 1]).toBe("d1"); // recycled = bottom of Main Deck
    expect(deck).toHaveLength(9);
    expect(game.zoneOf("cs")).toBe("trash");
  });

  test("rule 359.3.d: while the look prompt is outstanding the spell is still mid-resolution — it stays in the chain zone and only reaches the trash once the pick is answered", async () => {
    const game = await board(1).build();
    await game.p1.cast("cs");
    await game.settle();
    expect(game.decision()?.kind).toBe("pick");
    expect(game.zoneOf("cs")).toBe("chain"); // not trashed mid-resolution
    await game.p1.pick("d1");
    expect(game.zoneOf("cs")).toBe("trash");
  });

  test("cost negative: 5 energy but no chaos power cannot cast it; a different domain's power cannot either", async () => {
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "cs").build();
    expect(noPower.p1.can("cast", "cs")).toBe(false);
    const wrongPower = await scenario().resources(P1, { energy: 5, power: { fury: 2 } }).hand(P1, CARD, "cs").build();
    expect(wrongPower.p1.can("cast", "cs")).toBe(false);
  });

  test("Repeat [chaos]: paying 2 chaos runs the effect twice — second look sees the NEXT two cards; +2 in hand, both rejects on the bottom in order", async () => {
    const game = await board(2).build();
    await game.p1.cast("cs", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } }); // base [chaos] + repeat [chaos]
    await game.settle();
    expect((game.decision() as PickDecision).options.map((o) => o.card)).toEqual(["d1", "d2"]);
    await game.p1.pick("d1");
    await game.settle();
    const second = game.decision() as PickDecision;
    expect(second.kind).toBe("pick");
    expect(second.options.map((o) => o.card)).toEqual(["d3", "d4"]); // d2 already went under
    await game.p1.pick("d4");
    expect(game.p1.hand().sort()).toEqual(["d1", "d4"]);
    const deck = game.p1.deck();
    expect(deck.slice(-2)).toEqual(["d2", "d3"]);
    expect(deck).toHaveLength(8);
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
  });

  test("Repeat is optional and separately payable: with ONE chaos the plain cast is legal but the repeat variant is refused", async () => {
    const game = await board(1).build();
    expect(game.p1.can("cast", "cs")).toBe(true);
    const r = await game.p1.try((p) => p.cast("cs", { repeat: 1 }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("cs")).toBe("hand");
    expect(game.p1.power("chaos")).toBe(1); // nothing was spent on the refused attempt
    // Choosing not to repeat with 2 chaos available spends only one.
    const rich = await board(2).build();
    await rich.p1.cast("cs", { repeat: 0 });
    expect(rich.p1.power("chaos")).toBe(1);
    await rich.settle();
    await rich.p1.pick("d1");
    expect(rich.decision()?.kind).toBe("action"); // no second look
    expect(rich.p1.hand()).toEqual(["d1"]);
  });

  test("short deck: with exactly one card left you draw it and recycle nothing (no prompt needed)", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { power: { chaos: 1 } })
      .deck(P1, [CLEAVE], ["last"])
      .deck(P2, [SKULKER, SKULKER])
      .hand(P1, CARD, "cs")
      .build();
    await game.p1.cast("cs");
    await game.settle();
    expect(game.p1.hand()).toEqual(["last"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.isOver()).toBe(false);
  });

  test("the look is private: while P1 is choosing, P2's view of the decision carries no card identities", async () => {
    const game = await board(1).build();
    await game.p1.cast("cs");
    await game.settle();
    const seen = game.view(P2).decision;
    expect(seen).toMatchObject({ kind: "pick", seat: P1 });
    expect(JSON.stringify(seen)).not.toContain("d1");
    expect(JSON.stringify(seen)).not.toContain("Skulker");
  });

  test("[Action] timing: not castable in the opponent's Open state, nor in a showdown while the OPPONENT holds Focus", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
      .hand(P1, CARD, "cs")
      .build();
    expect(game.p1.can("cast", "cs")).toBe(false);
    await game.p2.move("poker", "bf1"); // showdown opens, attacker (P2) has Focus
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.can("cast", "cs")).toBe(false);
  });

  test("[Action] timing: castable in a showdown on the opponent's turn once Focus passes to P1; it resolves mid-combat and combat still finishes", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
      .deck(P1, [CLEAVE, BLOCK], ["d1", "d2"])
      .hand(P1, CARD, "cs")
      .build();
    await game.p2.move("poker", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("cs");
    expect(game.chain()).toHaveLength(1);
    await game.settle(); // both pass → resolves inside the showdown → the look prompt
    expect((game.decision() as PickDecision).options.map((o) => o.card)).toEqual(["d1", "d2"]);
    await game.p1.pick("d1");
    await game.settle(); // showdown ends, combat resolves: 3-might defender kills the 1-might attacker
    expect(game.p1.hand()).toContain("d1");
    expect(game.zoneOf("cs")).toBe("trash");
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("[Action] is not [Reaction]: a second Called Shot cannot be added to an already-open chain on your own turn", async () => {
    const game = await board(2).hand(P1, CARD, "cs2").build();
    await game.p1.cast("cs");
    expect(game.chain()).toHaveLength(1);
    expect(game.actingSeat()).toBe(P1); // P1 holds priority on their own spell
    expect(game.p1.can("cast", "cs2")).toBe(false);
    await game.settle();
    await game.p1.pick("d1");
    expect(game.p1.can("cast", "cs2")).toBe(true); // Open state again
  });

  test("parsed abilities: an Action-timed spell with Repeat [chaos] whose effect looks at 2 from the deck (draw picked / recycle rest)", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 0, powerCost: ["chaos"], timing: "action" });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 2, from: "deck", type: "look" },
      repeat: { power: ["chaos"] },
      timing: "action",
      type: "spell",
    });
  });
});
