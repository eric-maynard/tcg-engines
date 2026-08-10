/**
 * Fate Weaver — unl-064-219 · Unit · Mind · 5 energy · 4 Might
 *
 *   When you play me, look at the top 4 cards of your Main Deck. You may reveal a spell with Energy
 *   cost [4] or more from among them and draw it. Recycle the rest.
 *
 * Rules: 383 (play trigger → chain item), 383.3.a.3 (a later "you may" is decided on RESOLUTION; the
 * trigger always goes on the chain), 416.1.a (recycle = bottom of the Main Deck), 431.1.c (looking at
 * more cards than the deck holds is not a Burn Out), 206 (a card's Energy cost is its printed number —
 * Power pips are not Energy).
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. The eligibility test is TWO-part: it must be a SPELL and its ENERGY cost must be ≥ 4. A 3-cost
 *     spell (Sprite Call) is the one-short case and must not be offered; a 4 (Consult the Past) is the
 *     exactly-enough case and must be; a unit or gear costing 5 is never eligible.
 *  2. Only the top FOUR are looked at: an eligible 6-cost spell sitting 5th is not offered and becomes
 *     the new top card after the other four go to the bottom.
 *  3. Optional on resolution: declining recycles all four, draws nothing, trashes nothing.
 *  4. Nothing eligible among the four → no forced draw; all four recycled.
 *  5. Short deck (2 cards) → look at 2, no Burn Out, pick still works.
 *  6. Cost 5, no power; enters exhausted; the look happens whether played to base or to my battlefield.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-064-219";
const SPRITE_CALL = "ogn-094-298"; // spell, 3 mind — one short
const CONSULT = "ogn-083-298"; // spell, 4 mind — exactly enough
const COMET = "ogn-085-298"; // spell, 5 mind
const PROGRESS_DAY = "ogn-114-298"; // spell, 6 mind
const SKULKER = "ogn-175-298"; // unit, 3
const BIG_UNIT = { energyCost: 5, might: 5, name: "Five Drop" } as const; // unit costing 5 — not a spell
const BIG_GEAR = { cardType: "gear", energyCost: 5, name: "Pricey Gear" } as const;

/** Weaver in hand with 5 energy; deck (top first): unit(3), Sprite Call(3), Consult(4), Comet(5), then Progress Day(6) as the FIFTH card. */
function inHand() {
  return scenario()
    .resources(P1, { energy: 5 })
    .hand(P1, CARD, "weaver")
    .deck(P1, [SKULKER, SPRITE_CALL, CONSULT, COMET, PROGRESS_DAY], ["u3", "cheap3", "four", "five", "fifth6"]);
}

describe("Fate Weaver (unl-064-219)", () => {
  test("registry payload: 5-cost mind 4-Might unit with ONE play-self trigger → optional look 4 from deck restricted to spells", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 5, might: 4, name: "Fate Weaver" });
    expect(def?.powerCost ?? []).toEqual([]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { amount: 4, filter: { cardTypes: ["spell"] }, from: "deck", optional: true, type: "look" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  test("registry payload must also encode 'Energy cost [4] or more' on the pick filter — today the filter is only {cardTypes:[spell]}", async () => {
    // Expected: some minimum-energy-cost constraint (e.g. filter.minEnergyCost / energyCost {gte:4}) in the
    // parsed look effect. Actual: `{"cardTypes":["spell"]}` and nothing else, so cheap spells qualify.
    const def = (await loadDefaultCardPool()).get(CARD);
    const filter = JSON.stringify(((def?.abilities?.[0] as { effect?: { filter?: unknown } })?.effect?.filter) ?? {});
    expect(filter).toMatch(/4/);
  });

  test("cost: 5 energy, no power; lands in base exhausted as a 4 with the play trigger on the chain; 4 energy → unplayable", async () => {
    const game = await inHand().build();
    await game.p1.play("weaver");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("weaver")).toBe("base");
    expect(game.state("weaver")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "weaver", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual([]); // nothing looked at / drawn before resolution
    expect((await scenario().resources(P1, { energy: 4, power: { mind: 3 } }).hand(P1, CARD, "w").build()).p1.can("play", "w")).toBe(false);
  });

  test("resolution: a declinable reveal-and-pick over exactly the top 4 (the 5th card, an eligible 6-cost spell, is NOT offered); picking Falling Comet draws it, the other 3 go to the bottom, 'fifth6' is the new top, nothing trashed", async () => {
    const game = await inHand().build();
    const deckSize = game.p1.deck().length;
    await game.p1.play("weaver");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).not.toContain("fifth6");
    expect(offered).toEqual(expect.arrayContaining(["four", "five"]));
    await game.p1.pick("five");
    await game.settle();
    expect(game.p1.hand()).toEqual(["five"]);
    const deck = game.p1.deck();
    expect(deck).toHaveLength(deckSize - 1);
    expect(deck[0]).toBe("fifth6");
    expect([...deck.slice(-3)].sort()).toEqual(["cheap3", "four", "u3"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("exactly-enough boundary: Consult the Past (Energy cost 4) IS offered and can be drawn", async () => {
    const game = await inHand().build();
    await game.p1.play("weaver");
    await game.settle();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toContain("four");
    await game.p1.pick("four");
    await game.settle();
    expect(game.p1.hand()).toEqual(["four"]);
    expect([...game.p1.deck().slice(-3)].sort()).toEqual(["cheap3", "five", "u3"]);
  });

  test("the UNIT among the four is never offered (spell-only)", async () => {
    const game = await inHand().build();
    await game.p1.play("weaver");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).not.toContain("u3");
  });

  test("one-short boundary — Sprite Call (a spell with Energy cost 3) must NOT be offered; only 'four' and 'five' are legal picks", async () => {
    // Expected options: exactly [five, four]. Actual: [cheap3, five, four] — the ≥4 Energy clause is not enforced.
    const game = await inHand().build();
    await game.p1.play("weaver");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect((d?.kind === "pick" ? d.options.map((o) => o.card) : []).sort()).toEqual(["five", "four"]);
  });

  test("rule 424.1 — the pick is REVEALED: drawing Falling Comet records a public reveal naming it (the look itself stays private)", async () => {
    const game = await inHand().build();
    await game.p1.play("weaver");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("five");
    await game.settle();
    expect(game.p1.hand()).toEqual(["five"]);
    expect(game.gameState.publicReveals?.at(-1)).toMatchObject({ cardIds: ["five"], playerId: P1 });
  });

  test("rule 424.1 — declining reveals nothing: no public-reveal entry is added for the private look", async () => {
    const game = await inHand().build();
    const before = game.gameState.publicReveals?.length ?? 0;
    await game.p1.play("weaver");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.gameState.publicReveals?.length ?? 0).toBe(before);
  });

  test("'you MAY': declining draws nothing, recycles all 4 to the bottom, leaves the 5th card on top and the trash empty", async () => {
    const game = await inHand().build();
    const deckSize = game.p1.deck().length;
    await game.p1.play("weaver");
    await game.settle();
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deckSize);
    expect(game.p1.deck()[0]).toBe("fifth6");
    expect([...game.p1.deck().slice(-4)].sort()).toEqual(["cheap3", "five", "four", "u3"]);
    expect(game.p1.trash()).toEqual([]);
  });

  test("nothing eligible (two units, a 5-cost unit, a 5-cost gear — high cost alone is not enough) → no card may be forced into hand; all 4 recycled, the spell that was 5th is now on top", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .hand(P1, CARD, "weaver")
      .deck(P1, [SKULKER, BIG_UNIT, BIG_GEAR, SKULKER, COMET], ["u1", "bigUnit", "bigGear", "u2", "comet5th"])
      .build();
    await game.p1.play("weaver");
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card)).toEqual([]); // a decline-only prompt at most
      await game.p1.decline();
      await game.settle();
    }
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("comet5th");
    expect([...game.p1.deck().slice(-4)].sort()).toEqual(["bigGear", "bigUnit", "u1", "u2"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("short deck (2 cards, no filler): looks at both without Burning Out; picking the Comet draws it and the unit is recycled as the whole deck", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .hand(P1, CARD, "weaver")
      .fillDecks(false)
      .deck(P1, [COMET, SKULKER], ["five", "u1"])
      .build();
    await game.p1.play("weaver");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["five"]);
    await game.p1.pick("five");
    await game.settle();
    expect(game.p1.hand()).toEqual(["five"]);
    expect(game.p1.deck()).toEqual(["u1"]);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
  });

  test("played to a battlefield I control: same trigger, same look — 'When you play me' does not care where", async () => {
    const game = await inHand().battlefield("bf1", { controller: P1 }).build();
    await game.p1.play("weaver", { to: "bf1" });
    expect(game.locationOf("weaver")).toBe("bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("five");
    await game.settle();
    expect(game.p1.hand()).toEqual(["five"]);
  });

  test("P2 may respond to the trigger but cannot stop it by passing; the reveal prompt belongs to P1 alone and P2's hand/deck are untouched", async () => {
    const game = await inHand().build();
    const p2Deck = game.p2.deck().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.play("weaver");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect(game.actingSeat()).toBe(P1);
    await game.p1.pick("four");
    await game.settle();
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.violations()).toEqual([]);
  });
});
