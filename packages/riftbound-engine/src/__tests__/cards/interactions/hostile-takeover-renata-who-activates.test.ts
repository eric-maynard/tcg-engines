/**
 * Interaction: Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow][rainbow] · Action
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other enemies are
 *      there. Otherwise, conquer.) Lose control of that unit and recall it at end of turn."
 *   × Renata Glasc, Mastermind (sfd-088-221) · Champion Unit · Mind · 5 · 4 Might
 *     "[1][mind]: Draw 1. / [4][mind][mind][mind][mind], [Exhaust]: Score 1 point. /
 *      Use my abilities only while I'm at a battlefield."
 *
 * Question: P1's turn. P2's Renata is P2's only unit at bf1 (P2's). P1 resolves Hostile Takeover on her
 * (take control, ready, conquer bf1; lose control + recall at end of turn).
 *   (a) While P1 controls Renata at bf1 — whose legal actions list her two activated abilities, whose
 *       pool pays, who draws / who scores?
 *   (b) Can P2 — her OWNER — activate either ability during this turn?
 *   (c) P1 activates "Draw 1" and P2 reacts by taking control back while the ability is on the chain —
 *       who draws?
 *   (d) After the end-of-turn "lose control and recall", on P2's turn with Renata in P2's base — are the
 *       abilities listed for P2?
 *
 * Rules: 191.4.a (an ability's controller is its source's controller), 191.4.c–e (that player chooses
 * targets/modes and PAYS COSTS; the implied "you" is the ability's controller), 191.4.b (a later change
 * of control of the source does not change control of the ability), 377.2.b ("use only while I'm at a
 * battlefield" is a condition on activating), 381 (activated abilities: controller's turn, Open State),
 * 404.1 (costs are paid at activation), 406.4 (opponents may React before resolution), 317.1 + 455/456
 * (end of turn: lose control, Recall to base — not a Move).
 *
 * Expected: (a) both abilities appear only for P1; P1's pool pays; P1 draws; P1 exhausts her and scores.
 * (b) No — P2 neither controls the source nor is it P2's turn. (c) P1 still draws; the cost stays paid.
 * (d) Not listed — she is in P2's base, so the at-a-battlefield use condition fails.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HOSTILE_TAKEOVER = "sfd-202-221";
const RENATA = "sfd-088-221";
const DRAW = 0;
const SCORE = 1;

/**
 * Inline 0-cost Reaction spell for P2: "Take control of an enemy unit." — the only way to change
 * control of Renata at Reaction speed while P1's ability sits on the chain (facet c, 191.4.b).
 */
const USURP = {
  abilities: [{ effect: { target: { controller: "enemy", type: "unit" }, type: "take-control" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "mind",
  energyCost: 0,
  name: "Test Usurp",
  timing: "reaction",
};

/**
 * P1's turn 2. bf1 is P2's, holding only P2's ready Renata. P1 has exactly HT (5 + 2 rainbow, paid from
 * mind) + Draw (1 + mind) + Score (4 + mind×4) = 10 energy / 7 mind. P2 floats 5 energy / 5 mind — more
 * than enough for either ability, were P2 allowed to use them.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { mind: 7 } })
    .resources(P2, { energy: 5, power: { mind: 5 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", RENATA, "renata")
    .hand(P1, HOSTILE_TAKEOVER, "ht")
    .hand(P2, USURP, "usurp");
}

/** HT on Renata → resolves → the unopposed steal opens a Non-Combat Showdown (handed back once) → P1 conquers bf1. */
async function stolen(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("ht", { targets: "renata" });
  expect(game.p1.resources()).toEqual({ energy: 5, power: { mind: 5 } });
  await game.settle(); // HT resolves; auto-begun Non-Combat Showdown handed back
  await game.settle(); // Focus passes → conquer
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  return game;
}

const activations = (game: Game, seat: "p1" | "p2") =>
  game[seat]
    .legal()
    .filter((o) => o.verb === "activate" && o.card === "renata")
    .map((o) => o.key)
    .sort();

describe("Hostile Takeover × Renata Glasc, Mastermind — who activates a stolen unit's abilities", () => {
  // ---- setup ------------------------------------------------------------------------------------------

  test("setup: after HT resolves Renata is P1-controlled (owner P2), READY, still at bf1; P1 conquered bf1 for +1", async () => {
    const game = await stolen();
    expect(game.state("renata")).toMatchObject({ controller: P1, isReady: true, location: "bf1", owner: P2, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("ht")).toBe("trash");
  });

  // ---- (a) controller uses the abilities ----------------------------------------------------------------

  test("(a) both activated abilities are listed for P1 — the controller of the source (191.4.a) on P1's turn in an Open State (381), use-condition met at bf1 (377.2.b) — and NONE for P2", async () => {
    const game = await stolen();
    expect(activations(game, "p1")).toEqual([`activateAbility:renata#${DRAW}`, `activateAbility:renata#${SCORE}`]);
    expect(activations(game, "p2")).toEqual([]);
    expect(game.p2.legal()).toEqual([]);
  });

  test("(a) '[1][mind]: Draw 1' — P1 pays 1 energy + 1 mind from P1's pool at activation (191.4.e, 404.1); the item is P1's; on resolution P1 draws 1; P2's pool, hand and deck are untouched", async () => {
    const game = await stolen();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p2Deck = game.p2.deck().length;
    await game.p1.activate("renata", DRAW);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 4 } });
    expect(game.p2.resources()).toEqual({ energy: 5, power: { mind: 5 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1, triggered: false })]);
    expect(game.state("renata").isReady).toBe(true); // no [Exhaust] on the draw ability
    await game.settle();
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p2.deck()).toHaveLength(p2Deck);
  });

  test("(a) '[4][mind]×4, [Exhaust]: Score 1 point' — P1 pays 4 + 4 mind and exhausts the (HT-readied) Renata as cost; on resolution P1 scores (1 → 2), P2 stays at 0", async () => {
    const game = await stolen();
    await game.p1.activate("renata", SCORE);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 1 } });
    expect(game.p2.resources()).toEqual({ energy: 5, power: { mind: 5 } });
    expect(game.state("renata").isExhausted).toBe(true); // cost, paid before anyone responds
    expect(game.p1.points()).toBe(1); // not yet
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1 })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // 406.4 — P2 gets a Reaction window
    await game.settle();
    expect(game.p1.points()).toBe(2);
    expect(game.p2.points()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("(a) both in one turn: Draw (no exhaust) then Score — P1 ends at 0 energy / 0 mind, +1 card, 2 points; Renata exhausted at bf1", async () => {
    const game = await stolen();
    const p1Hand = game.p1.hand().length;
    await game.p1.activate("renata", DRAW);
    await game.settle();
    await game.p1.activate("renata", SCORE);
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p1.points()).toBe(2);
    expect(game.state("renata")).toMatchObject({ controller: P1, isExhausted: true, location: "bf1" });
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) the owner cannot -----------------------------------------------------------------------------

  test("(b) P2 — owner but not controller, and not the turn player — cannot activate either ability: not in P1's open state, not in P2's Reaction window on the chain (191.4.a, 381)", async () => {
    const game = await stolen();
    expect(game.p2.can("activate", "renata")).toBe(false);
    expect((await game.p2.try((p) => p.activate("renata", DRAW))).ok).toBe(false);
    expect((await game.p2.try((p) => p.activate("renata", SCORE))).ok).toBe(false);
    // Give P2 priority: P1 activates Draw and passes.
    await game.p1.activate("renata", DRAW);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(activations(game, "p2")).toEqual([]);
    expect((await game.p2.try((p) => p.activate("renata", SCORE))).ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 5, power: { mind: 5 } }); // nothing was ever charged to P2
  });

  // ---- (c) control changes while the ability is on the chain ---------------------------------------------

  test("(c) P1 activates Draw; P2 Reacts and takes Renata back while the ability is on the chain → the ability is still P1's: P1 draws, P2 does not; P1's cost stays paid (191.4.b, 404.1)", async () => {
    const game = await stolen();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.activate("renata", DRAW);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 4 } });
    await game.p1.passPriority();
    await game.p2.cast("usurp", { targets: "renata" });
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["renata", P1],
      ["usurp", P2],
    ]);
    // Usurp (top) resolves first: Renata is P2's again while the Draw item still waits underneath.
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("renata").controller).toBe(P2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "renata", controller: P1 })]);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1); // spent Usurp, drew nothing
    expect(game.p1.resources()).toEqual({ energy: 4, power: { mind: 4 } }); // no refund
    expect(game.p2.resources()).toEqual({ energy: 5, power: { mind: 5 } });
  });

  test("(c) …and once Renata is P2's again (still at bf1, still P1's turn) neither player can activate her: P1 no longer controls the source, P2 is not the turn player (191.4.a, 381)", async () => {
    const game = await stolen();
    await game.p1.activate("renata", DRAW);
    await game.p1.passPriority();
    await game.p2.cast("usurp", { targets: "renata" });
    await game.settle();
    expect(game.state("renata")).toMatchObject({ controller: P2, location: "bf1" });
    expect(game.turnPlayer()).toBe(P1);
    expect(activations(game, "p1")).toEqual([]);
    expect(activations(game, "p2")).toEqual([]);
  });

  // ---- (d) after the end-of-turn recall ------------------------------------------------------------------

  test("(d) end of turn: P1 loses control and Renata is recalled to her owner P2's base (317.1, 455/456); P1 keeps the 2 points", async () => {
    const game = await stolen();
    await game.p1.activate("renata", SCORE);
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("renata")).toMatchObject({ controller: P2, location: "base", owner: P2, zone: "base" });
    expect(game.p2.base()).toContain("renata");
    expect(game.p1.units()).not.toContain("renata");
    expect(game.p1.points()).toBe(2);
  });

  test("(d) on P2's turn, with Renata READY in P2's base and 5 energy / 5 mind floating, neither ability is listed for P2 — 'use my abilities only while I'm at a battlefield' fails (377.2.b); nor for P1", async () => {
    const game = await stolen();
    await game.p1.activate("renata", SCORE); // exhaust her this turn; P2's Awaken readies her (P2 controls her again by then)
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.do("addResources", { energy: 5, power: { mind: 5 } });
    expect(game.p2.resources()).toEqual({ energy: 5, power: { mind: 5 } });
    expect(game.state("renata")).toMatchObject({ controller: P2, isReady: true, location: "base" });
    expect(activations(game, "p2")).toEqual([]);
    expect(game.p2.can("activate", "renata")).toBe(false);
    expect((await game.p2.try((p) => p.activate("renata", DRAW))).ok).toBe(false);
    expect(activations(game, "p1")).toEqual([]);
  });

  test("(d) contrast: once P2 walks her back onto a battlefield (bf2, exhausting her) the Draw ability is P2's to use — P2 pays, P2 draws (377.2.b satisfied again)", async () => {
    const game = await stolen();
    await game.settle();
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 5, power: { mind: 5 } });
    await game.p2.move("renata", "bf2");
    await game.settle(); // empty uncontrolled bf2: non-combat showdown → P2 conquers it
    await game.settle();
    expect(game.state("renata")).toMatchObject({ controller: P2, isExhausted: true, location: "bf2" });
    expect(activations(game, "p2")).toEqual([`activateAbility:renata#${DRAW}`]); // Score needs her ready
    expect(activations(game, "p1")).toEqual([]);
    const p2Hand = game.p2.hand().length;
    const p1Hand = game.p1.hand().length;
    await game.p2.activate("renata", DRAW);
    expect(game.p2.resources()).toEqual({ energy: 4, power: { mind: 4 } });
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand + 1);
    expect(game.p1.hand()).toHaveLength(p1Hand);
  });
});
