/**
 * Aspirant's Climb — ogn-276-298 · Battlefield
 *
 *   Increase the points needed to win the game by 1.
 *
 * Rules: 194.3 (Victory Score is 8 by default), 194.3.a (card effects may alter it), 194.2 / 472
 * (win = points ≥ Victory Score AND more than any opponent, checked in a cleanup), 471.1.b (the Final
 * Point restriction is measured against "the Victory Score of the Mode of Play": at score−1 a CONQUER
 * only scores if you scored every battlefield this turn, otherwise you draw 1), 471.1.a.1 (points from
 * non-conquer sources — Hold, Burn Out — are never restricted), 431.3.c.1 (a Burn Out point that reaches
 * the Victory Score wins immediately), 365.1 (a battlefield's passive is active while it is in play).
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. 8 is no longer a win: a player sitting on 8 after a cleanup keeps playing; the 9th point wins.
 *  2. The Final Point window MOVES with the threshold: at 7 (two short of 9) a lone conquer is an
 *     ordinary point (7→8) where the default rules would have handed out a card instead; at 8 a conquer
 *     of one of two battlefields draws a card (stays 8); at 8 conquering the ONLY battlefield in play is
 *     "every battlefield" → 9 → win.
 *  3. Non-conquer points ignore the window: holding at 8 → 9 wins at the start of your turn; an opponent's
 *     Burn Out at 8 → 9 wins for you on THEIR turn.
 *  4. Symmetric and ownership-blind: the opponent of the player who brought/controls it also needs 9.
 *  5. It stacks: two copies in play → 10 to win, so 9 is not enough.
 *  6. Registry: exactly one static `increase-victory-score` (amount 1) — no trigger, no activated ability.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-276-298";
const FILLER = "ogn-175-298";

/** P2 is about to end the turn; P1 holds bf1 (Aspirant's Climb, live) with `pts` points. */
function aboutToHold(pts: number, opts: { inert?: boolean } = {}) {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1, def: CARD, inert: opts.inert ?? false, owner: P1 })
    .points(P1, pts)
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder");
}

/** P1's main phase with `pts` points; bf1 = Aspirant's Climb held by P2's 1-Might unit; optional second battlefield. */
function aboutToConquer(pts: number, opts: { secondBattlefield?: boolean } = {}) {
  const s = scenario()
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
    .points(P1, pts)
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 1, name: "Defender" }, "def");
  if (opts.secondBattlefield) {
    s.battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 5, name: "Far Wall" }, "wall");
  }
  return s;
}

describe("Aspirant's Climb (ogn-276-298)", () => {
  test("registry payload: a single static 'increase-victory-score' by 1 and nothing else", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Aspirant's Climb" });
    expect(def?.abilities).toEqual([{ effect: { amount: 1, type: "increase-victory-score" }, type: "static" }]);
    // The Mode of Play's own score is untouched — the +1 is a live passive layered on top (365.1).
    const game = await aboutToHold(0).build();
    expect(game.gameState.victoryScore).toBe(8);
  });

  test("control (battlefield inert): holding at 7 → 8 wins the game under the default Victory Score", async () => {
    const game = await aboutToHold(7, { inert: true }).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("with Aspirant's Climb in play, holding at 7 → 8 does NOT win: the game goes on into P1's main phase", async () => {
    const game = await aboutToHold(7).build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(false);
    expect(game.winner()).toBeUndefined();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
  });

  test("the 9th point wins: holding at 8 → 9 (a Hold point is never subject to the Final Point restriction, 471.1.a.1)", async () => {
    const game = await aboutToHold(8).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("Final Point window moves up: at 7, conquering ONE of two battlefields is an ordinary point (7 → 8, no card drawn, no win)", async () => {
    const game = await aboutToConquer(7, { secondBattlefield: true }).build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0); // 471.1.b.1 did NOT convert the point into a draw
    expect(game.isOver()).toBe(false);
  });

  test("control for the previous test: the same conquer at 7 WITHOUT Aspirant's Climb draws a card instead (stays 7)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .points(P1, 7)
      .unit(P1, "base", { might: 3 }, "raider")
      .unit(P2, "bf1", { might: 1 }, "def")
      .unit(P2, "bf2", { might: 5 }, "wall")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("at 8 (one short of 9), conquering one of two battlefields draws 1 instead of scoring (471.1.b.1) — still 8, no win", async () => {
    const game = await aboutToConquer(8, { secondBattlefield: true }).build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.isOver()).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("at 8, conquering the ONLY battlefield in play = 'scored every battlefield' → Final Point → 9 → P1 wins", async () => {
    const game = await aboutToConquer(8).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("symmetric: the OPPONENT of the card's owner also needs 9 — P2 holding at 7 reaches 8 and the game continues", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P1 })
      .points(P2, 7)
      .unit(P2, "bf1", { might: 3 }, "theirs")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.isOver()).toBe(false);
  });

  test("stacks: two Aspirant's Climbs in play → 10 to win; holding at 8 → 9 is not enough", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P2, def: CARD, inert: false, owner: P2 })
      .points(P1, 8)
      .unit(P1, "bf1", { might: 3 }, "holder")
      .build();
    await game.advanceTurn();
    expect(game.p1.points()).toBe(9);
    expect(game.isOver()).toBe(false);
    // …and the next Hold (9 → 10) does win.
    await game.advanceTurn(); // P2's turn
    expect(game.isOver()).toBe(false);
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(10);
    expect(game.winner()).toBe(P1);
  });

  test("a Burn Out point is unrestricted too: P1 burning out on the draw step hands P2 the 9th point and P2 wins on P1's turn (431.3.c.1)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks({ main: 0, runes: 12 })
      .battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P1 })
      .points(P2, 8)
      .trash(P1, FILLER, "t1")
      .deck(P2, [FILLER, FILLER])
      .build();
    expect(game.isOver()).toBe(false); // 8 is not a win for P2 either
    await game.p2.endTurn();
    await game.settle();
    expect(game.p2.points()).toBe(9);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
