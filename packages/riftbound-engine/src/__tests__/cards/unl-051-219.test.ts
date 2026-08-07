/**
 * Ivern, Nurturer — unl-051-219 · Champion Unit (Ivern) · Calm · 5 energy + [calm] · 4 Might
 *
 *   When you play me or when I hold, look at the top 3 cards of your Main Deck. You may reveal a
 *   unit from among them and draw it. Recycle the rest. Then if you revealed a Bird, Cat, Dog, or
 *   Poro, do this: [Buff] a friendly unit. (Give it a +1 [Might] buff if it doesn't have one.)
 *
 * Rules: 383.4.d (Hold effect: I must be AT the battlefield held in MY Beginning Phase), 383.3.a.3
 * (the "you may reveal" is decided on resolution; the trigger always chains), 416.1.a (recycle →
 * bottom), 426/702 (Buff = place a buff counter, +1 Might, max one per unit; an already-buffed unit
 * may be chosen but gets nothing), 355.10 ("do this:" is a linked follow-up conditioned on what was
 * revealed — the revealed card's TAGS, checked as it was revealed).
 *
 * Head-judge notes — the tricky spots for this card:
 *  1. ONE ability, TWO trigger conditions (play-self OR hold) — same look each time; the hold version
 *     needs Ivern himself parked on a battlefield I keep through my Beginning Phase (Ivern in base
 *     while someone else holds → nothing; the opponent's Beginning Phase → nothing).
 *  2. Pick filter is "a UNIT": the spell/gear among the three are never offered; only the top THREE
 *     are looked at (the 4th card is not offered and ends up on top after the recycle).
 *  3. The follow-up is conditional on the REVEALED card's tag, not on what is on the board: revealing
 *     Stalwart Poro (Poro) → Buff a friendly unit (Ivern himself is a legal — often the only — choice);
 *     revealing Shipyard Skulker (no tag) or declining → no buff anywhere.
 *  4. Optional: decline → all three recycled, hand unchanged, no buff.
 *  5. Cost: 5 energy AND a [calm] pip; from hand he enters exhausted; the trigger is a chain item.
 *  6. Hold turn bookkeeping: hold point scored, the drawn unit + the draw-phase card both end in hand,
 *     channel still happens.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-051-219";
const STALWART_PORO = "ogn-052-298"; // unit, calm, 2 Might, tag Poro
const SKULKER = "ogn-175-298"; // unit, no tags
const CONSULT = "ogn-083-298"; // spell
const SNAX = "sfd-046-221"; // gear
const FILLER = "ogn-175-298";

/** Ivern in hand with 5+[calm]; deck (top first): spell, Stalwart Poro, Skulker, then a 4th unit. */
function inHand() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .hand(P1, CARD, "ivern")
    .deck(P1, [CONSULT, STALWART_PORO, SKULKER, FILLER], ["spell", "poro", "skulk", "fourth"]);
}

describe("Ivern, Nurturer (unl-051-219)", () => {
  test("registry payload: 5+[calm] calm champion, 4 Might, ONE triggered ability on play-self-or-hold → optional look 3 (units only) from the deck", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 5, isChampion: true, might: 4, name: "Ivern, Nurturer", tags: ["Ivern"] });
    expect(def?.powerCost).toEqual(["calm"]);
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { amount: 3, filter: { cardTypes: ["unit"] }, from: "deck", optional: true, type: "look" },
      trigger: { event: "play-self-or-hold", on: "self" },
      type: "triggered",
    });
  });

  test("registry payload drops the linked follow-up — 'Then if you revealed a Bird, Cat, Dog, or Poro, do this: Buff a friendly unit' must be encoded (a conditional buff keyed on the revealed card's tags)", async () => {
    // Expected: the look effect (or the ability) carries a follow-up/then step of type "buff" on a friendly unit,
    // gated on tags Bird|Cat|Dog|Poro. Actual: the parsed ability is the bare look; no "buff", no "Poro" anywhere.
    const def = (await loadDefaultCardPool()).get(CARD);
    const json = JSON.stringify(def?.abilities ?? []);
    expect(json).toMatch(/buff/i);
    expect(json).toMatch(/Poro/);
  });

  test("cost: 5 energy + 1 calm; lands in base exhausted with the play trigger on the chain; missing the calm / only 4 energy → unplayable", async () => {
    const game = await inHand().build();
    await game.p1.play("ivern");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("ivern")).toBe("base");
    expect(game.state("ivern")).toMatchObject({ isBuffed: false, isExhausted: true, might: 4 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ivern", controller: P1, triggered: true })]);
    expect((await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "i").build()).p1.can("play", "i")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).hand(P1, CARD, "i").build()).p1.can("play", "i")).toBe(false);
    expect((await scenario().resources(P1, { energy: 4, power: { calm: 2 } }).hand(P1, CARD, "i").build()).p1.can("play", "i")).toBe(false);
  });

  test("play trigger: declinable pick over exactly the top 3, UNITS only (the spell is not offered, the 4th card is not looked at); picking Skulker draws it, the other two go to the bottom, 'fourth' is the new top", async () => {
    const game = await inHand().build();
    const deckSize = game.p1.deck().length;
    await game.p1.play("ivern");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed" });
    expect((d?.kind === "pick" ? d.options.map((o) => o.card) : []).sort()).toEqual(["poro", "skulk"]);
    await game.p1.pick("skulk");
    await game.settle();
    expect(game.p1.hand()).toEqual(["skulk"]);
    expect(game.p1.deck()).toHaveLength(deckSize - 1);
    expect(game.p1.deck()[0]).toBe("fourth");
    expect([...game.p1.deck().slice(-2)].sort()).toEqual(["poro", "spell"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("negative space for the follow-up: revealing a unit with NO Bird/Cat/Dog/Poro tag (Skulker) buffs nobody — Ivern stays an unbuffed 4, the ally stays 2", async () => {
    const game = await inHand().unit(P1, "base", { might: 2, name: "Ally" }, "ally").build();
    await game.p1.play("ivern");
    await game.settle();
    await game.p1.pick("skulk");
    await game.settle();
    expect(game.state("ivern")).toMatchObject({ isBuffed: false, might: 4 });
    expect(game.state("ally")).toMatchObject({ isBuffed: false, might: 2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("gear is not a unit either: with [gear, spell, Skulker] on top only Skulker is offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { calm: 1 } })
      .hand(P1, CARD, "ivern")
      .deck(P1, [SNAX, CONSULT, SKULKER, STALWART_PORO], ["gear", "spell", "skulk", "poro4th"])
      .build();
    await game.p1.play("ivern");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["skulk"]);
  });

  test("'you MAY': declining recycles all 3, draws nothing, buffs nothing", async () => {
    const game = await inHand().build();
    const deckSize = game.p1.deck().length;
    await game.p1.play("ivern");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deckSize);
    expect(game.p1.deck()[0]).toBe("fourth");
    expect([...game.p1.deck().slice(-3)].sort()).toEqual(["poro", "skulk", "spell"]);
    expect(game.state("ivern").isBuffed).toBe(false);
  });

  test("revealing a PORO (Stalwart Poro) must continue with 'Buff a friendly unit' — with Ivern the only friendly unit he ends up buffed (5 Might); the Poro is drawn and the rest recycled as usual", async () => {
    // Expected: after picking "poro" either a friendly-unit target prompt (answer: ivern) or an automatic buff on the
    // lone friendly unit; end state ivern.isBuffed === true, might 5, hand [poro]. Actual: the draw/recycle happen
    // but no buff step exists — Ivern stays an unbuffed 4.
    const game = await inHand().build();
    await game.p1.play("ivern");
    await game.settle();
    await game.p1.pick("poro");
    const stop = await game.settle();
    if (stop.reason === "unanswered" && game.decision()?.seat === P1) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.p1.pick("ivern");
      } else if (d?.kind === "yes-no") {
        await game.p1.yes();
      }
      await game.settle();
    }
    expect(game.p1.hand()).toEqual(["poro"]);
    expect([...game.p1.deck().slice(-2)].sort()).toEqual(["skulk", "spell"]);
    expect(game.state("ivern")).toMatchObject({ isBuffed: true, might: 5 });
  });

  test("with two friendly units the Poro follow-up lets me choose which to buff — choosing the ally makes it a buffed 3 and leaves Ivern at 4", async () => {
    // Expected: a target prompt among friendly units {ivern, ally}; picking ally → ally buffed (+1). Actual: no prompt, no buff.
    const game = await inHand().unit(P1, "base", { might: 2, name: "Ally" }, "ally").build();
    await game.p1.play("ivern");
    await game.settle();
    await game.p1.pick("poro");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally")).toMatchObject({ isBuffed: true, might: 3 });
    expect(game.state("ivern")).toMatchObject({ isBuffed: false, might: 4 });
  });

  test("When I hold: Ivern kept on my battlefield through my Beginning Phase → hold point, trigger on the chain in 'beginning', pick Skulker → hand = [skulk + the draw-phase card 'fourth'], 2 runes channeled", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("grove", { controller: P1 })
      .unit(P1, "grove", CARD, "ivern")
      .deck(P1, [CONSULT, STALWART_PORO, SKULKER, FILLER], ["spell", "poro", "skulk", "fourth"])
      .build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ivern", controller: P1, triggered: true })]);
    const stop = await game.settle();
    expect(stop.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect((d?.kind === "pick" ? d.options.map((o) => o.card) : []).sort()).toEqual(["poro", "skulk"]);
    await game.p1.pick("skulk");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect([...game.p1.hand()].sort()).toEqual(["fourth", "skulk"]);
    expect([...game.p1.deck().slice(-2)].sort()).toEqual(["poro", "spell"]);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.locationOf("ivern")).toBe("grove");
  });

  test("no hold trigger when Ivern sits in BASE while another unit holds: just the hold point and a plain draw of the untouched top card", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("grove", { controller: P1 })
      .unit(P1, "grove", { might: 2, name: "Treant" }, "treant")
      .unit(P1, "base", CARD, "ivern")
      .deck(P1, [CONSULT, STALWART_PORO, SKULKER], ["spell", "poro", "skulk"])
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toEqual(["spell"]);
    expect(game.p1.deck()[0]).toBe("poro");
  });

  test("only MY hold: across the opponent's Beginning Phase Ivern on my battlefield scores nothing and looks at nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("grove", { controller: P1 })
      .unit(P1, "grove", CARD, "ivern")
      .deck(P1, [STALWART_PORO, SKULKER], ["poro", "skulk"])
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("poro");
    expect(game.chain()).toEqual([]);
  });

  test("not a hold if the grove is lost first: P2 conquers it on their turn (Ivern dies 4 vs 6) → at my turn start no point, no look", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("grove", { controller: P1 })
      .unit(P1, "grove", CARD, "ivern")
      .unit(P2, "base", { might: 6, name: "Logger" }, "logger")
      .deck(P1, [STALWART_PORO, SKULKER], ["poro", "skulk"])
      .build();
    await game.p2.move("logger", "grove");
    await game.settle();
    expect(game.zoneOf("ivern")).toBe("trash");
    expect(game.gameState.battlefields.grove?.controller).toBe(P2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toEqual(["poro"]); // plain draw phase
    expect(game.violations()).toEqual([]);
  });
});
