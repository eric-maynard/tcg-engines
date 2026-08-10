/**
 * Interaction: Garbage Grabber (ogn-099-298) × Dr. Mundo, Expert (ogn-109-298) — Recycle as a COST vs as an EFFECT
 *
 *   Garbage Grabber — Gear · Mind · 2
 *     "Recycle 3 from your trash, [1], [Exhaust]: Draw 1."
 *   Dr. Mundo, Expert — Champion Unit · Mind · 8 + [mind][mind] · 6 Might (printed)
 *     "My Might is increased by the number of cards in your trash.
 *      At the start of your Beginning Phase, recycle 3 from your trash."
 *
 * Rules: 416.3 (a recycle COST must be completable in full or the ability cannot be activated), 416.4 /
 * 416.6 (a recycle EFFECT does as much as it can), 416.5 (several cards recycled at once go to the bottom
 * in a RANDOM order — the rule's own example is Garbage Grabber — so no ordering decision), 413.1.a (Draw
 * takes the TOP card), 413.4 (Burn Out only when drawing more cards than the deck holds at that moment),
 * 431.1 (Burn Out is about moving cards OUT of an empty Main Deck — never about recycling into it).
 *
 * Question / expected:
 *   (a) trash {T1,T2}, 1 energy: Grabber cannot be activated at all (cost unpayable) — not offered, no
 *       energy spent, stays ready, nothing recycled.
 *   (b) same 2-card trash at the start of P1's Beginning Phase: Mundo's trigger recycles BOTH (as many as
 *       possible); Mundo's Might goes printed+2 → printed+0.
 *   (c) trash {T1..T4}, deck D1..D5: activating with T1,T2,T3 asks for no order; costs first, then Draw 1
 *       draws D1 (top), not a recycled card; deck = D2 D3 D4 D5 + {T1,T2,T3}; trash = {T4}; Mundo
 *       printed+4 → printed+1 immediately.
 *   (d) trash {T1,T2,T3}, deck EMPTY: cost recycles the three into the deck, then Draw 1 takes one of
 *       them — no Burn Out (deck was not empty at draw time), no points change.
 *   (e) trash empty, Beginning Phase: Mundo's trigger recycles 0 and does nothing — no Burn Out.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GARBAGE_GRABBER = "ogn-099-298";
const MUNDO = "ogn-109-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla trash/deck fodder

/** P1's main phase: Mundo + a ready Grabber in base, `energy` in pool, trash T1..Tn. Decks auto-filled unless `deck` given. */
function mainPhase(trash: number, opts: { energy?: number; deck?: readonly string[] | "filled" } = {}) {
  let s = scenario()
    .resources(P1, { energy: opts.energy ?? 1 })
    .unit(P1, "base", MUNDO, "mundo")
    .gear(P1, GARBAGE_GRABBER, "gg");
  const deck = opts.deck ?? "filled";
  if (deck !== "filled") {
    s = s.fillDecks(false).deck(P1, deck.map(() => FILLER), [...deck]);
  }
  for (let i = 1; i <= trash; i++) {
    s = s.trash(P1, FILLER, `t${i}`);
  }
  return s;
}

/** P2 about to end turn 3 → P1's Beginning Phase with Mundo in base and trash T1..Tn. */
function beforeBeginning(trash: number, opts: { deck?: readonly string[] | "filled"; withMundo?: boolean } = {}) {
  let s = scenario().turn(3).active(P2);
  if (opts.withMundo !== false) {
    s = s.unit(P1, "base", MUNDO, "mundo");
  }
  const deck = opts.deck ?? "filled";
  if (deck !== "filled") {
    s = s.fillDecks(false).deck(P1, deck.map(() => FILLER), [...deck]);
    // keep P2 able to take turns / P1 able to channel without touching P1's main deck
    s = s.deck(P2, [FILLER, FILLER, FILLER]).runeDeck(P1, ["fury", "fury"].map((d) => ({ cardType: "rune", domain: d, name: "Fury Rune" })));
  }
  for (let i = 1; i <= trash; i++) {
    s = s.trash(P1, FILLER, `t${i}`);
  }
  return s;
}

describe("Garbage Grabber (recycle as COST) vs Dr. Mundo (recycle as EFFECT)", () => {
  // ── (a) cost must be paid in full ─────────────────────────────────────────────────────────

  test("(a) trash {T1,T2} + 1 energy: Grabber's ability is not even offered (416.3) — activation rejected, no energy spent, Grabber ready, both cards still in trash, deck untouched", async () => {
    const game = await mainPhase(2).build();
    const deck = [...game.p1.deck()];
    expect(game.p1.can("activate", "gg")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "gg")).toBe(false);
    const r = await game.p1.try((p) => p.activate("gg"));
    expect(r.ok).toBe(false);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("gg").isReady).toBe(true);
    expect(game.p1.trash().sort()).toEqual(["t1", "t2"]);
    expect(game.p1.deck()).toEqual(deck);
    expect(game.chain()).toEqual([]);
    // Mundo keeps counting both trash cards.
    expect(game.state("mundo").might).toBe(game.state("mundo").baseMight + 2);
  });

  test("(a) control: the very same board with a third trash card makes the ability legal", async () => {
    const game = await mainPhase(3).build();
    expect(game.p1.can("activate", "gg")).toBe(true);
  });

  // ── (b) Mundo's effect does as much as it can ─────────────────────────────────────────────

  test("(b) 2-card trash at P1's Beginning Phase: Mundo's trigger goes on the chain and, on resolution, recycles BOTH cards to the bottom of P1's deck — no targeting prompt, no fizzle (416.4, 416.6)", async () => {
    const game = await beforeBeginning(2).build();
    const printed = game.state("mundo").baseMight;
    expect(printed).toBe(6);
    expect(game.state("mundo").might).toBe(printed + 2);
    const deck = game.p1.deck().length;
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mundo", controller: P1, triggered: true })]);
    expect(game.p1.trash().sort()).toEqual(["t1", "t2"]); // nothing happens until it resolves
    await game.p1.passPriority();
    await game.p2.passPriority();
    // Resolved (and the turn ran on into P1's main phase, drawing 1 in the Draw step).
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck().slice(-2).sort()).toEqual(["t1", "t2"]);
    expect(game.p1.deck()).toHaveLength(deck + 2 - 1);
    expect(game.state("mundo").might).toBe(printed); // 6+2 → 6+0, continuously
    const s = await game.settle();
    expect(s.reason).toBe("open"); // no pick / order Decision was ever raised
    expect(game.phase()).toBe("main");
  });

  // ── (c) cost first (random order, no prompt), then draw from the TOP ──────────────────────

  test("(c) trash {T1..T4}: the controller chooses WHICH three pay the cost — every 3-subset is offered, exactly 3 required", async () => {
    const game = await mainPhase(4, { deck: ["d1", "d2", "d3", "d4", "d5"] }).build();
    const field = game.p1.option("activateAbility", "gg")?.fields.find((f) => f.arg === "recycle");
    expect(field).toMatchObject({ max: 3, min: 3, required: true });
    const sets = (field?.options as string[][]).map((o) => [...o].sort().join(","));
    expect(sets.sort()).toEqual(["t1,t2,t3", "t1,t2,t4", "t1,t3,t4", "t2,t3,t4"]);
  });

  test("(c) activating with T1,T2,T3: costs are paid at once — the three sit at the deck bottom (unordered, 416.5), T4 stays, 1 energy gone, Grabber exhausted, Mundo already printed+1 — and NO ordering Decision: the next decision is the priority window", async () => {
    const game = await mainPhase(4, { deck: ["d1", "d2", "d3", "d4", "d5"] }).build();
    const printed = game.state("mundo").baseMight;
    expect(game.state("mundo").might).toBe(printed + 4);
    await game.p1.activate("gg", undefined, { params: { recycleIds: ["t1", "t2", "t3"] } });
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gg", controller: P1, triggered: false })]);
    expect(game.p1.deck().slice(0, 5)).toEqual(["d1", "d2", "d3", "d4", "d5"]);
    expect(game.p1.deck().slice(5).sort()).toEqual(["t1", "t2", "t3"]);
    expect(game.p1.trash()).toEqual(["t4"]);
    expect(game.p1.energy()).toBe(0);
    expect(game.state("gg").isExhausted).toBe(true);
    expect(game.state("mundo").might).toBe(printed + 1); // continuous: drops the moment the cost is paid
    expect(game.p1.hand()).toEqual([]); // the draw is the EFFECT — not yet
  });

  test("(c) on resolution 'Draw 1' draws D1 from the TOP (413.1.a), never one of the just-recycled three; deck = D2 D3 D4 D5 + {T1,T2,T3}; trash = {T4}; Mundo printed+1", async () => {
    const game = await mainPhase(4, { deck: ["d1", "d2", "d3", "d4", "d5"] }).build();
    const printed = game.state("mundo").baseMight;
    await game.p1.activate("gg", undefined, { params: { recycleIds: ["t1", "t2", "t3"] } });
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck().slice(0, 4)).toEqual(["d2", "d3", "d4", "d5"]);
    expect(game.p1.deck().slice(4).sort()).toEqual(["t1", "t2", "t3"]);
    expect(game.p1.deck()).toHaveLength(7);
    expect(game.p1.trash()).toEqual(["t4"]);
    expect(game.state("mundo").might).toBe(printed + 1);
    expect(game.state("gg")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("(c) 416.5: across seeds the three recycled cards land at the bottom in more than one order (random, not trash order / not chosen)", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 24 && seen.size < 2; i++) {
      const game = await mainPhase(4, { deck: ["d1", "d2", "d3", "d4", "d5"] }).seed(`gg-${i}`).build();
      await game.p1.activate("gg", undefined, { params: { recycleIds: ["t1", "t2", "t3"] } });
      seen.add(game.p1.deck().slice(5).join(","));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  // ── (d) recycling INTO an empty deck, then drawing from it ────────────────────────────────

  test("(d) trash {T1,T2,T3}, Main Deck EMPTY: the ability is legal; paying the cost refills the deck with exactly those three (trash empty) before anything is drawn", async () => {
    const game = await mainPhase(3, { deck: [] }).build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.can("activate", "gg")).toBe(true);
    await game.p1.activate("gg");
    expect([...game.p1.deck()].sort()).toEqual(["t1", "t2", "t3"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.chain()).toHaveLength(1);
  });

  test("(d) …then Draw 1 takes the top one of those three — NO Burn Out (413.4: the deck is not empty at draw time): hand +1 ∈ {T1,T2,T3}, deck 2, trash empty, nobody's points move, Mundo back to printed Might", async () => {
    const game = await mainPhase(3, { deck: [] }).build();
    const printed = game.state("mundo").baseMight;
    expect(game.state("mundo").might).toBe(printed + 3);
    await game.p1.activate("gg");
    const topAfterCost = game.p1.deck()[0];
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(["t1", "t2", "t3"]).toContain(game.p1.hand()[0] as string);
    expect(game.p1.hand()[0]).toBe(topAfterCost as string);
    expect(game.p1.deck()).toHaveLength(2);
    expect(game.p1.trash()).toEqual([]); // a Burn Out would have shuffled nothing anyway — but see points:
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0); // Burn Out hands the OPPONENT a point; none here
    expect(game.state("mundo").might).toBe(printed);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // ── (e) recycling 0 into an empty deck is not a Burn Out ──────────────────────────────────

  test("(e) trash EMPTY at P1's Beginning Phase: Mundo's trigger still goes on the chain and resolves doing nothing — no prompt, trash/deck order untouched, no point to anyone (416.4/416.6, 431.1)", async () => {
    // One known card in the deck so the ordinary Draw step that follows is not itself a Burn Out.
    const game = await beforeBeginning(0, { deck: ["d1"] }).build();
    expect(game.p1.trash()).toEqual([]);
    expect(game.state("mundo").might).toBe(game.state("mundo").baseMight);
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mundo", triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]);
    await game.p2.passPriority(); // resolves: recycle as many as possible = 0
    const s = await game.settle();
    expect(s.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.turnPlayer()).toBe(P1);
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]); // no Burn Out point for P2
    expect(game.p1.hand()).toEqual(["d1"]); // the Draw step drew the one real card, normally
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.isOver()).toBe(false);
  });

  test("(e) trash empty AND deck empty: whatever the later Draw step does to an empty deck, Mundo's recycle-0 adds nothing to it — the outcome is identical with and without Mundo on the board (431.1: recycling INTO a deck never burns out)", async () => {
    const withMundo = await beforeBeginning(0, { deck: [] }).build();
    await withMundo.p2.endTurn();
    expect(withMundo.chain()).toEqual([expect.objectContaining({ cardId: "mundo", triggered: true })]);
    await withMundo.p1.passPriority();
    expect([withMundo.p1.points(), withMundo.p2.points()]).toEqual([0, 0]); // nothing yet while it is pending
    await withMundo.settle();

    const without = await beforeBeginning(0, { deck: [], withMundo: false }).build();
    await without.p2.endTurn();
    expect(without.chain()).toEqual([]);
    await without.settle();

    expect([withMundo.p1.points(), withMundo.p2.points()]).toEqual([without.p1.points(), without.p2.points()]);
    expect(withMundo.isOver()).toBe(without.isOver());
    expect(withMundo.p1.trash()).toEqual([]);
  });
});
