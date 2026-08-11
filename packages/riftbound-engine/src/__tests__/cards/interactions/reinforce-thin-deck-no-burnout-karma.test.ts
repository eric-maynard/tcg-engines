/**
 * Interaction: Reinforce (ogn-062-298) × Karma, Channeler (ogn-235-298) × Shipyard Skulker (ogn-175-298)
 *
 *   Reinforce — Spell · Calm · 5    "Look at the top 5 cards of your Main Deck. You may banish a unit from among
 *                                    them, then play it, reducing its cost by [5]. Recycle the remaining cards."
 *   Karma, Channeler — Champion Unit · Order · 6 · 6 Might
 *                                   "[Vision] … When you recycle one or more cards to your Main Deck, buff a
 *                                    friendly unit. (If it doesn't have a buff, it gets a +1 [Might] buff.)"
 *   Shipyard Skulker — Unit · Chaos · 3 · 3 Might (vanilla)
 *
 * Rules: 431.1.c (looking at or revealing MORE cards than the deck holds never Burns Out — look at as many as
 * possible and proceed), 431.1.c.1 (insufficient cards ⇒ the subsequent instructions are ignored, still no Burn
 * Out, even though they would change a card's zone), 431.1 / 431.2 (Burn Out is for actually moving cards out of
 * an empty deck: recycle the trash and an opponent scores), 359.3.e.6 / 359.3.e.11 (an instruction that cannot be
 * followed is ignored), 359.3.e.10 (the spell is still considered played and resolves with no effect),
 * 426.1.b.1 / 426.1.c (a unit that already has a buff is a legal choice and simply gains nothing),
 * 426.2.a (players buff only when an effect directs them to).
 *
 * Question: P1 controls Karma and casts Reinforce with (a) an EMPTY Main Deck and a non-empty trash, (b) a
 * 2-card deck holding no unit, (c) a 1-card deck holding only the Skulker, which P1 banishes and plays.
 * Does looking at fewer than 5 Burn Out? Does Karma trigger when there is nothing left to recycle? Is the
 * spell still played when it does literally nothing?
 *
 * Expected: no Burn Out in any branch, no opponent point, no substitute draw, the trash untouched, and Reinforce
 * always ends in the trash. (a) 0 cards looked at → nothing to banish, nothing to recycle → Karma silent.
 * (b) both cards looked at, no unit among them → the optional play is ignored; both are recycled → Karma fires
 * ONCE. (c) the Skulker is banished and played for 3−5 = 0; zero cards remain → no recycle → Karma silent.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, scenario } from "../../../harness";

const REINFORCE = "ogn-062-298";
const KARMA_CHANNELER = "ogn-235-298";
const SHIPYARD_SKULKER = "ogn-175-298";
const DISCIPLINE = "ogn-058-298"; // any non-unit card — Reinforce's "a unit from among them" cannot take it

/**
 * P1's turn, exactly 5 energy (Reinforce's whole cost), Karma plus two other friendly units on board, one card
 * already in the trash, and a Main Deck of exactly `deckDefs` (auto-fill OFF so "empty" really is empty).
 */
function board(deckDefs: readonly string[], aliases: readonly string[]) {
  return scenario()
    .fillDecks(false)
    .resources(P1, { energy: 5 })
    .unit(P1, "base", KARMA_CHANNELER, "karma")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 2, name: "Veteran" }, "vet", { buffed: true })
    .trash(P1, SHIPYARD_SKULKER, "trashed")
    .hand(P1, REINFORCE, "rf")
    .deck(P1, deckDefs, aliases);
}

/** Nothing about this interaction may hand a point to an opponent or recycle the trash (431.1 / 431.2). */
function expectNoBurnOut(game: Game): void {
  expect(game.p2.points()).toBe(0);
  expect(game.p1.points()).toBe(0);
  expect(game.p1.trash()).toContain("trashed"); // the trash was never shuffled back in
  expect(game.violations()).toEqual([]);
}

describe("(a) EMPTY Main Deck — 431.1.c: look at as many as possible (zero) and proceed, no Burn Out", () => {
  test("Reinforce resolves with no prompt at all: nothing to look at, nothing to banish, nothing to recycle", async () => {
    const game = await board([], []).build();
    await game.p1.cast("rf");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.deck()).toHaveLength(0);
  });

  test("359.3.e.10 — the spell is still considered played: it leaves the hand, costs 5 and ends in the trash", async () => {
    const game = await board([], []).build();
    await game.p1.cast("rf");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("rf")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0); // no card was drawn as a substitute
  });

  test("no Burn Out: no opponent point, the trash is untouched", async () => {
    const game = await board([], []).build();
    await game.p1.cast("rf");
    await game.settle();
    expectNoBurnOut(game);
  });

  test("426.2.a — Karma does NOT trigger: 'one or more cards recycled' is false, so no unit is buffed", async () => {
    const game = await board([], []).build();
    await game.p1.cast("rf");
    await game.settle();
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("karma").isBuffed).toBe(false);
    expect(game.chain()).toEqual([]);
  });
});

describe("(b) 2-card deck with no unit — the optional banish/play is ignored, both cards ARE recycled", () => {
  test("no unit among the looked-at cards, so nothing is banished and the deck is restored to 2 — still no Burn Out", async () => {
    const game = await board([DISCIPLINE, DISCIPLINE], ["d1", "d2"]).build();
    await game.p1.cast("rf");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("mainDeck");
    expect(game.zoneOf("d2")).toBe("mainDeck");
    expect(game.p1.deck()).toHaveLength(2);
    await game.p1.pick("ally"); // Karma's buff, queued by the recycle
    await game.settle();
    expect(game.zoneOf("rf")).toBe("trash");
    expectNoBurnOut(game);
  });

  test("Karma triggers ONCE and asks P1 to buff a friendly unit; the already-buffed Veteran is a legal choice (426.1.b.1)", async () => {
    const game = await board([DISCIPLINE, DISCIPLINE], ["d1", "d2"]).build();
    await game.p1.cast("rf");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => (o.card ?? o.key) as string).sort() : [];
    expect(offered).toEqual(["ally", "karma", "vet"]);
  });

  test("buffing the unbuffed Ally gives it its +1 [Might] buff", async () => {
    const game = await board([DISCIPLINE, DISCIPLINE], ["d1", "d2"]).build();
    const before = game.state("ally").might;
    await game.p1.cast("rf");
    await game.settle();
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").isBuffed).toBe(true);
    expect(game.state("ally").might).toBe(before + 1);
    expect(game.state("vet").isBuffed).toBe(true); // untouched
  });

  test("426.1.c — choosing the ALREADY-buffed Veteran is legal and simply adds no second buff", async () => {
    const game = await board([DISCIPLINE, DISCIPLINE], ["d1", "d2"]).build();
    const before = game.state("vet").might;
    await game.p1.cast("rf");
    await game.settle();
    await game.p1.pick("vet");
    await game.settle();
    expect(game.state("vet").isBuffed).toBe(true);
    expect(game.state("vet").might).toBe(before);
    expect(game.state("ally").isBuffed).toBe(false);
  });
});

describe("(c) 1-card deck holding the Skulker — banish it, play it at 3 − [5] = 0, nothing left to recycle", () => {
  /** Cast Reinforce, take the lone Skulker, and answer a destination question if one comes. */
  async function takeSkulker(game: Game): Promise<void> {
    await game.p1.cast("rf");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => (o.card ?? o.key) as string) : []).toEqual(["skulk"]);
    await game.p1.pick("skulk");
    const next = game.decision();
    if (next?.kind === "pick" && next.semantics === "destination") {
      await game.p1.pick("base");
    }
    await game.settle();
  }

  test("the Skulker is banished and then played for free — P1 spent only Reinforce's 5", async () => {
    const game = await board([SHIPYARD_SKULKER], ["skulk"]).build();
    await takeSkulker(game);
    expect(game.zoneOf("skulk")).toBe("base");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.deck()).toHaveLength(0);
    expect(game.zoneOf("rf")).toBe("trash");
  });

  test("nothing remains, so 'recycle the remaining cards' is ignored and Karma stays silent — and still no Burn Out", async () => {
    const game = await board([SHIPYARD_SKULKER], ["skulk"]).build();
    await takeSkulker(game);
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("karma").isBuffed).toBe(false);
    expect(game.state("skulk").isBuffed).toBe(false);
    expectNoBurnOut(game);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("declining the optional banish instead recycles the lone card, which DOES wake Karma", async () => {
    const game = await board([SHIPYARD_SKULKER], ["skulk"]).build();
    await game.p1.cast("rf");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.zoneOf("skulk")).toBe("mainDeck");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").isBuffed).toBe(true);
    expectNoBurnOut(game);
  });
});
