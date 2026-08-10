/**
 * Interaction: Zaun Warrens (ogn-298-298) · Battlefield · "When you conquer here, discard 1, then draw 1."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · [4] · 4 Might · vanilla — the conqueror
 *   × the Final-Point restriction (471.1.b.1 "draw a card instead") feeding a Burn Out (431).
 *
 * Question (1v1, Victory Score 8). P1 on 7, P2 on 6, P1's turn; P1 Held nothing this turn. P1 Standard-Moves
 * Vanguard Sergeant from base onto the EMPTY, uncontrolled Zaun Warrens and conquers it uncontested. P1's hand
 * is EMPTY and its Main Deck is EMPTY.
 *   (a) P1's trash = [T1]. The conquer point becomes "draw a card instead" — into an empty deck. How many points
 *       does P2 gain across the replacement draw AND the Zaun Warrens trigger (discard 1 then draw 1 with T1
 *       cycling)? Is either Burn Out "immediate"? At which Cleanup does P2 win? Does the Conquer trigger fire
 *       at all when the point was replaced by a draw?
 *   (b) Same but P1 HAD Held the other battlefield this turn: does P1 take the 8th point and win before Zaun
 *       Warrens' discard/draw resolves — any Burn Out?
 *   (c) As (a) but P1's trash is ALSO empty.
 *
 * Rules: 469.1 / 471.1.b / 471.1.b.1 (Conquer at VS−1 without every battlefield scored → draw instead),
 * 471.2.a (Conquer abilities still trigger — the battlefield WAS scored), 413.4 + 431.1.a / 431.2.b–d (draw from
 * an empty deck → Burn Out: recycle trash, an opponent gains 1, finish the draw), 431.3 / 431.3.c / 431.3.c.1
 * (empty trash → repeated Burn Outs; only points AFTER the first in one sequence win immediately), 422.1
 * (discard), 319.3 / 319.5 / 319.8 + 323.1 / 472 (Cleanups after a pending item / a resolved item / a move check
 * the Victory Score), 321 (no Cleanup mid-resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ZAUN_WARRENS = "ogn-298-298";
const VANGUARD_SERGEANT = "ogn-219-298";
const SKULKER = "ogn-175-298"; // vanilla filler for decks / trash

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn 3, main phase, 7–6 of 8. "zaun" = live Zaun Warrens, empty and uncontrolled. "other" = inert
 * battlefield controlled by P2 (Squatter on it) — P1 has scored nothing this turn. P1: Vanguard Sergeant in
 * base, hand EMPTY, Main Deck = `p1Deck` (default EMPTY), trash = `p1Trash`. P2 has a small real deck so only
 * P1 can burn out. No main-deck filler for anyone.
 */
function board(opts: { p1Trash?: readonly string[]; p1Deck?: readonly string[] } = {}) {
  const trash = opts.p1Trash ?? ["t1"];
  const deck = opts.p1Deck ?? [];
  let s = scenario()
    .turn(3)
    .active(P1)
    .victoryScore(8)
    .points(P1, 7)
    .points(P2, 6)
    .fillDecks({ main: 0, runes: 12 })
    .deck(P2, [SKULKER, SKULKER, SKULKER])
    .battlefield("zaun", { controller: null, def: ZAUN_WARRENS, inert: false, owner: P1 })
    .battlefield("other", { controller: P2, owner: P2 })
    .unit(P2, "other", { might: 2, name: "Squatter" }, "squatter")
    .unit(P1, "base", VANGUARD_SERGEANT, "sarge");
  if (deck.length > 0) {
    s = s.deck(P1, deck.map(() => SKULKER), [...deck]);
  }
  for (const t of trash) {
    s = s.trash(P1, SKULKER, t);
  }
  return s;
}

/** Sergeant walks onto the empty Warrens; both players pass Focus in the uncontested showdown → P1 conquers. */
async function conquerWarrens(game: G): Promise<void> {
  await game.p1.move("sarge", "zaun");
  // rule 344.2 — moving onto an empty uncontrolled battlefield opens a Non-Combat Showdown first.
  for (let i = 0; i < 4 && !game.isOver(); i++) {
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      break;
    }
    await game.seat(d.seat).passFocus();
  }
}

describe("Zaun Warrens conquered at 7 — 'draw instead' into an empty deck", () => {
  test("setup sanity: 7–6 of 8, P1 hand and deck empty, trash [t1], nothing scored this turn, Warrens uncontrolled", async () => {
    const game = await board().build();
    expect(game.gameState.victoryScore).toBe(8);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(6);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual(["t1"]);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]);
    expect(game.gameState.battlefields.zaun?.controller).toBeNull();
  });

  // ── control: the replacement and the trigger with cards to draw ───────────────────────

  test("control (deck [d1,d2]): conquering at 7 without every battlefield scored draws d1 INSTEAD of the point (P1 stays 7), and the Conquer trigger still fires — discard d1 (forced), draw d2; nobody burns out (471.1.b.1, 471.2.a)", async () => {
    const game = await board({ p1Deck: ["d1", "d2"], p1Trash: [] }).build();
    await conquerWarrens(game);
    expect(game.gameState.battlefields.zaun?.controller).toBe(P1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["zaun"]); // it WAS scored — only the point was replaced
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zaun", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.p1.hand()).toEqual(["d2"]);
    expect(game.p1.trash()).toEqual(["d1"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p2.points()).toBe(6);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ── (a) trash [t1]: two separate single Burn Outs, P2 wins at the Cleanup after the trigger ─────

  test("(a) the Zaun Warrens Conquer trigger DOES fire even though the point became a draw: after the conquer P1 controls the Warrens, has scored it, and its trigger is the pending chain item (471.2.a)", async () => {
    const game = await board().build();
    await conquerWarrens(game);
    expect(game.gameState.battlefields.zaun?.controller).toBe(P1);
    expect(game.locationOf("sarge")).toBe("zaun");
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["zaun"]);
    expect(game.p1.points()).toBe(7); // no Final Point
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zaun", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  });

  test("(a) the replacement draw hits the empty deck → Burn Out A#1: recycle [t1], P2 6→7 (not immediate — 7–7, nobody wins), then P1 draws t1; all of this is done by the time the trigger is pending (471.1.b.1, 431.2.b–d)", async () => {
    // Expected: right after the conquer P2 = 7, P1 hand = [t1], trash = [], deck = [], game not over.
    // Actual: the engine performs the 'draw instead' as a raw zone move — an empty deck yields no card and
    // NO Burn Out: P2 stays 6, P1's hand stays empty and t1 is still in the trash.
    const game = await board().build();
    await conquerWarrens(game);
    expect(game.isOver()).toBe(false);
    expect(game.p2.points()).toBe(7);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toEqual(["t1"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zaun", triggered: true })]);
  });

  test("(a) full line — trigger resolves: discard t1 (only card), draw 1 → Burn Out B#1 (a NEW action, again a 'first'): recycle [t1], P2 7→8 (not immediate), draw t1; trigger leaves the chain → Cleanup: 8 > 7 → P2 WINS. Net: P2 +2, P1 ends on 7 holding [t1] and the Warrens", async () => {
    // Expected: winner P2 at 8–7 with P1's hand = [t1] after two separate single Burn Outs.
    // Actual: only the trigger's draw burns out (Burn Out A never happened) → 7–7, game continues.
    const game = await board().build();
    await conquerWarrens(game);
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toEqual(["t1"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.gameState.battlefields.zaun?.controller).toBe(P1);
  });

  test("(a) what the engine does agree on: the trigger's own 'draw 1' from the empty deck IS a Burn Out — t1 is recycled and drawn, P2 gains (at least) that point, and that single first-in-sequence Burn Out is not an immediate win (431.3.c.1 covers only later ones)", async () => {
    const game = await board().build();
    await conquerWarrens(game);
    const p2Before = game.p2.points();
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    await game.settle(); // its forced discard is a choice of its own now that the replacement draw refilled the hand
    expect(game.p1.hand()).toEqual(["t1"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p2.points()).toBe(p2Before + 1);
    expect(game.p1.points()).toBe(7);
  });

  // ── (b) every battlefield scored → the real Final Point, win before the trigger resolves ─────

  test("(b) P1 Held 'other' in its Beginning Phase (6→7) and then conquers the Warrens: every battlefield scored → the Final Point via Conquer → 8; the Cleanup after the move ends the game for P1 BEFORE the discard/draw resolves — no draw, no Burn Out, P2 stays 6 (471.1.b.1, 319.8/319.3, 323.1)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .points(P2, 6)
      .fillDecks({ main: 0, runes: 12 })
      .deck(P2, [SKULKER, SKULKER, SKULKER])
      .deck(P1, [SKULKER], ["d1"]) // exactly the Draw-Step card → deck empty by the Action Phase
      .battlefield("zaun", { controller: null, def: ZAUN_WARRENS, inert: false, owner: P1 })
      .battlefield("other", { controller: P1, owner: P2 })
      .unit(P1, "other", { might: 2, name: "Keeper" }, "keeper")
      .unit(P1, "base", VANGUARD_SERGEANT, "sarge")
      .trash(P1, SKULKER, "t1")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["other"]);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
    await conquerWarrens(game);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(6);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["other", "zaun"]);
    // The trigger never resolved: nothing discarded, nothing drawn, no Burn Out.
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.trash()).toEqual(["t1"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) trash also empty: repeated Burn Outs during the conquer itself ─────────────────

  test("(c) trash ALSO empty: the replacement draw → Burn Out #1 (deck stays empty, P2 7, no win) → retry → Burn Out #2 → P2 8 > 7 → P2 wins IMMEDIATELY during the conquer (431.3, 431.3.c.1) — before any Cleanup and before the Zaun Warrens trigger could resolve; P1 never draws", async () => {
    // Expected: game over for P2 (8) straight out of the move; the trigger never gets a priority window.
    // Actual: the replacement draw does nothing (no Burn Out); the game only ends later, when the TRIGGER's
    // draw burns out twice — so right after the conquer the game is still live at 7–6.
    const game = await board({ p1Trash: [] }).build();
    await conquerWarrens(game);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toEqual([]);
  });

  test("(c) end state either way: P2 finishes on exactly 8 (the win is immediate on the second Burn Out of a sequence — no third), P1 on 7 with an empty hand, deck and trash", async () => {
    const game = await board({ p1Trash: [] }).build();
    await conquerWarrens(game);
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
  });
});
