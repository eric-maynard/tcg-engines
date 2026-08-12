/**
 * Interaction: Traveling Merchant (ogn-185-298) · Unit · Chaos · 2 · 2 [Might]
 *     "When I move, discard 1, then draw 1."
 *   × Hostile Takeover (sfd-202-221) · Spell · Mind/Order · 5 + [rainbow]x2 · [Hidden]
 *     "Take control of an enemy unit at a battlefield. Ready it. (Start a combat if other
 *      enemies are there. Otherwise, conquer.) Lose control of that unit and recall it at
 *      end of turn."
 *   × Gust (ogn-169-298) · Spell · Chaos · 1 · [Reaction]
 *     "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Rules: 191.4.a (by default the Controller of an ability's SOURCE is the ability's
 * controller — fixed when the ability is created), 191.4.a.1 (source in a non-board zone ⇒
 * the owner controls the ability — a DEFAULT applied at creation, not a retroactive
 * re-assignment), 191.4.b (changes of control of the source do NOT change control of the
 * ability), 191.4.c (that player chooses targets), 383.2.a.1 (a triggered ability removed in
 * reaction still resolves — the ability is independent of its source once on the chain),
 * 340.1 (the newest finalized item resolves, in its entirety), 340.4 (with the chain
 * non-empty, the controller of the NEWEST remaining item gains priority), 336.1 (items
 * produced during resolution join the same chain above what is pending), 358.3.a (an
 * impossible instruction is skipped on resolution; the rest of the effect still happens),
 * 477.1.a (Controller is a layer-1 trait an effect can replace), 811.6 (a facedown [Hidden]
 * card has [Reaction] and may be played whenever a Reaction may be).
 *
 * Question: the Merchant is Standard-Moved by P1 into a battlefield; its move trigger is on
 * the chain, controlled by P1. Before it resolves P2 either (a) flips a facedown Hostile
 * Takeover on the Merchant, or (b) Gusts the Merchant back to its owner's hand. In each
 * case: whose hand is discarded from and whose deck is drawn from? Does the trigger resolve
 * at all once its source has left the board / changed sides? Does P2's steal move priority?
 * (c) baseline with no interference; (d) P1's hand is empty when it resolves.
 *
 * Expected: the ability's controller was fixed at creation — P1, the Merchant's controller at
 * that moment (191.4.a) — and neither a later change of control of the source (191.4.b) nor
 * the source leaving the board (383.2.a.1) re-assigns it. P1 discards from P1's hand and
 * draws from P1's deck in every branch; P2 is never asked and never loses a card. Priority
 * after Hostile Takeover resolves returns to P1 as the controller of the newest remaining
 * item (340.4). With an empty hand the discard is an impossible instruction and is skipped,
 * and the draw still happens (358.3.a).
 *
 * BOARD NOTE (107.3.d / 323.7): a facedown card is trashed at the first cleanup at a
 * battlefield its owner does not control, so the (a) branch necessarily stages Hostile
 * Takeover at a battlefield P2 controls. The rules question — whose ability is it — does not
 * depend on who held the battlefield, and the (b)/(c)/(d) branches use a battlefield P1
 * controls, as posed.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const HOSTILE_TAKEOVER = "sfd-202-221";
const GUST = "ogn-169-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might unit used as deck/hand fodder

/**
 * P1's turn. bf1 is P1's (a garrison holds it). The Merchant sits in P1's base and is about
 * to Standard-Move to bf1. P1 has two cards in hand and a known top card; P2 holds Gust and
 * has their own known top card so "whose deck" is observable.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Garrison" }, "garrison")
    .unit(P1, "base", MERCHANT, "merchant")
    .hand(P1, FILLER, "p1junk")
    .hand(P1, FILLER, "p1keep")
    .deckTop(P1, FILLER, "p1top")
    .hand(P2, GUST, "gust")
    .deckTop(P2, FILLER, "p2top")
    .resources(P2, { energy: 1 });
}

/**
 * Same question, but the battlefield is P2's so their [Hidden] Hostile Takeover survives
 * there (107.3.d). The Merchant moves in alone, so the Takeover's parenthetical takes the
 * "otherwise, conquer" branch rather than starting a combat.
 */
function stolenBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", MERCHANT, "merchant")
    .hand(P1, FILLER, "p1junk")
    .hand(P1, FILLER, "p1keep")
    .deckTop(P1, FILLER, "p1top")
    .facedown(P2, "bf1", HOSTILE_TAKEOVER, "ht")
    .hand(P2, FILLER, "p2hand")
    .deckTop(P2, FILLER, "p2top")
    .resources(P2, { energy: 0 });
}

/** P1 moves the Merchant in and passes; P2 now holds priority with the trigger pending. */
async function atP2Response(builder = board()): Promise<Game> {
  const game = await builder.build();
  await game.p1.move("merchant", "bf1");
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true }),
  ]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

/** …P2 flips the facedown Hostile Takeover onto the Merchant (its only legal target). */
async function stolen(): Promise<Game> {
  const game = await atP2Response(stolenBoard());
  await game.p2.reveal("ht");
  if (game.decision()?.kind === "pick") {
    await game.p2.pick("merchant");
  }
  return game;
}

describe("Traveling Merchant's move trigger keeps ITS controller when the Merchant is stolen or bounced", () => {
  // ---- (c) baseline ---------------------------------------------------------------------

  test("(c) baseline: the trigger is P1's — P1 chooses the discard, it goes to P1's trash, and P1 draws P1's top card", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true }),
    ]);
    await game.settle();
    // 191.4.c — the ability's controller makes its choices.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("p1junk");
    await game.settle();
    expect(game.zoneOf("p1junk")).toBe("trash");
    expect(game.p1.trash()).toContain("p1junk");
    expect(game.p2.trash()).toEqual([]);
    // discard THEN draw: the drawn card cannot be the discarded one, and hand size is unchanged.
    expect(game.p1.hand().sort()).toEqual(["p1keep", "p1top"]);
    expect(game.p2.hand()).toEqual(["gust"]);
    expect(game.zoneOf("p2top")).toBe("mainDeck");
    expect(game.violations()).toEqual([]);
  });

  // ---- (a) Hostile Takeover steals the source ------------------------------------------

  test("(a) the flip is legal at Reaction speed and lands ABOVE the pending trigger (811.6, 340.1 LIFO)", async () => {
    const game = await stolen();
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "ht"]);
    expect(game.chain()[0]).toMatchObject({ controller: P1, triggered: true });
    expect(game.chain()[1]).toMatchObject({ controller: P2, triggered: false });
  });

  test("(a) Hostile Takeover resolves first and entirely (340.1/336.1): P2 controls a readied Merchant at the battlefield P2 holds — with the move trigger still pending underneath", async () => {
    const game = await stolen();
    await game.p2.passPriority();
    await game.p1.passPriority();
    const merchant = game.state("merchant");
    expect(merchant.controller).toBe(P2);
    expect(merchant.owner).toBe(P1);
    expect(merchant.isReady).toBe(true);
    expect(merchant.zone).toBe("battlefield-bf1");
    expect(game.zoneOf("ht")).toBe("trash");
    // "Otherwise, conquer": no other enemies were there, so the conquer branch ran and it is
    // P2 who ends up holding bf1 — all of it above the still-unresolved move trigger.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant"]);
  });

  test("(a) 340.4 — with the chain non-empty, priority returns to the controller of the newest remaining item: P1, the trigger's controller, not the seat that just stole the unit", async () => {
    const game = await stolen();
    await game.p2.passPriority();
    await game.p1.passPriority(); // Hostile Takeover resolves
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant"]);
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ kind: "action", seat: P1 });
  });

  test("(a) the trigger is STILL P1's after the steal (191.4.a fixed at creation, 191.4.b control of the source is irrelevant): P1 is asked for the discard, P2 is never asked", async () => {
    const game = await stolen();
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    expect((game.decision() as { options: { card?: string }[] }).options.map((o) => o.card)).toEqual([
      "p1junk",
      "p1keep",
    ]);
  });

  test("(a) P1 discards from P1's hand and draws from P1's deck; P2's hand and deck are untouched even though P2 now controls the Merchant", async () => {
    const game = await stolen();
    await game.settle();
    await game.p1.pick("p1junk");
    await game.settle();
    expect(game.p1.trash()).toContain("p1junk");
    expect(game.p1.hand().sort()).toEqual(["p1keep", "p1top"]);
    expect(game.p2.hand()).toEqual(["p2hand"]);
    expect(game.zoneOf("p2top")).toBe("mainDeck");
    expect(game.p2.trash()).toContain("ht"); // only the spell itself
    expect(game.p2.trash()).not.toContain("p1junk");
    expect(game.state("merchant").controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // ---- (b) Gust removes the source -----------------------------------------------------

  test("(b) Gust (2 Might <= 3) bounces the Merchant to its OWNER's hand while its trigger is still on the chain", async () => {
    const game = await atP2Response();
    await game.p2.cast("gust", { targets: "merchant" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    expect(game.zoneOf("merchant")).toBe("hand");
    expect(game.p1.hand()).toContain("merchant");
    expect(game.chain().map((c) => c.cardId)).toEqual(["merchant"]);
  });

  test("(b) 383.2.a.1 — the trigger resolves anyway once its source is gone, and it is still P1's: P1 discards from P1's hand (the bounced Merchant is now among the choices) and draws P1's top card", async () => {
    const game = await atP2Response();
    await game.p2.cast("gust", { targets: "merchant" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const options = (game.decision() as { options: { card?: string }[] }).options.map((o) => o.card);
    expect(options.sort()).toEqual(["merchant", "p1junk", "p1keep"]);
    await game.p1.pick("p1junk");
    await game.settle();
    expect(game.p1.trash()).toContain("p1junk");
    expect(game.p1.hand().sort()).toEqual(["merchant", "p1keep", "p1top"]);
    expect(game.p2.hand()).toEqual([]); // spent Gust; nothing discarded from P2
    expect(game.zoneOf("p2top")).toBe("mainDeck");
    expect(game.violations()).toEqual([]);
  });

  test("(b) 191.4.a.1 is the default applied when the ability is created, not a retroactive re-assignment: with the source in a non-board zone the trigger is still P1's, and P2 never gets the decision", async () => {
    const game = await atP2Response();
    await game.p2.cast("gust", { targets: "merchant" });
    await game.settle();
    expect(game.zoneOf("merchant")).toBe("hand"); // source is in a non-board zone
    expect(game.chain()).toEqual([]); // the trigger is the item being resolved
    expect(game.decision()?.seat).toBe(P1);
    expect(game.decision()?.seat).not.toBe(P2);
  });

  // ---- (d) impossible instruction ------------------------------------------------------

  test("(d) empty hand: the discard is an impossible instruction and is simply skipped — the draw still happens (358.3.a)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Garrison" }, "garrison")
      .unit(P1, "base", MERCHANT, "merchant")
      .deckTop(P1, FILLER, "p1top")
      .build();
    expect(game.p1.hand()).toEqual([]);
    await game.p1.move("merchant", "bf1");
    await game.settle();
    expect(game.p1.hand()).toEqual(["p1top"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
