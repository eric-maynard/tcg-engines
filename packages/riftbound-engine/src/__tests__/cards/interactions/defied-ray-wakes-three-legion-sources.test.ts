/**
 * Interaction: one countered spell vs THREE Legion sources (gear, legend, unit in hand).
 *   Sun Disc (ogn-021-298) · Gear · Fury — "[Exhaust]: [Legion] — The next unit you play this turn enters ready."
 *   × Vanguard Captain (ogn-218-298) · Unit · Order · 3+[order] · 3 Might
 *     "[Legion] — When you play me, play two 1 [Might] Recruit unit tokens here."
 *   × Hand of Noxus (ogn-253-298) · Legend (Darius) — "[Exhaust]: [Reaction], [Legion] — [Add] [1]."
 *   with Hextech Ray (ogn-009-298, 1+[fury], "Deal 3 to a unit at a battlefield") as the card P1 plays and
 *   Defy (ogn-045-298, Reaction, "Counter a spell that costs no more than [4]…") as P2's answer.
 *
 * Rules: 812.1.c (Legion is Active once a DIFFERENT card has been Finalized by you this turn), 812.2 (one card
 * satisfies every Legion instance you control), 419.4.a.1 vs 419.4.b (triggers on 'played' skip a countered
 * card, but non-triggered checks reference FINALIZATION — the rule's own example: spell countered by Defy →
 * Legion active), 425.1.b / 425.1.c, 727.1.b / 727.1.c.1 / 727.1.c.1.a (an Inactive dependent trigger is not
 * evaluated; one that is Active as its condition is met triggers), 727.1.c.3, 429.3.a ([Add] resolves at once),
 * 383.4.a.2, 143.4 (units enter exhausted unless something says otherwise).
 *
 * Question. P1's turn, nothing played yet. P1: Hand of Noxus (ready), Sun Disc (ready, played last turn), hand
 * = Hextech Ray + Vanguard Captain, pool 3 energy + [fury] + [order] (Ray 1+fury; Captain 3+order needs the
 * legend's [1]). P1 holds bf1. P2: a unit at bf2, Defy in hand.
 *   (a) Before any card: no Legion anywhere — Sun Disc / Hand of Noxus give nothing; Captain would enter
 *       exhausted with NO Recruits.
 *   (b) Ray cast, Defied (trash, no damage): Ray was FINALIZED → every P1 Legion instance is Active (Reading 2).
 *   (c) Exhaust Sun Disc (live), exhaust Hand of Noxus (+1 now), play Captain to bf1: enters READY, its Legion
 *       trigger fires → P2 gets a window → two 1-Might Recruits at bf1, which enter EXHAUSTED (Sun Disc named
 *       only 'the next unit'). Ray in P1's trash, Defy in P2's, P2's unit undamaged.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SUN_DISC = "ogn-021-298";
const VANGUARD_CAPTAIN = "ogn-218-298";
const HAND_OF_NOXUS = "ogn-253-298";
const HEXTECH_RAY = "ogn-009-298";
const DEFY = "ogn-045-298";

/**
 * P1's turn 2, Neutral Open, nothing played. P1: legend Hand of Noxus, Sun Disc ready in base, a 2-Might
 * Holder keeping bf1, hand Ray + Captain, pool {3, fury 1, order 1}. P2: 5-Might Foe at bf2, Defy + {1, calm 1}.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .legend(P1, HAND_OF_NOXUS, "hon")
    .gear(P1, SUN_DISC, "disc")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 5, name: "Foe" }, "foe")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, VANGUARD_CAPTAIN, "cap")
    .hand(P2, DEFY, "defy");
}

/** P1 casts Ray at Foe, P2 answers with Defy, both resolve (Ray countered). Back in P1's Neutral Open. */
async function rayGetsDefied(b = board()): Promise<Game> {
  const game = await b.build();
  await game.p1.cast("ray", { targets: "foe" });
  await game.p1.passPriority();
  await game.p2.cast("defy", { targets: "ray" });
  await game.settle();
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

/** Recruit tokens P1 has at `loc`. */
function recruitsAt(game: Game, loc: string): string[] {
  return game.p1.units(loc).filter((u) => game.state(u).name === "Recruit");
}

describe("(a) before any card this turn every Legion instance is Inactive (812.1.c, 727.1.b)", () => {
  test("neither Sun Disc nor Hand of Noxus is even offered (no live text to activate); the pool is untouched", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.state("disc").isReady).toBe(true);
    expect(game.state("hon").isReady).toBe(true);
    expect(game.p1.can("activate", "disc")).toBe(false);
    expect(game.p1.can("activate", "hon")).toBe(false);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1, order: 1 } });
  });

  test("Vanguard Captain played as the FIRST card (4 energy given): enters bf1 EXHAUSTED and its Legion trigger is not even evaluated — no chain item, no Recruits (727.1.c.1, 143.4)", async () => {
    const game = await board().resources(P1, { energy: 4, power: { fury: 1, order: 1 } }).build();
    await game.p1.play("cap", { to: "bf1" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.zoneOf("cap")).toBe("battlefield-bf1");
    expect(game.state("cap").isExhausted).toBe(true);
    expect(recruitsAt(game, "bf1")).toEqual([]);
    expect(game.p1.units("bf1").sort()).toEqual(["cap", "holder"]);
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
  });
});

describe("(b) Ray is Defied: countered, yet FINALIZED — Reading 2 (419.4.b, 812.1.c, 812.2)", () => {
  test("setup: Ray countered → P1's trash, Defy → P2's trash, Foe undamaged, costs not refunded (425.1.c): P1 at {2, fury 0, order 1}", async () => {
    const game = await rayGetsDefied();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("ray").owner).toBe(P1);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.state("foe").damage).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0, order: 1 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1); // finalized = played, for non-triggered checks
  });

  test("that ONE countered card switches on BOTH permanents' Legion at once: Sun Disc and Hand of Noxus are now offered (812.2)", async () => {
    const game = await rayGetsDefied();
    expect(game.p1.can("activate", "disc")).toBe(true);
    expect(game.p1.can("activate", "hon")).toBe(true);
  });
});

describe("(c) cash in all three: Sun Disc → Hand of Noxus → Vanguard Captain to bf1", () => {
  test("Sun Disc: exhausts (no resource cost), its ability goes on the chain, P2 may respond, it resolves — nothing visible yet (a 'next unit' effect is set up)", async () => {
    const game = await rayGetsDefied();
    await game.p1.activate("disc");
    expect(game.state("disc").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 0, order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc", controller: P1, triggered: false, type: "ability" })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "disc")).toBe(false); // spent for the turn
  });

  test("Hand of Noxus: exhaust → [Add] [1] resolves immediately (429.3.a) — energy 2 → 3, no chain item, P1 keeps the action; without it the Captain (3+[order]) was unaffordable", async () => {
    const game = await rayGetsDefied();
    expect(game.p1.can("play", "cap")).toBe(false); // 2 energy < 3
    await game.p1.activate("hon");
    expect(game.state("hon").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0, order: 1 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("play", "cap")).toBe(true); // the added [1] is part of the payment
  });

  test("Captain to bf1 after both: pays 3+[order] (→ 0/0/0), enters READY via Sun Disc, and — Legion being Active as its own play completes — its trigger IS on the chain (727.1.c.1.a, 383.4.a.2)", async () => {
    const game = await rayGetsDefied();
    await game.p1.activate("disc");
    await game.settle();
    await game.p1.activate("hon");
    await game.p1.play("cap", { to: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.zoneOf("cap")).toBe("battlefield-bf1");
    expect(game.state("cap").isReady).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cap", controller: P1, triggered: true, type: "ability" })]);
    expect(recruitsAt(game, "bf1")).toEqual([]); // not before resolution
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("P2 gets a reaction window on the Recruit trigger; both pass → two 1-Might Recruit tokens are played AT bf1 and enter EXHAUSTED (Sun Disc covered only 'the next unit' = Captain, 143.4)", async () => {
    const game = await rayGetsDefied();
    await game.p1.activate("disc");
    await game.settle();
    await game.p1.activate("hon");
    await game.p1.play("cap", { to: "bf1" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    const recruits = recruitsAt(game, "bf1");
    expect(recruits).toHaveLength(2);
    for (const r of recruits) {
      expect(game.state(r)).toMatchObject({ controller: P1, isExhausted: true, isToken: true, location: "bf1", might: 1 });
    }
    expect(recruitsAt(game, "base")).toEqual([]); // 'here' = where the Captain was played
    expect(game.state("cap").isReady).toBe(true);
    expect(game.p1.units("bf1")).toHaveLength(4); // holder, cap, 2 recruits
  });

  test("end state of the whole line: Ray in P1's trash, Defy in P2's trash, Foe undamaged, disc + legend exhausted, P1 pool empty, back in P1's Neutral Open with no violations", async () => {
    const game = await rayGetsDefied();
    await game.p1.activate("disc");
    await game.settle();
    await game.p1.activate("hon");
    await game.p1.play("cap", { to: "bf1" });
    await game.settle();
    expect(game.p1.trash()).toContain("ray");
    expect(game.p2.trash()).toContain("defy");
    expect(game.state("foe")).toMatchObject({ damage: 0, location: "bf2" });
    expect(game.state("disc").isExhausted).toBe(true);
    expect(game.state("hon").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0, order: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2); // Ray + Captain; activations and tokens-by-effect aside
    expect(game.violations()).toEqual([]);
  });

  test("order does not matter: Hand of Noxus BEFORE Sun Disc gives the same result (Captain ready, two exhausted Recruits)", async () => {
    const game = await rayGetsDefied();
    await game.p1.activate("hon");
    expect(game.p1.energy()).toBe(3);
    await game.p1.activate("disc");
    await game.settle();
    await game.p1.play("cap", { to: "bf1" });
    await game.settle();
    expect(game.state("cap").isReady).toBe(true);
    expect(recruitsAt(game, "bf1")).toHaveLength(2);
    expect(recruitsAt(game, "bf1").every((r) => game.state(r).isExhausted)).toBe(true);
  });

  test("contrast: skip Sun Disc → the Captain enters EXHAUSTED but (Legion still Active from the Defied Ray) the Recruits still come", async () => {
    const game = await rayGetsDefied();
    await game.p1.activate("hon");
    await game.p1.play("cap", { to: "bf1" });
    await game.settle();
    expect(game.state("cap").isExhausted).toBe(true);
    expect(recruitsAt(game, "bf1")).toHaveLength(2);
    expect(game.state("disc").isReady).toBe(true);
  });
});

describe("Sun Disc's effect chooses nothing — 'the next unit you play' is not a target (355.10.c)", () => {
  // Expected: "The next unit you play this turn enters ready" sets up a replacement on a FUTURE play; it names
  // no object on the board, so the activation needs no friendly unit present and its chain item carries no
  // target. Actual: the ability is modelled with `target: { controller: friendly, type: unit }` — with no
  // friendly unit on the board it is not offered at all (so the Captain, P1's only unit-to-be, enters
  // exhausted), and with several it demands an irrelevant pick.
  test("with NO friendly unit on the board (Legion met) Sun Disc is still activatable and makes the next unit (Captain, to base) enter ready", async () => {
    const bare = scenario()
      .resources(P1, { energy: 3, power: { fury: 1, order: 1 } })
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .legend(P1, HAND_OF_NOXUS, "hon")
      .gear(P1, SUN_DISC, "disc")
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 5, name: "Foe" }, "foe")
      .hand(P1, HEXTECH_RAY, "ray")
      .hand(P1, VANGUARD_CAPTAIN, "cap")
      .hand(P2, DEFY, "defy");
    const game = await rayGetsDefied(bare);
    expect(game.p1.can("activate", "hon")).toBe(true); // Legion IS met (control)
    expect(game.p1.can("activate", "disc")).toBe(true);
    await game.p1.activate("disc");
    await game.settle();
    await game.p1.activate("hon");
    await game.p1.play("cap", { to: "base" });
    await game.settle();
    expect(game.state("cap").isReady).toBe(true);
    expect(recruitsAt(game, "base")).toHaveLength(2);
  });

  test("with two friendly units on the board Sun Disc activates WITHOUT asking for a target, and its chain item names none", async () => {
    const game = await rayGetsDefied(board().unit(P1, "base", { might: 1, name: "Bystander" }, "by"));
    const fields = game.p1.option("activate", "disc")?.fields ?? [];
    expect(fields.find((f) => f.name === "targets")).toBeUndefined();
    await game.p1.activate("disc"); // must not throw AMBIGUOUS_ACTION for a target
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "disc" })]);
    expect(game.chain()[0]?.targets ?? []).toEqual([]);
  });
});
