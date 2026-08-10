/**
 * Interaction: Party Favors (ogn-071-298) × Tasty Faefolk (ogn-075-298) — draw-vs-channel
 * asymmetry when a deck is empty.
 *
 *   Party Favors (Spell, Calm, 3): "Each other player chooses Cards or Runes. For each player
 *     that chooses Cards, you and that player each draw 1. For each player that chooses Runes,
 *     you and that player each channel 1 rune exhausted."
 *   Tasty Faefolk (Unit, Calm, 7, 6 Might): "[Accelerate] … [Deathknell] — Channel 2 runes
 *     exhausted and draw 1."
 *   (Vengeance ogn-229-298 "Kill a unit." is only the murder weapon for (c).)
 *
 * Rules: 413.4 + 431.1/431.1.a/431.2 (drawing from an empty MAIN deck = Burn Out: recycle trash
 * into deck, choose an opponent to gain 1 point, then finish the draw), 430.2 (channel "exhausted"
 * as instructed), 430.3 / 315.3.b.1 (not enough runes → channel as many as possible, no penalty —
 * Burn Out is Main-Deck-only), 430.4.b.
 *
 * (a) P1 (main deck 0, trash 4) casts Party Favors; P2 picks Cards → P1 burns out: trash → deck,
 *     P2 +1 point, then P1 draws 1 (deck 3); P2 draws 1 as well. P2's pick nets P2 a card AND a point.
 * (b) Same, P2 picks Runes while P1's rune deck is empty (12 on board): P2 channels 1 EXHAUSTED,
 *     P1 channels 0 — no Burn Out, no point, no substitute draw.
 * (c) P1's Tasty Faefolk is killed while P1 has rune deck 1, main deck 0, trash 2, P2 at 2 points:
 *     Deathknell channels exactly 1 rune (exhausted), then the draw burns P1 out once: the trash
 *     (the 2 cards + the dead Faefolk itself, which is in the trash by the time its Deathknell
 *     resolves) is recycled into the deck, P2 2 → 3, then P1 draws 1. Exactly one Burn Out, caused
 *     by the draw half only.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const PARTY_FAVORS = "ogn-071-298";
const TASTY_FAEFOLK = "ogn-075-298";
const VENGEANCE = "ogn-229-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker, vanilla
const rune = (domain: string) => ({ cardType: "rune", domain, name: `${domain} Rune` });

/** (a): P1 has NO main deck and 4 cards in trash; P2 has a normal deck. */
function boardEmptyMainDeck() {
  return scenario()
    .fillDecks({ main: 0, runes: 12 })
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .hand(P1, PARTY_FAVORS, "party")
    .trash(P1, FILLER, "t1")
    .trash(P1, FILLER, "t2")
    .trash(P1, FILLER, "t3")
    .trash(P1, FILLER, "t4")
    .deck(P2, [FILLER, FILLER, FILLER, FILLER, FILLER]);
}

/** (b): P1 has all 12 runes on board (rune deck empty) but a normal main deck; P2 normal. */
function boardEmptyRuneDeck() {
  return scenario()
    .fillDecks({ main: 5, runes: 0 })
    .runes(P1, "calm", 12)
    .runeDeck(P2, Array(12).fill(rune("fury")))
    .resources(P1, { energy: 3, power: { calm: 1 } })
    .hand(P1, PARTY_FAVORS, "party");
}

/** (c): P2's turn; P1's Faefolk at bf1; P1 rune deck 1 (3 on board), main deck 0, trash 2; P2 at 2 points. */
function boardFaefolk() {
  return scenario()
    .active(P2)
    .fillDecks({ main: 0, runes: 0 })
    .points(P2, 2)
    .victoryScore(8)
    .runes(P1, "calm", 3)
    .runeDeck(P1, [rune("calm")])
    .runeDeck(P2, Array(6).fill(rune("order")))
    .deck(P2, [FILLER, FILLER, FILLER])
    .trash(P1, FILLER, "t1")
    .trash(P1, FILLER, "t2")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TASTY_FAEFOLK, "faefolk")
    .resources(P2, { energy: 4, power: { order: 2 } })
    .hand(P2, VENGEANCE, "vengeance");
}

async function castPartyAndLetP2Choose(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, label: "Cards" | "Runes") {
  await game.p1.cast("party");
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  expect(d?.seat).toBe(P2); // "each OTHER player chooses" — it is P2's decision, not the caster's
  const options = d?.kind === "pick" ? d.options : [];
  expect(options.map((o) => o.label).sort()).toEqual(["Cards", "Runes"]);
  const key = options.find((o) => o.label === label)?.key as string;
  await game.p2.answer({ keys: [key], kind: "pick" });
  await game.settle();
}

describe("Party Favors × empty decks × Tasty Faefolk Deathknell — Burn Out is Main-Deck-only", () => {
  test("(a) P2 picks Cards while P1's main deck is empty: P1 burns out (trash 4 → deck, P2 +1 point) and then draws 1; P2 draws 1 too", async () => {
    const game = await boardEmptyMainDeck().build();
    expect(game.p1.deck()).toHaveLength(0);
    expect(game.p1.trash()).toHaveLength(4);
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;

    await castPartyAndLetP2Choose(game, "Cards");

    // P1: Burn Out recycled the 4 trash cards, then the draw took one of them.
    expect(game.p2.points()).toBe(1); // the chooser is P1's only opponent → gets the Burn Out point
    expect(game.p1.points()).toBe(0);
    expect(game.p1.deck()).toHaveLength(3);
    expect(game.p1.hand()).toHaveLength(1);
    expect(["t1", "t2", "t3", "t4"]).toContain(game.p1.hand()[0] as string);
    expect(game.p1.trash()).toEqual(["party"]); // only the resolved spell — the old trash is now the deck
    // P2: an ordinary draw.
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p2.deck()).toHaveLength(p2Deck - 1);
    // No rune moved for anyone.
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p2.runes()).toHaveLength(0);
    expect(game.phase()).toBe("main");
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(b) P2 picks Runes while P1's rune deck is empty: P2 channels 1 EXHAUSTED, P1 channels 0 — no Burn Out, no point, no substitute draw", async () => {
    const game = await boardEmptyRuneDeck().build();
    expect(game.p1.runeDeck()).toHaveLength(0);
    expect(game.p1.runes()).toHaveLength(12);
    const p1Hand = game.p1.hand().length; // includes party
    const p1Deck = game.p1.deck().length;
    const p2Hand = game.p2.hand().length;

    await castPartyAndLetP2Choose(game, "Runes");

    expect(game.p2.runes()).toHaveLength(1);
    expect(game.p2.runes({ ready: true })).toHaveLength(0); // enters exhausted (430.2)
    expect(game.p2.runeDeck()).toHaveLength(11);
    expect(game.p1.runes()).toHaveLength(12); // as many as possible = 0 (430.3)
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0); // no Burn-Out-like penalty for an empty RUNE deck
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // spent Party Favors, drew nothing instead
    expect(game.p1.deck()).toHaveLength(p1Deck);
    expect(game.p2.hand()).toHaveLength(p2Hand); // Runes mode draws nobody a card
    expect(game.zoneOf("party")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(b′) control: P2 picks Runes with both rune decks stocked → each channels exactly 1, both exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .hand(P1, PARTY_FAVORS, "party")
      .build();
    const p1Runes = game.p1.runeDeck().length;
    await castPartyAndLetP2Choose(game, "Runes");
    expect(game.p1.runes()).toHaveLength(1);
    expect(game.p2.runes()).toHaveLength(1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p2.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(p1Runes - 1);
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("(c) Tasty Faefolk's Deathknell with 1 rune left and an empty main deck: channels exactly 1 (exhausted), then ONE Burn Out (P2 2 → 3) and P1 still draws 1", async () => {
    const game = await boardFaefolk().build();
    expect(game.p1.deck()).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(1);
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.trash()).toEqual(["t1", "t2"]);
    expect(game.p1.hand()).toHaveLength(0);

    await game.p2.cast("vengeance", { targets: "faefolk" });
    await game.settle(); // Vengeance resolves → Faefolk dies → Deathknell resolves (forced burn-out choices are single-option)

    // Channel half: only 1 rune available → exactly 1 channeled, exhausted; no penalty for the shortfall.
    expect(game.p1.runeDeck()).toHaveLength(0);
    expect(game.p1.runes()).toHaveLength(4);
    expect(game.p1.runes({ ready: true })).toHaveLength(3); // the 3 pre-existing ready runes; the new one is exhausted
    // Draw half: Burn Out once → P2 gains exactly 1 point, then P1 draws 1.
    expect(game.p2.points()).toBe(3);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(1);
    // The trash at Burn Out time held t1, t2 AND the dead Faefolk (it hit the trash before its
    // Deathknell resolved) → 3 recycled, 1 drawn → deck 2, trash empty; all three accounted for.
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(2);
    expect([...game.p1.deck(), ...game.p1.hand()].sort()).toEqual(["faefolk", "t1", "t2"]);
    expect(game.zoneOf("vengeance")).toBe("trash"); // P2's spell, P2's trash — not recycled into P1's deck
    expect(game.p2.trash()).toEqual(["vengeance"]);
    expect(game.chain()).toEqual([]);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(c′) control: same kill with a stocked main deck and rune deck → channels 2 exhausted, draws 1, nobody scores", async () => {
    const game = await scenario()
      .active(P2)
      .points(P2, 2)
      .victoryScore(8)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", TASTY_FAEFOLK, "faefolk")
      .resources(P2, { energy: 4, power: { order: 2 } })
      .hand(P2, VENGEANCE, "vengeance")
      .build();
    const hand = game.p1.hand().length;
    const runeDeck = game.p1.runeDeck().length;
    await game.p2.cast("vengeance", { targets: "faefolk" });
    await game.settle();
    expect(game.zoneOf("faefolk")).toBe("trash");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(runeDeck - 2);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p2.points()).toBe(2);
  });
});
