/**
 * Interaction: Clairvoyance (ven-056-166) · Spell (Reaction) · Mind · 7
 *     "[Predict 5]. (Look at the top 5 cards of your Main Deck. Recycle any of them and put the rest
 *      back in any order.) Draw 2."
 *   × Nocturne, Horrifying (ogn-194-298) · Champion Unit · Chaos · 4 + [chaos] · 4 Might
 *     "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do,
 *      you may play me for [rainbow]."
 *
 * Rules: 436.1 / 436.1.a (Predict X = LOOK at the top X, recycle any number, put the rest back in ANY
 * ORDER), 436.4 / 436.4.a (short deck: predict as many as possible, never Burn Out), 413.1.a (draw from
 * the top), 413.4.a–c (over-draw: draw what you can, Burn Out, draw the rest), 416.5 (2+ cards recycled
 * together go to the bottom in random order — no choice), 431.1.c (look at as many as possible, no Burn
 * Out), 431.2 (Burn Out: recycle trash into deck, an opponent gains 1, finish the action).
 *
 * Question — deck top→bottom D1 D2 N D4 D5 D6 D7 (N = Nocturne):
 *   (a) may P1 use Nocturne's look-replacement during the Predict? how many cards remain to arrange?
 *   (b) yes-line: recycle D1, D2, stack D5 over D4 — order Decision for the kept? for the recycled? what
 *       does Draw 2 draw, and the deck afterwards?
 *   (c) no-line: recycle N, D1, D2, keep D4 over D5 → draws? Nocturne re-offered when later DRAWN?
 *   (d) 3-card deck D1 D2 D3: how many looked at, Burn Out?, recycle all three then Draw 2?
 *   (e) 1-card deck D1, trash {T1,T2}: where does the single Burn Out happen and what ends in hand?
 * Expected: (a) yes — Predict is a look; N leaves the set, 4 remain. (b) order Decision over {D4,D5} only;
 * Draw 2 = D5, D4; deck D6 D7 … {D1,D2}; N on board for [rainbow]; Clairvoyance → trash. (c) draws D4, D5;
 * deck D6 D7 … {N,D1,D2}; a later normal draw of N offers nothing. (d) looks at 3, no Burn Out, hand = 2
 * of the 3, deck 1, P2 still 0. (e) predict looks at D1 (no Burn Out); Draw 2: D1, then Burn Out (trash →
 * deck, P2 +1), then one of T1/T2; deck 1; trash = {Clairvoyance}. Exactly one Burn Out, from the Draw.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, OrderDecision, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLAIRVOYANCE = "ven-056-166";
const NOCTURNE = "ogn-194-298";

/** A recognisable vanilla filler card (uncastable 9-cost blank spell). */
const known = (n: string) => ({ abilities: [], cardType: "spell", domain: "mind", energyCost: 9, name: `Card ${n.toUpperCase()}` });

/**
 * P1's turn, exactly 7 energy + 1 rainbow (Nocturne's alternative cost). Deck top→bottom:
 * d1 d2 noc d4 d5 d6 d7 (+ harness filler below unless `fill` is false). No battlefields, so a played
 * Nocturne can only enter the base (no location prompt).
 */
function board(fill = true) {
  const s = fill ? scenario() : scenario().fillDecks(false);
  return s
    .resources(P1, { energy: 7, power: { rainbow: 1 } })
    .hand(P1, CLAIRVOYANCE, "clv")
    .deck(P1, [known("d1"), known("d2"), NOCTURNE, known("d4"), known("d5"), known("d6"), known("d7")], ["d1", "d2", "noc", "d4", "d5", "d6", "d7"]);
}

/** Cast Clairvoyance and pass twice so it starts resolving; returns at its first prompt. */
async function castAndResolve(game: Game): Promise<Decision | null> {
  await game.p1.cast("clv");
  expect(game.p1.energy()).toBe(0);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game.decision();
}

const isRecyclePick = (d: Decision | null): d is PickDecision => d?.kind === "pick" && d.semantics === "from-revealed" && d.seat === P1;
const isNocturneOptIn = (d: Decision | null) => d?.kind === "yes-no" && d.seat === P1 && d.source?.cardId === "noc";
const shown = (d: Decision | null) => (isRecyclePick(d) ? d.options.map((o) => o.card ?? o.key) : []);

/** Recycle the named cards from the open Predict prompt (one pick at a time), then decline to finish recycling. */
async function recycle(game: Game, cards: readonly string[]): Promise<void> {
  for (const c of cards) {
    expect(isRecyclePick(game.decision())).toBe(true);
    await game.p1.pick(c);
  }
  if (isRecyclePick(game.decision())) {
    await game.p1.decline();
  }
}

describe("Clairvoyance × Nocturne, Horrifying — Predict then Draw", () => {
  test("premise: Predict 5 shows exactly the top five (d1 d2 noc d4 d5 — not d6/d7) and nothing is drawn while the prompt is open", async () => {
    const game = await board().build();
    let d = await castAndResolve(game);
    if (isNocturneOptIn(d)) {
      await game.p1.no(); // keep N among the five for this premise
      d = game.decision();
    }
    expect(isRecyclePick(d)).toBe(true);
    expect(shown(d).sort()).toEqual(["d1", "d2", "d4", "d5", "noc"]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck().slice(0, 5)).toEqual(["d1", "d2", "noc", "d4", "d5"]); // still in the deck while looked at
  });

  // Expected (436.1.a + Nocturne): Predict LOOKS at the top 5, so Nocturne's "as you look at me … you may
  // banish me" is offered first; taking it (and the "[rainbow]" play) removes N from the looked-at set and
  // the recycle prompt then ranges over the remaining four. Actual: Predict never consults look/reveal
  // replacements — the recycle prompt opens immediately with Nocturne as an ordinary fifth card.
  test("(a) during the Predict P1 is offered Nocturne's banish-me option; yes + yes (play for [rainbow]) → N banished/pending, and only FOUR cards (d1 d2 d4 d5) remain to recycle/arrange", async () => {
    const game = await board().build();
    const d = await castAndResolve(game);
    expect(isNocturneOptIn(d)).toBe(true);
    await game.p1.yes(); // banish me
    expect(game.zoneOf("noc")).toBe("banishment");
    await game.settle();
    expect(isNocturneOptIn(game.decision())).toBe(true);
    await game.p1.yes(); // play me for [rainbow]
    await game.settle();
    const p = game.decision();
    expect(isRecyclePick(p)).toBe(true);
    expect(shown(p).sort()).toEqual(["d1", "d2", "d4", "d5"]);
  });

  // Expected: after (a), recycle d1 + d2 → an ORDER decision over exactly {d4, d5} (436.1.a "any order"), none
  // for the recycled pair (416.5 random); stacking d5 over d4 makes Draw 2 = d5 then d4; deck = d6 d7 …
  // {d1,d2}; Nocturne entered the base (exhausted) for the rainbow only; Clairvoyance → trash.
  // Actual: blocked at the missing Nocturne prompt (see above).
  test("(b) yes-line — recycle d1,d2; order Decision over {d4,d5} only; stack d5,d4 → Draw 2 draws d5 then d4; deck d6 d7 … {d1,d2}; N in base for [rainbow]; spell → trash", async () => {
    const game = await board().build();
    const d = await castAndResolve(game);
    expect(isNocturneOptIn(d)).toBe(true);
    await game.p1.yes();
    await game.settle();
    await game.p1.yes();
    await game.settle();
    if (game.decision()?.kind === "pick" && (game.decision() as PickDecision).semantics === "destination") {
      await game.p1.pick("base");
      await game.settle();
    }
    await recycle(game, ["d1", "d2"]);
    const o = game.decision();
    expect(o).toMatchObject({ kind: "order", seat: P1 });
    expect((o as OrderDecision).items.map((i) => i.card ?? i.key).sort()).toEqual(["d4", "d5"]);
    await game.p1.order(["d5", "d4"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d5", "d4"]);
    const deck = game.p1.deck();
    expect(deck.slice(0, 2)).toEqual(["d6", "d7"]);
    expect(deck.slice(-2).sort()).toEqual(["d1", "d2"]);
    expect(deck).not.toContain("noc");
    expect(game.zoneOf("noc")).toBe("base");
    expect(game.state("noc").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("clv")).toBe("trash");
  });

  test("(c) no-line: N is just one of the five — recycle noc, d1, d2; the KEPT cards get an order Decision (exactly {d4,d5}); keep d4 over d5 → Draw 2 draws d4 then d5", async () => {
    const game = await board().build();
    let d = await castAndResolve(game);
    if (isNocturneOptIn(d)) {
      await game.p1.no();
      d = game.decision();
    }
    await recycle(game, ["noc", "d1", "d2"]);
    const o = game.decision();
    expect(o).toMatchObject({ kind: "order", seat: P1, source: { cardId: "clv" } });
    expect((o as OrderDecision).items.map((i) => i.card ?? i.key).sort()).toEqual(["d4", "d5"]); // never the recycled three
    expect(game.p1.hand()).toEqual([]); // Draw 2 still waits for the arrangement
    await game.p1.order(["d4", "d5"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d4", "d5"]);
    expect(game.zoneOf("clv")).toBe("trash");
    expect(game.chain()).toEqual([]);
  });

  test("(c) …and the deck afterwards is d6, d7 on top with {noc, d1, d2} as the bottom three; Nocturne stayed a deck card (not banished, not played), rainbow unspent", async () => {
    const game = await board().build();
    const d = await castAndResolve(game);
    if (isNocturneOptIn(d)) {
      await game.p1.no();
    }
    await recycle(game, ["noc", "d1", "d2"]);
    await game.p1.order(["d4", "d5"]);
    await game.settle();
    const deck = game.p1.deck();
    expect(deck.slice(0, 2)).toEqual(["d6", "d7"]);
    expect(deck.slice(-3).sort()).toEqual(["d1", "d2", "noc"]);
    expect(game.zoneOf("noc")).toBe("mainDeck");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.violations()).toEqual([]);
  });

  test("(c′) a normal DRAW is not a look/reveal: recycle d1,d2 and stack d4, d5, noc so N is the top card after Draw 2; on P1's next Draw Phase N is simply drawn — no Nocturne prompt, nothing banished", async () => {
    const game = await board().build();
    const d = await castAndResolve(game);
    if (isNocturneOptIn(d)) {
      await game.p1.no();
    }
    await recycle(game, ["d1", "d2"]);
    expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
    await game.p1.order(["d4", "d5", "noc"]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d4", "d5"]);
    expect(game.p1.deck()[0]).toBe("noc");
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1: channels, draws N
    expect(game.turnPlayer()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("noc")).toBe("hand");
    expect(game.p1.hand().sort()).toEqual(["d4", "d5", "noc"]);
    expect(game.p1.banishment()).toEqual([]);
  });

  test("(d) 436.4: a 3-card deck predicts 3 (the prompt shows d1 d2 d3 only) with NO Burn Out; recycling all three offers no order Decision; Draw 2 then takes two of them — deck 1, hand 2, P2 still on 0, game continues", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 7 })
      .hand(P1, CLAIRVOYANCE, "clv")
      .deck(P1, [known("d1"), known("d2"), known("d3")], ["d1", "d2", "d3"])
      .deck(P2, [known("x1"), known("x2"), known("x3")], ["x1", "x2", "x3"])
      .build();
    const d = await castAndResolve(game);
    expect(isRecyclePick(d)).toBe(true);
    expect(shown(d).sort()).toEqual(["d1", "d2", "d3"]);
    expect(game.p2.points()).toBe(0);
    await recycle(game, ["d1", "d2", "d3"]);
    expect(game.decision()?.kind).not.toBe("order"); // nothing kept → nothing to arrange
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect([...game.p1.hand(), ...game.p1.deck()].sort()).toEqual(["d1", "d2", "d3"]);
    expect(game.p1.deck()).toHaveLength(1);
    expect(game.p2.points()).toBe(0); // 2 ≤ 3: no Burn Out from the draw either
    expect(game.p1.points()).toBe(0);
    expect(game.isOver()).toBe(false);
    expect(game.zoneOf("clv")).toBe("trash");
  });

  test("(e) 1-card deck + trash {t1,t2}: the Predict looks at just d1 and causes NO Burn Out (P2 0, trash intact while the prompt is open); exactly ONE Burn Out happens overall — during the Draw — so P2 ends on exactly 1", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 7 })
      .hand(P1, CLAIRVOYANCE, "clv")
      .trash(P1, known("t1"), "t1")
      .trash(P1, known("t2"), "t2")
      .deck(P1, [known("d1")], ["d1"])
      .deck(P2, [known("x1"), known("x2"), known("x3")], ["x1", "x2", "x3"])
      .build();
    const d = await castAndResolve(game);
    expect(isRecyclePick(d)).toBe(true);
    expect(shown(d)).toEqual(["d1"]); // 431.1.c / 436.4: as many as possible
    expect(game.p2.points()).toBe(0);
    expect(game.p1.trash().sort()).toEqual(["t1", "t2"]);
    expect(game.p1.deck()).toEqual(["d1"]);
    await game.p1.decline(); // keep d1 (a lone kept card needs no ordering)
    await game.settle();
    expect(game.p2.points()).toBe(1); // one Burn Out, not two
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toContain("d1"); // 413.4.a: drawn before the Burn Out
    expect(game.isOver()).toBe(false);
  });

  // Expected (413.4.b/c, 431.2): after d1 is drawn the deck is empty → Burn Out recycles the trash {t1,t2}
  // into the deck (random order), P2 +1, then the remaining draw takes whichever of t1/t2 is on top. Final:
  // hand = d1 + one of {t1,t2}; deck = the other one; trash = {Clairvoyance} once it finishes resolving.
  // Actual: the post-Burn-Out draw puts Clairvoyance itself (the resolving spell) into P1's hand — hand =
  // [d1, clv], both t1 and t2 stay in the deck, and the trash ends empty.
  test("(e) after the Burn Out the remaining draw takes one of the recycled t1/t2 — hand = d1 + one of {t1,t2}, deck = the other, trash = [Clairvoyance] (413.4.c, 431.2.d)", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 7 })
      .hand(P1, CLAIRVOYANCE, "clv")
      .trash(P1, known("t1"), "t1")
      .trash(P1, known("t2"), "t2")
      .deck(P1, [known("d1")], ["d1"])
      .deck(P2, [known("x1"), known("x2"), known("x3")], ["x1", "x2", "x3"])
      .build();
    await castAndResolve(game);
    await game.p1.decline();
    await game.settle();
    const hand = game.p1.hand();
    expect(hand).toHaveLength(2);
    expect(hand).toContain("d1");
    expect(hand).not.toContain("clv");
    expect(["t1", "t2"]).toContain(hand.find((c) => c !== "d1") as string);
    expect(game.p1.deck()).toHaveLength(1);
    expect(["t1", "t2"]).toContain(game.p1.deck()[0] as string);
    expect(game.p1.trash()).toEqual(["clv"]);
    expect(game.p2.points()).toBe(1);
  });
});
