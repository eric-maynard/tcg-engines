/**
 * Interaction: Dusk Rose Lab (unl-209-219) · Battlefield
 *     "At the start of your Beginning Phase, you may kill a unit you control here to draw 1.
 *      (This happens before scoring.)"
 *   × Grove of the God-Willow (ogn-280-298) · Battlefield · "When you hold here, draw 1."
 *   × Ahri, Alluring (ogn-066-298) · Champion Unit · Calm · [5][calm] · 4 Might · "When I hold, you score 1 point."
 *
 * Rules: 469.2 (Hold scores in the Beginning Phase, after the start-of-phase effects), 471.2.b (a hold trigger is
 * its own Pending Item), 383.3.a (a leading "you may" is decided at FINALIZATION — declining removes the item),
 * 383.3.d (simultaneous same-controller triggers: their controller chooses the order they go on the chain),
 * 431.1.a (draw as many as possible), 431.2 / 431.2.b / 431.2.c (Burn Out: recycle the trash into the Main Deck
 * randomised, an opponent gains 1 point, then complete the draw), 431.3 / 431.3.b / 431.3.c.1 (an empty trash
 * leaves the deck empty so the retried draw burns out again; points after the FIRST in such a sequence cannot be
 * prevented and win on the spot), 319.3 / 319.6 (a point gain queues a Cleanup), 323.1 / 472 (a win needs ≥ the
 * Victory Score AND more than any opponent).
 *
 * Board — P1 controls Dusk Rose Lab (`lab`, garrisoned by a Lab Rat) and Grove of the God-Willow (`grove`,
 * garrisoned by Ahri). P1's Main Deck is EMPTY, its trash holds 4 cards. Victory Score 8, P2 on 7.
 * P1 is seeded on 5 rather than the sketch's 6 so that the two Holds carry it to 7 and AHRI'S point is the eighth
 * — the shape the question is really about ("6→7 (Hold) →8 (Ahri)"), with one Hold point per battlefield (470).
 *
 * Question:
 *   (a) Does the PRE-scoring draw burn out and hand P2 — already on 7 — the winning point before P1 ever scores?
 *   (b) Does P1's Beginning Phase continue in between, and does P1 ever reach its scoring step?
 *   (c) Same board with an EMPTY trash: does the loop repeat, and can P1's Hold/Ahri points ever land?
 *   (d) If P1 simply DECLINES the optional kill, does P1 win first?
 *
 * Answer: (a) yes — the Lab's trigger resolves before the scoring step, the draw finds an empty deck, so 431.1.a
 * draws 0 and Burn Out runs: the 4-card trash (plus the unit just killed as the cost) is recycled into the deck,
 * P2 gains 1 (7 → 8, forced in a duel by 431.2.c) and only then is the draw completed from the refilled deck.
 * (b) The point is the FIRST of its sequence, so 431.3.c.1's on-the-spot win does not apply — it is the Cleanup
 * queued by the state change that ends the game (319.6 / 323.1 / 472). Either way P1's scoring step is never
 * reached: P1 stays on 5, no Hold point and no Ahri trigger, and the turn ends inside the Beginning Phase.
 * (c) "Empty trash" is harder to arrange than it looks: the unit killed as the trigger's cost lands in the trash
 * a moment before the draw, so a seeded-empty trash still recycles one card. Make the victim a TOKEN (it ceases
 * to exist, 186.1) and the trash really is empty — then 431.3's sequence repeats, and because a Cleanup is a
 * no-op while a chain item resolves (321) the FIRST point (7 → 8) cannot end the game there; the second is a
 * post-first point and wins on the spot (431.3.b / 431.3.c.1), leaving P2 on 9. Either way P1 never scores.
 * (d) Declining removes the trigger at finalization (383.3.a), so no draw happens and scoring runs: both Holds
 * take P1 5 → 7. What decides the game then is 383.3.d — Ahri's score and the Grove's draw trigger simultaneously
 * under one controller, so P1 ORDERS them, and the order is the whole game: Ahri first ⇒ P1 reaches 8 and wins
 * with the Grove's draw never resolving; the Grove first ⇒ its draw burns out, P2 reaches 8 first and P1 loses
 * holding a resolved-nothing Ahri item. The engine's default (listed) order is the losing one.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DUSK_ROSE_LAB = "unl-209-219";
const GROVE = "ogn-280-298";
const AHRI = "ogn-066-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla trash/deck stock
const BIRD_TOKEN = "unl-t02"; // 1-Might Bird token: dies to nowhere (186.1), so it never stocks the trash
const RUNE = { cardType: "rune", domain: "calm", name: "Calm Rune" } as const;

/**
 * Turn 2, P2 about to end its turn. P1: `lab` (Dusk Rose Lab, live text) with a Lab Rat, `grove` (Grove of the
 * God-Willow, live text) with Ahri; Main Deck EMPTY, `trash` cards in the trash, a 6-card Rune Deck so the
 * Channel Phase is never the thing that goes wrong. P2 keeps a small real deck. Victory Score 8.
 */
function board(opts: { trash?: number } = {}) {
  const b = scenario()
    .turn(2)
    .active(P2)
    .fillDecks(false)
    .victoryScore(8)
    .points(P1, 5)
    .points(P2, 7)
    .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
    .battlefield("grove", { controller: P1, def: GROVE, inert: false, owner: P1 })
    .unit(P1, "lab", { might: 2, name: "Lab Rat" }, "rat")
    .unit(P1, "grove", AHRI, "ahri")
    .runeDeck(P1, [RUNE, RUNE, RUNE, RUNE, RUNE, RUNE])
    .deck(P2, [FILLER, FILLER, FILLER, FILLER, FILLER]);
  for (let i = 0; i < (opts.trash ?? 4); i++) {
    b.trash(P1, FILLER, `t${i}`);
  }
  return b;
}

/** P2 ends its turn; P1's Beginning Phase opens on the Lab's "you may" (383.3.a, timing FIN). */
async function atLabPrompt(opts: { trash?: number } = {}): Promise<Game> {
  const game = await board(opts).build();
  expect(game.p1.deck()).toEqual([]);
  await game.p2.endTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("beginning");
  expect(game.decision()).toMatchObject({
    kind: "yes-no",
    seat: P1,
    source: { cardId: "lab", pendingChoiceType: "opt-in" },
    timing: "FIN",
  });
  expect(game.p1.points()).toBe(5); // "(This happens before scoring.)"
  return game;
}

describe("Dusk Rose Lab's pre-scoring draw into an empty deck — two burn-outs around one Hold", () => {
  // ── (a) accept: the draw burns out before P1 ever scores ─────────────────────────────────────────

  test("(a) accepting kills the Lab Rat as the trigger's base COST at finalization (383.3.b / 404.1) — before anything is drawn and before any point is scored", async () => {
    const game = await atLabPrompt();
    await game.p1.yes();
    expect(game.zoneOf("rat")).toBe("trash");
    expect(game.p1.units("lab")).toEqual([]);
    expect(game.chain().map((i) => i.cardId)).toEqual(["lab"]); // the draw is still to come
    expect(game.p1.points()).toBe(5);
    expect(game.p2.points()).toBe(7);
    expect(game.gameState.battlefields.lab?.controller).toBe(P1); // 190.4 — kept while the chain is closed
  });

  test("(a) the draw finds an empty deck: 431.1.a draws 0, Burn Out recycles the WHOLE trash into the Main Deck (431.2.b) — the just-killed Lab Rat included — P2 gains 1 (7 → 8, 431.2.c), and only then is the draw completed", async () => {
    const game = await atLabPrompt();
    await game.p1.yes();
    await game.settle();
    expect(game.p2.points()).toBe(8);
    expect(game.p1.trash()).toEqual([]); // everything went back into the deck
    expect(game.p1.deck()).toHaveLength(4); // 4 fillers + the Rat, minus the one card the completed draw took
    expect(game.p1.hand()).toHaveLength(1);
    expect(["hand", "mainDeck"]).toContain(game.zoneOf("rat")); // the cost victim is recyclable stock like any card
    expect(game.violations()).toEqual([]);
  });

  test("(a) exactly ONE point is handed over — P2 lands on the Victory Score, not past it (the sequence stopped as soon as it was decided)", async () => {
    const game = await atLabPrompt();
    await game.p1.yes();
    await game.settle();
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
  });

  // ── (b) P1's Beginning Phase never reaches its scoring step ──────────────────────────────────────

  test("(b) the win lands via the Cleanup the point gain queues (319.6 / 323.1 / 472 — 431.3.c.1's on-the-spot win is reserved for points AFTER the first): P1's scoring step is never reached, so P1 keeps 5, no Hold point and no Ahri trigger", async () => {
    const game = await atLabPrompt();
    await game.p1.yes();
    const settled = await game.settle();
    expect(settled.reason).toBe("game-over");
    expect(game.p1.points()).toBe(5);
    expect(game.phase()).toBe("beginning"); // never got to the scoring step, let alone the Main Phase
    expect(game.turnPlayer()).toBe(P1); // it ended on P1's own turn
    expect(game.decision()).toBeNull();
    expect(game.p1.legal().filter((o) => o.moveId !== "concede")).toEqual([]);
  });

  test("(b) …and the board is left where the burn-out found it: bf control lapsed at the Lab (its garrison was spent), Ahri never triggered, the Grove never drew", async () => {
    const game = await atLabPrompt();
    await game.p1.yes();
    await game.settle();
    expect(game.gameState.battlefields.lab?.controller).toBeNull(); // 323.6, once the chain emptied
    expect(game.zoneOf("ahri")).toBe("battlefield-grove");
    expect(game.p1.hand()).toHaveLength(1); // only the burn-out's completed draw — not a Grove draw as well
    expect(game.p1.points()).toBe(5);
  });

  // ── (c) empty trash ─────────────────────────────────────────────────────────────────────────────

  test("(c) 'empty trash' is harder to arrange than it looks: the unit killed as the COST lands in the trash, so with a seeded-empty trash there is still exactly one card to recycle — one Burn Out, and P1 draws back the very unit the Lab just ate", async () => {
    const game = await atLabPrompt({ trash: 0 });
    await game.p1.yes();
    expect(game.p1.trash()).toEqual(["rat"]); // paid at finalization, before the draw is attempted
    const settled = await game.settle();
    expect(settled.reason).toBe("game-over");
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual(["rat"]); // recycled (431.2.b) and immediately drawn
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(5); // Hold and Ahri never land, in either trash configuration
    expect(game.winner()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("(c) a TOKEN victim ceases to exist instead (186.1), so the trash really IS empty: the deck stays empty (431.3) and the sequence REPEATS — and because a Cleanup is a no-op while a chain item resolves (321), the first point (7 → 8) cannot end it there; the second is a post-first point and wins on the spot (431.3.b / 431.3.c.1), so P2 finishes on 9", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks(false)
      .victoryScore(8)
      .points(P1, 5)
      .points(P2, 7)
      .battlefield("lab", { controller: P1, def: DUSK_ROSE_LAB, inert: false, owner: P1 })
      .battlefield("grove", { controller: P1, def: GROVE, inert: false, owner: P1 })
      .unit(P1, "lab", BIRD_TOKEN, "birdie") // the Lab's only victim — a token, so nothing reaches the trash
      .unit(P1, "grove", AHRI, "ahri")
      .runeDeck(P1, [RUNE, RUNE, RUNE, RUNE, RUNE, RUNE])
      .deck(P2, [FILLER, FILLER, FILLER, FILLER, FILLER])
      .build();
    await game.p2.endTurn();
    await game.p1.yes();
    expect(game.zoneOf("birdie")).toBe("gone");
    expect(game.p1.trash()).toEqual([]);
    await game.settle();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.hand()).toEqual([]); // the draw was never completed — nothing ever existed to draw
    expect(game.p2.points()).toBe(9);
    expect(game.p1.points()).toBe(5);
    expect(game.winner()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) decline: the Holds run, and the trigger ORDER decides the game ──────────────────────────

  test("(d) declining is a finalization-time decision (383.3.a): the item is removed, nothing is killed, nothing is drawn — and the scoring step then takes P1 5 → 7 on two Holds (470)", async () => {
    const game = await atLabPrompt();
    await game.p1.no();
    expect(game.zoneOf("rat")).toBe("battlefield-lab");
    expect(game.p1.points()).toBe(7); // one Hold per battlefield, before either hold trigger resolves
    expect(game.p2.points()).toBe(7);
    expect(game.isOver()).toBe(false);
  });

  test("(d) Ahri's score and the Grove's draw trigger simultaneously under ONE controller, so P1 is offered their order (383.3.d) — a soft `order` decision naming both items", async () => {
    const game = await atLabPrompt();
    await game.p1.no();
    const d = game.decision();
    expect(d).toMatchObject({ defaultable: true, kind: "order", seat: P1 });
    expect(d?.kind === "order" ? d.items.map((i) => i.card).sort() : []).toEqual(["ahri", "grove"]);
  });

  test("(d) ordering Ahri to resolve FIRST wins the game for P1: 471.2.b's item scores the 8th point, the Cleanup ends it (319.3 / 323.1) and the Grove's burn-out draw never resolves at all", async () => {
    const game = await atLabPrompt();
    await game.p1.no();
    await game.p1.order(["grove", "ahri"]); // first listed goes on the chain first ⇒ Ahri is newest ⇒ resolves first
    await game.settle();
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(7); // no burn-out ever happened
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.chain().map((i) => i.cardId)).toEqual(["grove"]); // still sitting there, unresolved
    expect(game.violations()).toEqual([]);
  });

  test("(d) the mirror image — ordering the Grove's draw first LOSES it: the empty deck burns out, P2 reaches 8 before P1's Ahri item ever resolves, and P1 is left on 7", async () => {
    const game = await atLabPrompt();
    await game.p1.no();
    await game.p1.order(["ahri", "grove"]); // Grove is newest ⇒ its draw resolves first
    await game.settle();
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(7);
    expect(game.chain().map((i) => i.cardId)).toEqual(["ahri"]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) and that losing order is the DEFAULT one: a client that just settles the soft offer (383.3.d) hands the game to P2 — the order really is a decision, not a formality", async () => {
    const game = await atLabPrompt();
    await game.p1.no();
    expect(game.decision()).toMatchObject({ defaultable: true, kind: "order" });
    await game.settle(); // passive policy keeps the listed order
    expect(game.winner()).toBe(P2);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(8);
  });

  // ── no phase is entered twice, in any branch ────────────────────────────────────────────────────

  test("every branch ends inside P1's own Beginning Phase, with the invariants silent and no phase entered twice", async () => {
    for (const answer of ["yes", "no"] as const) {
      const game = await atLabPrompt();
      await (answer === "yes" ? game.p1.yes() : game.p1.no());
      await game.settle();
      expect(game.isOver()).toBe(true);
      expect(game.phase()).toBe("beginning");
      expect(game.turnPlayer()).toBe(P1);
      expect(game.turnNumber()).toBe(3);
      expect(game.violations()).toEqual([]);
    }
  });
});
