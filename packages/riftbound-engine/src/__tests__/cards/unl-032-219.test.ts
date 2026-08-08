/**
 * Double Trouble — unl-032-219 · Spell · Calm · 2 energy (no power) · no timing keyword
 *
 *   [Repeat] [2] (You may pay the additional cost to repeat this spell's effect.)
 *   Look at the top 3 cards of your Main Deck. You may reveal a unit from among them and
 *   draw it. Recycle the rest.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. "You MAY reveal a UNIT": only units among the 3 are eligible (a gear/spell never is); the
 *     pick is optional (declinable) and made on resolution; declining recycles all 3.
 *  2. "Recycle the rest" = bottom of the Main Deck (416.1.a): 2 cards go under when one is drawn,
 *     3 when none is; nothing is trashed; the former 4th card is the new top.
 *  3. Repeat [2] is an optional ADDITIONAL energy cost paid as you play it (820.1.d): 4 energy
 *     total runs the whole instruction twice — the second look sees the NEXT 3 cards because the
 *     first batch's rejects already went under; each execution has its own optional pick (820.2.a).
 *     With exactly 2–3 energy the plain cast is legal but the repeat variant is not.
 *  4. Short deck: fewer than 3 cards → look at what is there, no Burn Out (431.1.c).
 *  5. No unit among the 3 → nothing may be drawn; all 3 recycled; hand unchanged.
 *  6. Timing: the card prints NO [Action]/[Reaction] — it is a plain spell: own turn, Open state,
 *     empty chain only. Not in a showdown (even with Focus), not on the opponent's turn.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision, PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-032-219";
const SKULKER = "ogn-175-298"; // vanilla unit
const SNAX = "sfd-046-221"; // Poro Snax — gear
const CLEAVE = "ogn-004-298"; // spell

/** P1 with `energy`, Double Trouble in hand, known deck top: unit, gear, unit, spell, unit, unit, then "seventh". */
function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .deck(P1, [SKULKER, SNAX, SKULKER, CLEAVE, SKULKER, SKULKER, SKULKER], ["u1", "gear2", "u3", "spell4", "u5", "u6", "seventh"])
    .hand(P1, CARD, "dt");
}

const offered = (d: unknown) => ((d as PickDecision | null)?.kind === "pick" ? (d as PickDecision).options.map((o) => o.card) : []);

describe("Double Trouble (unl-032-219)", () => {
  test("cost: 2 energy, goes on the chain as a non-triggered item; 1 energy cannot cast it", async () => {
    const game = await board(2).build();
    expect(game.p1.can("cast", "dt")).toBe(true);
    await game.p1.cast("dt");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dt", controller: P1, triggered: false })]);
    expect(game.zoneOf("dt")).toBe("chain");
    const poor = await board(1).build();
    expect(poor.p1.can("cast", "dt")).toBe(false);
  });

  test("looks at exactly the top 3 and offers only the UNITS among them (the gear is not eligible); the pick is optional (max 1)", async () => {
    const game = await board().build();
    await game.p1.cast("dt");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, seat: P1, semantics: "from-revealed" });
    expect(offered(d).sort()).toEqual(["u1", "u3"]);
    expect(offered(d)).not.toContain("gear2");
    expect(offered(d)).not.toContain("spell4"); // 4th card is not looked at
  });

  test("drawing the picked unit: it goes to hand, the other 2 go to the BOTTOM of the Main Deck, the 4th card is the new top, spell to trash", async () => {
    const game = await board().build();
    const deckSize = game.p1.deck().length;
    await game.p1.cast("dt");
    await game.settle();
    await game.p1.pick("u3");
    await game.settle();
    expect(game.p1.hand()).toEqual(["u3"]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(deckSize - 1);
    expect(deck[0]).toBe("spell4");
    expect([...deck.slice(-2)].sort()).toEqual(["gear2", "u1"]);
    expect(game.p1.trash()).toEqual(["dt"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("'you may': declining draws nothing and recycles all 3 (hand empty, 4th card on top, 3 on the bottom)", async () => {
    const game = await board().build();
    const deckSize = game.p1.deck().length;
    await game.p1.cast("dt");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(deckSize);
    expect(deck[0]).toBe("spell4");
    expect([...deck.slice(-3)].sort()).toEqual(["gear2", "u1", "u3"]);
    expect(game.zoneOf("dt")).toBe("trash");
  });

  test("no unit among the top 3 → nothing can be drawn; all 3 are recycled and the hand stays empty", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .deck(P1, [SNAX, CLEAVE, SNAX, SKULKER], ["g1", "s2", "g3", "u4"])
      .hand(P1, CARD, "dt")
      .build();
    await game.p1.cast("dt");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(offered(d)).toEqual([]); // a decline-only prompt at most
      await game.p1.decline();
      await game.settle();
    }
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("u4");
    expect([...game.p1.deck().slice(-3)].sort()).toEqual(["g1", "g3", "s2"]);
    expect(game.zoneOf("dt")).toBe("trash");
  });

  test("Repeat [2]: paying 4 energy runs the instruction twice — the second look sees the NEXT 3 (first rejects already under); +2 in hand, 4 on the bottom", async () => {
    const game = await board(4).build();
    await game.p1.cast("dt", { repeat: 1 });
    expect(game.p1.energy()).toBe(0); // 2 + 2
    expect(game.chain()).toHaveLength(1); // one chain item, executed twice on resolution (820.1.d)
    await game.settle();
    expect(offered(game.decision()).sort()).toEqual(["u1", "u3"]);
    await game.p1.pick("u1");
    await game.settle();
    const second = game.decision() as PickDecision;
    expect(second).toMatchObject({ kind: "pick", seat: P1 });
    expect(offered(second).sort()).toEqual(["u5", "u6"]); // looked at spell4, u5, u6
    await game.p1.pick("u6");
    await game.settle();
    expect([...game.p1.hand()].sort()).toEqual(["u1", "u6"]);
    const deck = game.p1.deck();
    expect(deck[0]).toBe("seventh");
    expect([...deck.slice(-4)].sort()).toEqual(["gear2", "spell4", "u3", "u5"]);
    expect([...deck.slice(-4, -2)].sort()).toEqual(["gear2", "u3"]); // first batch went under first
    expect(game.zoneOf("dt")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
  });

  test("Repeat choices are independent (820.2.a): decline the first look, draw from the second", async () => {
    const game = await board(4).build();
    await game.p1.cast("dt", { repeat: 1 });
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(offered(game.decision()).sort()).toEqual(["u5", "u6"]);
    await game.p1.pick("u5");
    await game.settle();
    expect(game.p1.hand()).toEqual(["u5"]);
    expect(game.p1.deck()[0]).toBe("seventh");
    expect([...game.p1.deck().slice(-5)].sort()).toEqual(["gear2", "spell4", "u1", "u3", "u6"]);
  });

  test("Repeat is optional and must be affordable: with 3 energy the plain cast is legal, the repeat variant is refused and nothing is spent", async () => {
    const game = await board(3).build();
    expect(game.p1.can("cast", "dt")).toBe(true);
    const r = await game.p1.try((p) => p.cast("dt", { repeat: 1 }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("dt")).toBe("hand");
    expect(game.p1.energy()).toBe(3);
    // Choosing not to repeat with 4 available spends only 2 and looks once.
    const rich = await board(4).build();
    await rich.p1.cast("dt", { repeat: 0 });
    expect(rich.p1.energy()).toBe(2);
    await rich.settle();
    await rich.p1.pick("u1");
    await rich.settle();
    expect(rich.decision()?.kind).toBe("action");
    expect(rich.p1.hand()).toEqual(["u1"]);
    expect(rich.p1.deck()[0]).toBe("spell4");
  });

  test("short deck (2 cards, one unit): looks at both, may draw the unit, recycles the other — no Burn Out (431.1.c)", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 2 })
      .deck(P1, [SNAX, SKULKER], ["g1", "u2"])
      .deck(P2, [SKULKER, SKULKER])
      .hand(P1, CARD, "dt")
      .build();
    await game.p1.cast("dt");
    await game.settle();
    expect(offered(game.decision())).toEqual(["u2"]);
    await game.p1.pick("u2");
    await game.settle();
    expect(game.p1.hand()).toEqual(["u2"]);
    expect(game.p1.deck()).toEqual(["g1"]);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
  });

  test("the look is private: P2's view of the pending pick carries no card identities", async () => {
    const game = await board().build();
    await game.p1.cast("dt");
    await game.settle();
    const seen = game.view(P2).decision;
    expect(seen).toMatchObject({ kind: "pick", seat: P1 });
    expect(JSON.stringify(seen)).not.toContain("u1");
    expect(JSON.stringify(seen)).not.toContain("Skulker");
  });

  test("timing: no [Action]/[Reaction] printed — not castable on the opponent's turn, nor onto an open chain on your own turn", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "dt")).toBe(false);
    const game = await board(3).hand(P1, CLEAVE, "cleave").unit(P1, "base", { might: 2 }, "pal").build();
    await game.p1.cast("cleave", { targets: "pal" });
    expect(game.chain()).toHaveLength(1);
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dt")).toBe(false);
    await game.settle();
    expect(game.p1.can("cast", "dt")).toBe(true); // Open state again
  });

  test("timing: no [Action] keyword — NOT castable during a showdown even while holding Focus on your own turn", async () => {
    const game = await board()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1 }, "foe")
      .unit(P1, "base", { might: 3 }, "attacker")
      .build();
    await game.p1.move("attacker", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dt")).toBe(false);
  });

  test("registry payload: a 2-energy calm spell with Repeat {energy:2} whose effect looks at 3 from the deck, unit-filtered, optional", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "calm", energyCost: 2, name: "Double Trouble" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 3, filter: { cardTypes: ["unit"] }, from: "deck", optional: true, type: "look" },
      repeat: { energy: 2 },
      type: "spell",
    });
  });
});
