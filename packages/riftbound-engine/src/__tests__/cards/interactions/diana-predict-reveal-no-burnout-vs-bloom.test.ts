/**
 * Interaction: Diana, Lunari (unl-079-219) · Champion unit · Mind · 3 · 3 Might
 *     "When a showdown begins here, you may pay [1]. If you do, [Predict], then reveal the top card of your
 *      Main Deck. If it's a spell, draw it."
 *   × Scryer's Bloom (unl-136-219) · Gear · Chaos · 1
 *     "This enters exhausted. Kill this, [1], [Exhaust]: [Predict 2], then draw 1. Gain 1 XP."
 *
 * Rules: 436.4/436.4.a (Predict with too few cards predicts as many as possible and NEVER Burns Out),
 * 431.1.c/431.1.c.1 (look/reveal in excess reveals as many as possible, no Burn Out; follow-ups on the
 * missing card are ignored — even zone changes), 428.1 (Kill-this is a cost: the Bloom is in the trash
 * before the ability resolves), 413.4 + 431.2.b–d (a DRAW from an empty deck Burns Out: recycle trash into
 * deck, an opponent gains 1, then finish the draw), 431.3.c.1 (only points from a REPEATED burn-out win
 * immediately), 321/319.5/323.1/472 (otherwise the win is checked at the Cleanup after the chain item).
 *
 * Question — P1's Main Deck is EMPTY, P1's trash = [T1] (a spell), P2 on 7 (Victory 8):
 *  (a) A showdown begins at Diana's battlefield; P1 pays [1]. Does Predict / reveal / "draw it" Burn Out?
 *  (b) P1 cracks a ready Scryer's Bloom (deck 0, trash [T1]): what is in the trash when the draw Burns Out,
 *      what can P1 draw, does P1 still gain the XP, and when does P2 (7 → 8) win?
 *  (c) Bloom with deck = [D1]: any Burn Out?
 *  (d) Bloom with deck 0 and an EMPTY trash, P2 on 3: what exactly does P1 draw?
 *
 * Expected: (a) nothing Burns Out — P1 is down [1], P2 stays 7, trash still [T1], deck still 0.
 * (b) trash = [T1, Bloom] at the Burn Out → both recycled (deck 2) → P2 8 → P1 draws one of them → +1 XP →
 * Cleanup → P2 wins (after the card and the XP). (c) no Burn Out: D1 looked at then drawn, P2 7, +1 XP,
 * trash [T1, Bloom]. (d) the Bloom alone is recycled and drawn straight back: P2 4, hand [Bloom], deck 0,
 * trash 0, +1 XP.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DIANA = "unl-079-219";
const SCRYERS_BLOOM = "unl-136-219";
/** T1 — the lone spell in P1's trash. */
const TRASH_SPELL = { abilities: [], cardType: "spell", domain: "mind", energyCost: 9, name: "Trash Spell" } as const;
/** D1 — the lone card of P1's deck in (c). */
const DECK_SPELL = { abilities: [], cardType: "spell", domain: "mind", energyCost: 9, name: "Deck Spell" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * (a) P2's turn. P1: Diana holding bfD, exactly 1 energy, Main Deck EMPTY, trash [t1]. P2 on 7 with a 1-Might
 * Poker in base (its attack opens the showdown "here"). Rune decks stay filled; main decks get no filler.
 */
function dianaBoard() {
  return scenario()
    .active(P2)
    .fillDecks({ main: 0, runes: 12 })
    .points(P2, 7)
    .resources(P1, { energy: 1 })
    .battlefield("bfD", { controller: P1 })
    .unit(P1, "bfD", DIANA, "diana")
    .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
    .trash(P1, TRASH_SPELL, "t1");
}

/** (b)–(d) P1's turn with a READY Bloom in base and exactly 1 energy; deck / trash / P2's score per case. */
function bloomBoard(opts: { deck?: "d1"; trash?: "t1"; p2Points: number }) {
  let b = scenario()
    .fillDecks({ main: 0, runes: 12 })
    .points(P2, opts.p2Points)
    .resources(P1, { energy: 1 })
    .gear(P1, SCRYERS_BLOOM, "bloom")
    .unit(P2, "base", { might: 1, name: "Bystander" }, "bystander");
  if (opts.deck === "d1") {
    b = b.deck(P1, [DECK_SPELL], ["d1"]);
  }
  if (opts.trash === "t1") {
    b = b.trash(P1, TRASH_SPELL, "t1");
  }
  return b;
}

/** Drive the activated Bloom's resolution: pass priority, keep whatever a Predict shows (decline to recycle), accept any put-back order. */
async function resolveBloom(game: Game): Promise<void> {
  for (let i = 0; i < 8; i++) {
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      return;
    }
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1 && d.allowDecline) {
      await game.p1.decline(); // Predict: recycle nothing
    } else if (d?.kind === "order" && d.seat === P1) {
      await game.p1.order(d.items.map((it) => it.key));
    } else {
      return;
    }
  }
}

/** Activate the ready Bloom (costs paid up front) and resolve it. */
async function crackBloom(game: Game): Promise<void> {
  expect(game.p1.can("activate", "bloom")).toBe(true);
  await game.p1.activate("bloom");
  await resolveBloom(game);
}

describe("(a) Diana with an EMPTY deck — Predict, reveal and the conditional draw are all Burn-Out-proof", () => {
  async function showdownAtDiana(): Promise<Game> {
    const game = await dianaBoard().build();
    expect(game.p1.deck()).toEqual([]);
    await game.p2.move("poker", "bfD");
    // Diana's trigger is the chain item: the leading "you may" is a free opt-in while it is finalized (383.3.a,
    // timing FIN); the "pay [1]" itself is asked as it resolves (205 / 444.2, timing RES).
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "diana", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "diana" }, timing: "FIN" });
    await game.p1.yes();
    expect(game.p1.energy()).toBe(1);
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, timing: "RES" });
    return game;
  }

  test("P1 may still pay the [1] with nothing to look at — the payment is taken (1 → 0 energy)", async () => {
    const game = await showdownAtDiana();
    await game.p1.yes();
    expect(game.p1.energy()).toBe(0);
  });

  test("Predict 0 cards, reveal 0 cards, 'if it's a spell, draw it' ignored: NO Burn Out — P2 stays on 7, P1's trash is still exactly [t1] (not recycled), deck still empty, hand unchanged (436.4.a, 431.1.c, 431.1.c.1)", async () => {
    const game = await showdownAtDiana();
    const hand0 = game.p1.hand().length;
    await game.p1.yes();
    // The whole trigger resolved without a single prompt (nothing to predict / reveal) — we are back in the showdown.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.chain()).toEqual([]);
    expect(game.p2.points()).toBe(7);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.trash()).toEqual(["t1"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.isOver()).toBe(false);
  });

  test("the game simply continues: combat Poker (1) into Diana (3) → Poker dies, Diana keeps bfD, still 7–0 and not over", async () => {
    const game = await showdownAtDiana();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.zoneOf("diana")).toBe("battlefield-bfD");
    expect(game.gameState.battlefields.bfD?.controller).toBe(P1);
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) Scryer's Bloom, deck 0, trash [t1], P2 on 7 — the stapled 'draw 1' DOES Burn Out", () => {
  test("costs first (428.1): the moment it is activated the Bloom is already in the trash — trash = [t1, bloom] — [1] is paid and the ability waits on the chain with nothing drawn", async () => {
    const game = await bloomBoard({ p2Points: 7, trash: "t1" }).build();
    await game.p1.activate("bloom");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("bloom")).toBe("trash");
    expect([...game.p1.trash()].sort()).toEqual(["bloom", "t1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bloom", controller: P1 })]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p2.points()).toBe(7);
  });

  test("resolution: Predict 2 of 0 → nothing (no prompt, no Burn Out); draw 1 → Burn Out recycles the WHOLE trash [t1, bloom] into the deck and P2 goes 7 → 8; then P1 draws exactly one of {t1, bloom} and the other is the 1-card deck; trash ends empty", async () => {
    const game = await bloomBoard({ p2Points: 7, trash: "t1" }).build();
    await crackBloom(game);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(1);
    expect([...game.p1.hand(), ...game.p1.deck()].sort()).toEqual(["bloom", "t1"]);
  });

  test("the ability finishes before anyone wins: P1 has its drawn card AND the 1 XP, and only then (Cleanup after the item, 319.5 → 323.1) P2 wins on 8 — a first Burn Out is not an immediate win (431.3.c.1 inapplicable)", async () => {
    const game = await bloomBoard({ p2Points: 7, trash: "t1" }).build();
    expect(game.p1.xp()).toBe(0);
    await crackBloom(game);
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) Scryer's Bloom, deck [d1], trash [t1], P2 on 7 — no Burn Out at all", () => {
  test("Predict 2 looks at just d1 (predict as many as possible, 436.4); keeping it, 'then draw 1' draws d1 — P2 stays 7, +1 XP, trash [t1, bloom] untouched by any recycle, deck now empty, game goes on", async () => {
    const game = await bloomBoard({ deck: "d1", p2Points: 7, trash: "t1" }).build();
    await game.p1.activate("bloom");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["d1"]);
    expect(game.p1.hand()).toEqual([]); // "THEN draw 1" waits for the predict
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()).toEqual([]);
    expect([...game.p1.trash()].sort()).toEqual(["bloom", "t1"]);
    expect(game.p2.points()).toBe(7);
    expect(game.p1.xp()).toBe(1);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) Scryer's Bloom, deck 0, trash EMPTY before activation, P2 on 3", () => {
  test("the cost-kill puts the Bloom into the empty trash; the draw's Burn Out recycles [bloom] alone → P2 3 → 4 → P1 draws the Bloom straight back into hand; exactly one Burn Out; +1 XP; deck 0 and trash 0 afterwards", async () => {
    const game = await bloomBoard({ p2Points: 3 }).build();
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toEqual([]);
    await game.p1.activate("bloom");
    expect(game.p1.trash()).toEqual(["bloom"]);
    await resolveBloom(game);
    expect(game.p2.points()).toBe(4); // exactly one Burn Out point
    expect(game.p1.hand()).toEqual(["bloom"]);
    expect(game.zoneOf("bloom")).toBe("hand");
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.xp()).toBe(1);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("back in hand the Bloom is an ordinary 1-cost gear again — with 0 energy left it is not playable this turn", async () => {
    const game = await bloomBoard({ p2Points: 3 }).build();
    await crackBloom(game);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("play", "bloom")).toBe(false);
  });
});
