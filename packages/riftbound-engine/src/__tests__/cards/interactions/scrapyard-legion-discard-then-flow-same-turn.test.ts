/**
 * Interaction: Scrapyard Champion (ogn-020-298) · Unit · Fury · 5 + [fury] · 5 Might
 *     "[Legion] — When you play me, discard 2, then draw 2. (Get the effect if you've played another
 *      card this turn.)"
 *   × Onslaught (ven-081-166) · Spell · Body · 4 · "Give a unit +6 [Might] this turn. [Flow] [4]"
 *   × Dredge Up (ven-049-166) · Spell · Mind · 2 · "Draw 1. [Flow] [2] (You may play this from your
 *     trash for its Flow cost. Then banish it.)"
 *
 * Question: Flow permission for a spell that hits the trash mid-turn vs one already there, gated behind
 * a Legion trigger. P1's turn, Open state, plenty of energy. Trash already holds one Dredge Up ("old").
 * Hand: Scrapyard Champion, Onslaught, a second Dredge Up ("new"), one filler card.
 *   (a) Scrapyard as P1's FIRST card — does discard/draw happen at all?
 *   (b) Instead: cast the new Dredge Up from HAND first (where does it go — trash or banishment?), then
 *       Scrapyard (Legion on) → trigger → discard Onslaught + filler, draw 2.
 *   (c) Same turn, Open state again: may P1 Flow (i) the old Dredge Up, (ii) the Dredge Up that resolved
 *       from hand this turn, (iii) the Onslaught DISCARDED this turn? Costs, destinations, re-Flow?
 *   (d) Timing: Flow Onslaught in RESPONSE to Scrapyard's trigger, or on P2's turn?
 *
 * Rules: 812.1.c / 727.1.c.1 (Legion-dependent trigger is Inactive unless ANOTHER card was finalized
 * this turn — an Inactive triggered ability is not evaluated), 383.4.a.2 (a "when you play me" trigger
 * pends after the permanent enters), 359.3.e.11 (discard as much as possible), 829.1.b (Flow: "you may
 * play this from your trash for [cost]" — a static permission with no arrival-time condition),
 * 829.1.b.1 (played via Flow → banish it as it leaves the chain; ONLY then), 829.1.b.2 (Flow changes
 * only the zone played from, never the timing: no Action/Reaction → your turn, Open state, empty chain),
 * 829.1.c.1 / 356.1.a (the Flow cost is an alternate cost replacing the base cost), 419.1.a (each Flow
 * play is a played/finalized card), 155 (banishment ≠ trash → no re-Flow).
 *
 * Expected: (a) nothing — Scrapyard enters exhausted, no chain item, no discard, no draw. (b) hand-cast
 * Dredge Up: pay 2, draw 1, → TRASH. Scrapyard: pay 5+[fury], Legion active → trigger on the chain, P2
 * gets a window, resolves: discard 2 (P1 picks Onslaught + filler) then draw 2. (c) all three are
 * Flow-able right now, any order, each its own Open-state play: old Dredge [2] → draw → BANISHED; new
 * Dredge [2] → draw → banished; Onslaught [4] → +6 to a unit this turn → banished. Banished → never
 * again. (d) No: while the trigger is on the chain P1 may only pass (and Onslaught is still in HAND until
 * the trigger resolves); on P2's turn P1 has no Flow play at all.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SCRAPYARD_CHAMPION = "ogn-020-298";
const ONSLAUGHT = "ven-081-166";
const DREDGE_UP = "ven-049-166";
const FILLER = { cardType: "unit", energyCost: 9, might: 1, name: "Filler Card" };

const START_ENERGY = 20;

/**
 * P1's turn 2, Open state. 20 energy + 2 fury (everything affordable several times over). Trash: the OLD
 * Dredge Up. Hand: Scrapyard, Onslaught, the NEW Dredge Up, one filler. A vanilla 2-Might Buddy in base
 * is Onslaught's eventual recipient. bf1 exists only so the map is not empty.
 */
function board() {
  return scenario()
    .resources(P1, { energy: START_ENERGY, power: { fury: 2 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .trash(P1, DREDGE_UP, "oldDredge")
    .hand(P1, SCRAPYARD_CHAMPION, "scrap")
    .hand(P1, ONSLAUGHT, "onslaught")
    .hand(P1, DREDGE_UP, "newDredge")
    .hand(P1, FILLER, "filler");
}

const flowOffered = (game: Game, card: string) => game.p1.option("cast", card)?.fields.find((f) => f.arg === "flow")?.options;

function targetsOffered(game: Game, card: string): string[] {
  const field = game.p1.option("cast", card)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/** (b) line: new Dredge Up from hand → resolves; Scrapyard → trigger; both pass → P1 discards Onslaught + filler, draws 2. */
async function dredgeThenScrapyard(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("newDredge");
  await game.settle();
  await game.p1.play("scrap");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scrap", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick("onslaught", "filler");
  const r = await game.settle();
  expect(r.reason).toBe("open");
  return game;
}

describe("(a) Scrapyard Champion as the FIRST card of the turn — Legion Inactive", () => {
  test("pays 5 + [fury], enters the base exhausted, and NOTHING else happens: no chain item, no discard prompt, no draw; hand = the other three cards, trash = only the old Dredge Up (812.1.c / 727.1.c.1)", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.state("scrap")).toMatchObject({ energyCost: 5, powerCost: ["fury"] });
    await game.p1.play("scrap");
    expect(game.p1.resources()).toEqual({ energy: START_ENERGY - 5, power: { fury: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.state("scrap")).toMatchObject({ isExhausted: true, might: 5, zone: "base" });
    expect(game.p1.hand().sort()).toEqual(["filler", "newDredge", "onslaught"]);
    expect(game.p1.trash()).toEqual(["oldDredge"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Dredge Up from HAND first, then Scrapyard with Legion active", () => {
  test("hand-cast Dredge Up: from the hand it is a plain cast (no Flow flag offered), pays its base 2, draws 1 on resolution and goes to the TRASH — not banishment (829.1.b.1 applies only to a Flow play)", async () => {
    const game = await board().build();
    expect(flowOffered(game, "newDredge")).toBeUndefined();
    const hand = game.p1.hand().length;
    await game.p1.cast("newDredge");
    expect(game.p1.energy()).toBe(START_ENERGY - 2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["newDredge"]);
    await game.settle();
    expect(game.zoneOf("newDredge")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.p1.trash().sort()).toEqual(["newDredge", "oldDredge"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });

  test("Scrapyard second: Legion is now Active → after it ENTERS the base its play trigger is on the chain (383.4.a.2); P1 has priority first, then P2 gets a real response window before anything is discarded", async () => {
    const game = await board().build();
    await game.p1.cast("newDredge");
    await game.settle();
    await game.p1.play("scrap");
    expect(game.p1.resources()).toEqual({ energy: START_ENERGY - 2 - 5, power: { fury: 1 } });
    expect(game.state("scrap")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "scrap", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    // nothing discarded yet
    expect(game.zoneOf("onslaught")).toBe("hand");
    expect(game.zoneOf("filler")).toBe("hand");
  });

  test("resolution: P1 is asked which 2 to discard from the current hand (Onslaught, filler, the Dredge-drawn card); picking Onslaught + filler puts both in the trash, THEN 2 are drawn → hand size 3 − 2 + 2 = 3", async () => {
    const game = await board().build();
    await game.p1.cast("newDredge");
    await game.settle();
    const drawn = game.p1.hand().find((c) => !["scrap", "onslaught", "filler"].includes(c)) as string;
    expect(drawn).toBeDefined();
    await game.p1.play("scrap");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual([drawn, "filler", "onslaught"].sort());
    const deckBefore = game.p1.deck().length;
    await game.p1.pick("onslaught", "filler");
    await game.settle();
    expect(game.zoneOf("onslaught")).toBe("trash");
    expect(game.zoneOf("filler")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["filler", "newDredge", "oldDredge", "onslaught"]);
    expect(game.p1.hand()).toHaveLength(3);
    expect(game.p1.hand()).toContain(drawn);
    expect(game.p1.deck()).toHaveLength(deckBefore - 2);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) same turn, Open state again — all three trash spells are Flow-able, no arrival-time restriction (829.1.b)", () => {
  test("(i) the OLD Dredge Up (in trash since before the turn): offered only as a Flow play, costs [2], draws 1, and is BANISHED as it leaves the chain (829.1.b.1)", async () => {
    const game = await dredgeThenScrapyard();
    expect(game.p1.can("cast", "oldDredge")).toBe(true);
    expect(flowOffered(game, "oldDredge")).toEqual([true]);
    const hand = game.p1.hand().length;
    const energy = game.p1.energy();
    await game.p1.cast("oldDredge", { flow: true });
    expect(game.p1.energy()).toBe(energy - 2);
    expect(game.zoneOf("oldDredge")).toBe("chain");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.zoneOf("oldDredge")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("oldDredge");
  });

  test("(ii) the NEW Dredge Up that resolved from hand minutes ago is JUST as Flow-able this same turn: [2], draws 1 again (that physical card drew twice for 4 energy total), banished", async () => {
    const game = await dredgeThenScrapyard();
    expect(game.zoneOf("newDredge")).toBe("trash");
    expect(game.p1.can("cast", "newDredge")).toBe(true);
    expect(flowOffered(game, "newDredge")).toEqual([true]);
    const hand = game.p1.hand().length;
    const energy = game.p1.energy();
    await game.p1.cast("newDredge", { flow: true });
    expect(game.p1.energy()).toBe(energy - 2);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.zoneOf("newDredge")).toBe("banishment");
  });

  test("(iii) the Onslaught DISCARDED this turn is Flow-able immediately for [4] (energy only, replacing its base 4): offers P1's units, gives Buddy +6 this turn (2 → 8), and is banished; the +6 is gone next turn", async () => {
    const game = await dredgeThenScrapyard();
    expect(game.zoneOf("onslaught")).toBe("trash");
    expect(game.p1.can("cast", "onslaught")).toBe(true);
    expect(flowOffered(game, "onslaught")).toEqual([true]);
    expect(targetsOffered(game, "onslaught").sort()).toEqual(["buddy", "scrap"]);
    const before = game.p1.resources();
    await game.p1.cast("onslaught", { flow: true, targets: "buddy" });
    expect(game.p1.resources()).toEqual({ energy: before.energy - 4, power: before.power });
    await game.settle();
    expect(game.state("buddy").might).toBe(8);
    expect(game.zoneOf("onslaught")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("onslaught");
    await game.advanceTurn();
    expect(game.state("buddy").might).toBe(2);
    expect(game.zoneOf("onslaught")).toBe("banishment");
  });

  test("any order works and each Flow play is its own finalized card: Onslaught first, then both Dredge Ups → all three banished, Buddy 8, +2 cards, 2+2+4 = 8 energy spent, cardsPlayedThisTurn 2 → 5 (419.1.a)", async () => {
    const game = await dredgeThenScrapyard();
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2); // Dredge Up + Scrapyard
    const hand = game.p1.hand().length;
    const energy = game.p1.energy();
    await game.p1.cast("onslaught", { flow: true, targets: "buddy" });
    await game.settle();
    await game.p1.cast("newDredge", { flow: true });
    await game.settle();
    await game.p1.cast("oldDredge", { flow: true });
    await game.settle();
    expect(game.p1.energy()).toBe(energy - 8);
    expect(game.p1.hand()).toHaveLength(hand + 2);
    expect(game.state("buddy").might).toBe(8);
    expect(game.p1.banishment().sort()).toEqual(["newDredge", "oldDredge", "onslaught"]);
    expect(game.p1.trash()).toEqual(["filler"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(5);
    expect(game.violations()).toEqual([]);
  });

  test("no loop: once Flowed-and-banished neither Dredge Up nor Onslaught is castable again (banishment is not the trash)", async () => {
    const game = await dredgeThenScrapyard();
    await game.p1.cast("oldDredge", { flow: true });
    await game.settle();
    await game.p1.cast("onslaught", { flow: true, targets: "scrap" });
    await game.settle();
    expect(game.zoneOf("oldDredge")).toBe("banishment");
    expect(game.zoneOf("onslaught")).toBe("banishment");
    expect(game.p1.energy()).toBeGreaterThanOrEqual(4); // affordability is not the reason
    expect(game.p1.can("cast", "oldDredge")).toBe(false);
    expect(game.p1.can("cast", "onslaught")).toBe(false);
    expect((await game.p1.try((p) => p.cast("oldDredge", { flow: true }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("onslaught", { flow: true, targets: "buddy" }))).ok).toBe(false);
    expect(game.state("scrap").might).toBe(11);
  });
});

describe("(d) Flow grants no timing (829.1.b.2)", () => {
  test("while Scrapyard's trigger is on the chain P1's only move is to pass: the old Dredge Up (already in trash) cannot be Flowed in response, and Onslaught is not even in the trash yet — it is still in HAND until the trigger RESOLVES", async () => {
    const game = await board().build();
    await game.p1.cast("newDredge");
    await game.settle();
    await game.p1.play("scrap");
    expect(game.chain()).toHaveLength(1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.zoneOf("onslaught")).toBe("hand");
    expect(game.zoneOf("oldDredge")).toBe("trash");
    expect(game.p1.can("cast", "oldDredge")).toBe(false);
    expect(game.p1.can("cast", "newDredge")).toBe(false);
    expect(game.p1.can("cast", "onslaught")).toBe(false); // no Action/Reaction from hand either
    expect(game.p1.legal().map((o) => o.verb).sort()).toEqual(["concede", "passPriority"]);
    expect((await game.p1.try((p) => p.cast("oldDredge", { flow: true }))).ok).toBe(false);
    expect(game.zoneOf("oldDredge")).toBe("trash");
    // P2's look at the same chain: P1 still cannot sneak a Flow play in.
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.legal()).toEqual([]);
    // Only once the trigger has resolved (Onslaught discarded, chain empty, Open state) does Flow open up.
    await game.p2.passPriority();
    await game.p1.pick("onslaught", "filler");
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("onslaught")).toBe("trash");
    expect(game.p1.can("cast", "onslaught")).toBe(true);
    expect(game.p1.can("cast", "oldDredge")).toBe(true);
  });

  test("on P2's turn P1 has Onslaught + Dredge Up in the trash and 20 energy — and no legal play whatsoever: Flow spells without Action/Reaction wait for P1's own Open state", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: START_ENERGY })
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .trash(P1, DREDGE_UP, "oldDredge")
      .trash(P1, ONSLAUGHT, "onslaught")
      .build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("cast", "oldDredge")).toBe(false);
    expect(game.p1.can("cast", "onslaught")).toBe(false);
    expect(game.p1.legal()).toEqual([]);
    expect((await game.p1.try((p) => p.cast("onslaught", { flow: true, targets: "buddy" }))).ok).toBe(false);
    expect(game.zoneOf("onslaught")).toBe("trash");
    // …and the moment it is P1's turn again (with energy in the pool — pools emptied at end of turn) both light up.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    await game.p1.do("addResources", { energy: 4 });
    expect(game.p1.can("cast", "oldDredge")).toBe(true);
    expect(game.p1.can("cast", "onslaught")).toBe(true);
  });
});
