/**
 * Evershade Stalker — unl-123-219 · Unit · Chaos · 3 energy · 3 Might
 *
 *   When you play me, discard 1, then draw 1.
 *
 * Rules: 383.4.a (Play Effect: triggers when THIS unit is played and enters the board; goes on the
 * chain after the unit is finalized — the Stalker is already on the board while it is pending),
 * 422.4 / 359.3.e.11 (discard as an effect: discard as many as you can; with an empty hand the
 * discard is ignored and the "then draw 1" still happens), 422 (the discarding player chooses
 * which card; a discard is a real discard for "when you discard me" cards), 413.4 + 431 (drawing
 * from an empty Main Deck = Burn Out: recycle trash into deck, an opponent gains 1 point, then draw).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. It is mandatory and ordered: no "may"; with exactly one other card you MUST bin it; the
 *     draw happens only AFTER the discard is chosen (the fresh card is never among the choices).
 *  2. Stalker was your last card → nothing to discard, but you still draw 1 (net +1 card).
 *  3. Play trigger only: a Stalker placed on the board or moving does nothing; another unit being
 *     played does nothing. It triggers wherever it is played (base or a battlefield you hold).
 *  4. It is a chain item: P2 receives priority before any card leaves P1's hand.
 *  5. Partner/counter: discarding Flame Chompers (ogn-006) fires ITS discard trigger — after the
 *     Stalker's draw; with an empty deck the discard feeds the Burn Out recycle and hands P2 a point.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-123-219";
const CHOMPERS = "ogn-006-298"; // Fury unit 3: "When you discard me, you may pay [fury] to play me."
const JUNK = { cardType: "unit", domain: "chaos", energyCost: 1, might: 1, name: "Junk" } as const;

function inHand(hand: string[], energy = 3) {
  const b = scenario().resources(P1, { energy }).hand(P1, CARD, "stalker").deckTop(P1, JUNK, "topdeck");
  for (const alias of hand) {
    b.hand(P1, JUNK, alias);
  }
  return b;
}

describe("Evershade Stalker (unl-123-219)", () => {
  test("registry payload: exactly one play-self trigger whose effect is discard 1 THEN draw 1 (no optional flag, no target)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 3, might: 3, name: "Evershade Stalker" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      { effect: { amount: 1, then: { amount: 1, type: "draw" }, type: "discard" }, trigger: { event: "play-self" }, type: "triggered" },
    ]);
  });

  test("cost: exactly 3 energy, no power; enters the base exhausted as a 3-Might unit; 2 energy (even with chaos power) is not enough; not playable on the opponent's turn", async () => {
    const game = await inHand(["a"]).build();
    await game.p1.play("stalker");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("stalker")).toBe("base");
    expect(game.state("stalker")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    expect((await inHand(["a"], 2).resources(P1, { power: { chaos: 2 } }).build()).p1.can("play", "stalker")).toBe(false);
    expect((await inHand(["a"]).active(P2).build()).p1.can("play", "stalker")).toBe(false);
  });

  test("with two other cards YOU choose which to discard; the kept card stays, the top card of the deck is drawn — hand size unchanged", async () => {
    const game = await inHand(["keep", "junk"]).build();
    await game.p1.play("stalker");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "stalker", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", max: 1, min: 1, seat: P1 });
    await game.p1.pick("junk");
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["keep", "topdeck"]);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("ordered 'then': while the discard choice is pending nothing has been drawn — the top card is not among the choices and the deck is untouched", async () => {
    const game = await inHand(["a", "b"]).build();
    const deckBefore = game.p1.deck().length;
    await game.p1.play("stalker");
    await game.settle();
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["a", "b"]);
    expect(game.p1.deck().length).toBe(deckBefore);
    expect(game.zoneOf("topdeck")).toBe("mainDeck");
    await game.p1.pick("a");
    await game.settle();
    expect(game.p1.deck().length).toBe(deckBefore - 1);
    expect(game.zoneOf("topdeck")).toBe("hand");
  });

  test("mandatory: with exactly one other card in hand it is discarded (no way to keep it), then draw 1", async () => {
    const game = await inHand(["only"]).build();
    await game.p1.play("stalker");
    await game.settle(); // a forced single pick is taken by settle
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("only")).toBe("trash");
    expect(game.p1.hand()).toEqual(["topdeck"]);
  });

  test("empty hand (422.4): the Stalker was the last card → the discard is ignored but you STILL draw 1", async () => {
    const game = await inHand([]).build();
    await game.p1.play("stalker");
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual(["topdeck"]);
    expect(game.zoneOf("stalker")).toBe("base");
  });

  test("chain item (383.4.a.2): after P1 passes, P2 holds priority with the Stalker already on the board and P1's hand still intact", async () => {
    const game = await inHand(["a"]).build();
    await game.p1.play("stalker");
    expect(game.zoneOf("stalker")).toBe("base");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.hand()).toEqual(["a"]);
    expect(game.zoneOf("topdeck")).toBe("mainDeck");
    await game.p2.passPriority();
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.p1.hand()).toEqual(["topdeck"]);
  });

  test("played to a battlefield you control: same trigger, same discard-then-draw", async () => {
    const game = await inHand(["a"]).battlefield("bf1", { controller: P1 }).build();
    await game.p1.play("stalker", { to: "bf1" });
    expect(game.locationOf("stalker")).toBe("bf1");
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.p1.hand()).toEqual(["topdeck"]);
  });

  test("negative space: a Stalker already on the board that MOVES, or another unit being played next to it, discards and draws nothing; P2's hand is never touched", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "stalker", { exhausted: false })
      .hand(P1, JUNK, "a")
      .hand(P1, JUNK, "b")
      .hand(P2, JUNK, "theirs")
      .deckTop(P1, JUNK, "topdeck")
      .build();
    await game.p1.move("stalker", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.locationOf("stalker")).toBe("bf1");
    await game.p1.play("a", { to: "base" }); // another (vanilla) unit
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["b"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("topdeck")).toBe("mainDeck");
    expect(game.p2.hand()).toEqual(["theirs"]);
  });

  test("partner: discarding Flame Chompers is a real discard — the Stalker's draw completes first, THEN Chompers' 'pay [fury] to play me' is offered; paying puts Chompers on the board", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .hand(P1, CARD, "stalker")
      .hand(P1, CHOMPERS, "chompers")
      .deckTop(P1, JUNK, "topdeck")
      .build();
    await game.p1.play("stalker");
    await game.settle(); // forced: Chompers is the only card → discarded, then draw
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.p1.hand()).toEqual(["topdeck"]); // the draw already happened
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "chompers" } });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.power("fury")).toBe(0);
    expect(["base", "chain"]).toContain(game.zoneOf("chompers"));
    await game.settle();
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.p1.units("base").sort()).toEqual(["chompers", "stalker"]);
  });

  test("empty Main Deck (413.4 / 431): discard the last card, then the draw Burns Out — trash (incl. the discard) is recycled into the deck, P2 gains 1 point, and the draw completes", async () => {
    const game = await scenario().fillDecks(false).resources(P1, { energy: 3 }).hand(P1, CARD, "stalker").hand(P1, JUNK, "last").build();
    expect(game.p1.deck()).toEqual([]);
    await game.p1.play("stalker");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
    // The only card that could be recycled and drawn is the one just discarded.
    expect(game.p1.hand()).toEqual(["last"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.zoneOf("stalker")).toBe("base");
  });
});
