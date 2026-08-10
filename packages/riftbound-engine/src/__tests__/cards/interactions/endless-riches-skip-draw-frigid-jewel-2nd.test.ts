/**
 * Interaction: Endless Riches (ven-022-166) · Gear · Fury · 5
 *     "… Skip your Draw Phase. You may play cards from your trash. If a card would go to your trash from
 *      anywhere other than your Main Deck, banish it instead."
 *   × Frigid Jewel (unl-074-219) · Gear · Mind · 2
 *     "When you draw your second card each turn, give a friendly unit +2 [Might] this turn."
 *   × Meditation (ogn-048-298) · Spell (Reaction) · Calm · 2
 *     "As an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1."
 *
 * Rules: 443.1.a / 443.1.a.2 / 443.2 / 443.4 (Skip is a replacement effect that replaces a procedure of
 * the turn — here the whole Draw Phase — with nothing), 443.2.a (nothing keyed to the skipped procedure
 * triggers), 315.4.b (Draw Phase: the turn player draws 1; 315.4.b.1 Burn Out only if that draw is
 * attempted on an empty deck), 413.1 (a draw takes a SINGLE card — "draw 2" is two draws), 413.2.a/.b,
 * 365.1 (Riches' passives work while it is on the board), 370.1.b (the replaced event never happens),
 * 372 (an ordering decision needs two or more replacements on the same event).
 *
 * Question: P1 controls Endless Riches + Frigid Jewel + a friendly unit, cards in deck; P1's turn begins.
 * (a) Draw Phase: any draw / Burn Out / Draw-Phase trigger? (b) Meditation without the exhaust (draw 1):
 * first or second card this turn — Jewel? (c) Meditation WITH the exhaust (draw 2): Jewel, how many
 * times? (d) Contrast without Riches. (e) Where does the resolved Meditation go under Riches; any
 * ordering prompt?
 *
 * Expected: (a) nothing — no card drawn, no Burn Out possible, play proceeds Channel → Main. (b) it is
 * P1's FIRST draw → no trigger. (c) two single-card draws → the second is P1's second card → Jewel
 * triggers exactly once (+2 to a friendly unit this turn). (d) without Riches the Draw-Phase card is #1,
 * so plain Meditation is #2 → trigger; exhausted Meditation triggers on its first card only (never on
 * card #3). (e) chain → trash is "from anywhere other than your Main Deck" → banished instead; a single
 * replacement → no ordering decision.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ENDLESS_RICHES = "ven-022-166";
const FRIGID_JEWEL = "unl-074-219";
const MEDITATION = "ogn-048-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla deck filler with a known identity

/**
 * Turn 2, P2 active and about to end the turn. P1: Frigid Jewel, Ally (2 Might) in base, Meditation in
 * hand, known deck d1..d4 on top (harness filler below), optionally Endless Riches. P1's pools are empty —
 * the 2 runes channelled at turn start pay for Meditation.
 */
function board(opts: { riches: boolean; pal?: boolean }) {
  let b = scenario()
    .turn(2)
    .active(P2)
    .gear(P1, FRIGID_JEWEL, "jewel")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, MEDITATION, "med")
    .deck(P1, [FILLER, FILLER, FILLER, FILLER], ["d1", "d2", "d3", "d4"]);
  if (opts.pal) {
    b = b.unit(P1, "base", { might: 3, name: "Pal" }, "pal");
  }
  return opts.riches ? b.gear(P1, ENDLESS_RICHES, "riches") : b;
}

/** P2 ends the turn → P1's turn runs Awaken / Beginning / Channel / (Draw) and settles into P1's open Main Phase; P1 taps both new runes. */
async function p1Main(opts: { riches: boolean; pal?: boolean }): Promise<Game> {
  const game = await board(opts).build();
  expect(game.p1.hand()).toEqual(["med"]);
  expect(game.p1.deck().slice(0, 4)).toEqual(["d1", "d2", "d3", "d4"]);
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  await game.p1.tapRunes(2);
  expect(game.p1.energy()).toBe(2);
  return game;
}

/** Cast Meditation (optionally paying the exhaust with Ally) and pass priority until the chain — including any Jewel trigger — is empty. */
async function meditate(game: Game, exhaust: boolean): Promise<void> {
  if (exhaust) {
    await game.p1.cast("med", { payOptional: true, targets: "ally" });
    expect(game.state("ally").isExhausted).toBe(true); // cost paid as it is played
  } else {
    await game.p1.cast("med");
  }
  expect(game.p1.energy()).toBe(0);
  await game.settle();
}

describe("(a) Endless Riches: the Draw Phase is skipped outright", () => {
  test("P1's turn start with Riches: no card is drawn (hand still just Meditation, d1 still on top), 2 runes channelled, straight into an open Main Phase (443.2, 315.4.b)", async () => {
    const game = await board({ riches: true }).build();
    const deck0 = game.p1.deck().length;
    await game.p2.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toEqual(["med"]);
    expect(game.p1.deck()).toHaveLength(deck0);
    expect(game.p1.deck()[0]).toBe("d1");
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("nothing keys off the skipped phase: no Jewel trigger, Ally still 2, no prompt of any kind (443.2.a)", async () => {
    const game = await board({ riches: true }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.state("ally").might).toBe(2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("no Burn Out can come from a skipped Draw Phase: with an EMPTY Main Deck P1's turn still starts cleanly — P2 gains no point, trash untouched (315.4.b.1 never reached)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks({ main: 0, runes: 12 })
      .gear(P1, ENDLESS_RICHES, "riches")
      .gear(P1, FRIGID_JEWEL, "jewel")
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
      .trash(P1, FILLER, "t1")
      .hand(P1, MEDITATION, "med")
      .build();
    expect(game.p1.deck()).toEqual([]);
    await game.p2.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(0);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.trash()).toEqual(["t1"]); // not recycled into the deck by a Burn Out
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.hand()).toEqual(["med"]);
    expect(game.p1.runes()).toHaveLength(2);
  });

  test("control: WITHOUT Riches the Draw Phase draws d1 (hand = Meditation + d1) — that is P1's first card this turn, so the Jewel stays quiet", async () => {
    const game = await board({ riches: false }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.hand()).toEqual(["med", "d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.state("ally").might).toBe(2);
    expect(game.chain()).toEqual([]);
  });
});

describe("(b) Riches + Meditation WITHOUT the exhaust: draw 1 = P1's FIRST card this turn", () => {
  test("Meditation draws exactly d1; Frigid Jewel does NOT trigger — no chain item, no prompt, Ally stays 2 and ready", async () => {
    const game = await p1Main({ riches: true });
    await meditate(game, false);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.state("ally")).toMatchObject({ isExhausted: false, might: 2, mightModifier: 0 });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) Riches + Meditation WITH the exhaust: 'draw 2' is two draws, the second is P1's second card", () => {
  test("after Meditation resolves (d1, d2 in hand) a triggered Frigid Jewel item is on the chain — exactly one", async () => {
    const game = await p1Main({ riches: true });
    await game.p1.cast("med", { payOptional: true, targets: "ally" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Meditation resolves: draw, draw → trigger
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "jewel", controller: P1, triggered: true })]);
    expect(game.zoneOf("med")).not.toBe("chain");
  });

  test("it resolves once: Ally (the only friendly unit) gets +2 this turn → 4, exhausted from paying the cost; hand = d1, d2; d3 still on top (413.1)", async () => {
    const game = await p1Main({ riches: true });
    await meditate(game, true);
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p1.deck()[0]).toBe("d3");
    expect(game.state("ally")).toMatchObject({ baseMight: 2, isExhausted: true, might: 4, mightModifier: 2 });
    expect(game.state("foe").might).toBe(3);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("with two friendly units the trigger asks P1 to choose 'a friendly unit' — exactly {Ally, Pal}, never the enemy — and only the pick gets +2", async () => {
    const game = await p1Main({ pal: true, riches: true });
    await game.p1.cast("med", { payOptional: true, targets: "ally" });
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : [];
    expect(offered).toEqual(["ally", "pal"]);
    await game.p1.pick("pal");
    await game.settle();
    expect(game.state("pal").might).toBe(5);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("foe").might).toBe(3);
  });

  test("the +2 is 'this turn': gone after the turn passes (Ally back to 2)", async () => {
    const game = await p1Main({ riches: true });
    await meditate(game, true);
    expect(game.state("ally").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("ally")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});

describe("(d) contrast WITHOUT Endless Riches: the Draw-Phase card is #1", () => {
  test("plain Meditation (draw 1) is now P1's SECOND card → Frigid Jewel triggers → Ally 4; hand = d1 (phase) + d2 (Meditation)", async () => {
    const game = await p1Main({ riches: false });
    expect(game.p1.hand()).toEqual(["med", "d1"]);
    await meditate(game, false);
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.state("ally")).toMatchObject({ isExhausted: false, might: 4, mightModifier: 2 });
    expect(game.chain()).toEqual([]);
  });

  test("exhausted Meditation (draw 2): triggers on its first card (#2 of the turn) and NOT again on #3 — exactly one +2 (Ally 4, not 6); hand = d1, d2, d3", async () => {
    const game = await p1Main({ riches: false });
    await game.p1.cast("med", { payOptional: true, targets: "ally" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain().filter((c) => c.cardId === "jewel")).toHaveLength(1); // one trigger, not two
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1", "d2", "d3"]);
    expect(game.state("ally")).toMatchObject({ might: 4, mightModifier: 2 });
    expect(game.chain()).toEqual([]);
  });

  test("side by side: Riches shifts which draw is 'second' — plain Meditation buffs only WITHOUT Riches; exhausted Meditation buffs exactly once either way", async () => {
    const results: Record<string, number> = {};
    for (const riches of [true, false]) {
      for (const exhaust of [false, true]) {
        const game = await p1Main({ riches });
        await meditate(game, exhaust);
        results[`${riches ? "riches" : "plain"}/${exhaust ? "draw2" : "draw1"}`] = game.state("ally").might;
      }
    }
    expect(results).toEqual({ "plain/draw1": 4, "plain/draw2": 4, "riches/draw1": 2, "riches/draw2": 4 });
  });
});

describe("(e) where the resolved Meditation goes", () => {
  test("under Riches: chain → trash is 'from anywhere other than your Main Deck' → Meditation is BANISHED, P1's trash stays empty (370.1.b)", async () => {
    const game = await p1Main({ riches: true });
    await meditate(game, false);
    expect(game.zoneOf("med")).toBe("banishment");
    expect(game.p1.banishment()).toEqual(["med"]);
    expect(game.p1.trash()).toEqual([]);
  });

  test("only ONE replacement applies to that event, so P1 is never asked to order anything — the cast settles straight back to an open Main Phase (372)", async () => {
    const game = await p1Main({ riches: true });
    await game.p1.cast("med");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("med")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });

  test("without Riches the same Meditation simply goes to P1's trash", async () => {
    const game = await p1Main({ riches: false });
    await meditate(game, false);
    expect(game.zoneOf("med")).toBe("trash");
    expect(game.p1.trash()).toEqual(["med"]);
    expect(game.p1.banishment()).toEqual([]);
  });

  test("the drawn cards themselves came from the Main Deck into hand — nothing is banished or trashed by drawing under Riches", async () => {
    const game = await p1Main({ riches: true });
    await meditate(game, true);
    expect(game.p1.banishment()).toEqual(["med"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.zoneOf("d1")).toBe("hand");
    expect(game.zoneOf("d2")).toBe("hand");
  });
});
