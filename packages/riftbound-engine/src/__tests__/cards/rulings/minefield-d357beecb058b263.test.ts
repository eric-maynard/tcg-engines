/**
 * Ruling d357beecb058b263 — Minefield (SFD-212 → sfd-212-221) · Battlefield
 *     "When you conquer here, put the top 2 cards of your Main Deck into your trash."
 *
 * Q: Both players at 7 (of 8). I have no cards in deck and conquer Minefield "for the win". Do I win before Minefield's
 *    trigger mills my empty deck and Burns me Out (handing the opponent their 8th point)?
 * A: If this conquer is your LAST unscored battlefield this turn (you held/conquered the other one earlier): yes — the
 *    Winning Point is gained as part of the Score itself (466.1) and the game ends immediately; Minefield's conquer
 *    trigger (466.2) never resolves. If instead you have NOT scored the other battlefield this turn, the Final-Point rule
 *    makes you draw instead of scoring (stay at 7); then the mill from an empty deck Burns you Out and the opponent gets
 *    their 8th point and wins.
 * Rules: 466.1.b.2 / 471.1.b (Final Point: conquer at VS−1 draws unless every battlefield was scored this turn),
 *        466.2 (conquer triggers after the score), 431 (Burn Out: opponent gains 1), 469 (hold = a score).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MINEFIELD = "sfd-212-221";
const CLEAVE = "ogn-004-298"; // deck/trash filler with a known identity

/**
 * Case A — P2's turn 2 about to end. Score 6 : 7 (to 8). P1 holds bf2 (Holder) and will hold-score it at the start of
 * the coming turn (→ 7), then draw their LAST card. P2 holds Minefield (live text) with a 1-Might Sapper. P1's Raider (5)
 * waits in base. P1's trash has a few cards (Burn Out fodder, should it ever come to that).
 */
function lastBattlefieldBoard() {
  return scenario()
    .active(P2)
    .victoryScore(8)
    .points(P1, 6)
    .points(P2, 7)
    .fillDecks({ main: 0, runes: 12 })
    .deck(P1, [CLEAVE], ["lastcard"])
    .deck(P2, [CLEAVE, CLEAVE, CLEAVE])
    .trash(P1, CLEAVE, "t1")
    .trash(P1, CLEAVE, "t2")
    .trash(P1, CLEAVE, "t3")
    .battlefield("mine", { controller: P2, def: MINEFIELD, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "mine", { might: 1, name: "Sapper" }, "sapper")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider");
}

/**
 * Case B — P1's turn, main phase, 7 : 7 (to 8). P1 has scored NOTHING this turn (bf2 is P2's). P1's deck has `deck`
 * cards; trash has three. P2 holds Minefield with a 1-Might Sapper; P1's Raider (5) in base.
 */
function notLastBattlefieldBoard(deck: number) {
  return scenario()
    .victoryScore(8)
    .points(P1, 7)
    .points(P2, 7)
    .fillDecks({ main: 0, runes: 12 })
    .deck(P1, Array.from({ length: deck }, () => CLEAVE), Array.from({ length: deck }, (_, i) => `d${i}`))
    .deck(P2, [CLEAVE, CLEAVE, CLEAVE])
    .trash(P1, CLEAVE, "t1")
    .trash(P1, CLEAVE, "t2")
    .trash(P1, CLEAVE, "t3")
    .battlefield("mine", { controller: P2, def: MINEFIELD, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "mine", { might: 1, name: "Sapper" }, "sapper")
    .unit(P2, "bf2", { might: 2, name: "Their Holder" }, "theirs")
    .unit(P1, "base", { might: 5, name: "Raider" }, "raider");
}

describe("Ruling d357beecb058b263 — conquering Minefield at 7 with an empty deck: win first if it's your last battlefield, otherwise Burn Out loses it", () => {
  test("case A setup: P1 holds bf2 at the start of the turn (6 → 7, bf2 scored this turn) and draws the last card — deck now EMPTY, game not over", async () => {
    const game = await lastBattlefieldBoard().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.hand()).toContain("lastcard");
    expect(game.isOver()).toBe(false);
  });

  test("case A: P1 then conquers Minefield — every battlefield scored this turn ⇒ the Winning Point (8) is gained as part of the score and P1 wins IMMEDIATELY; Minefield's mill never resolves (deck untouched-empty, trash unchanged, P2 still 7)", async () => {
    const game = await lastBattlefieldBoard().build();
    await game.advanceTurn();
    const trash0 = game.p1.trash().length;
    await game.p1.move("raider", "mine");
    const r = await game.settle();
    expect(game.zoneOf("sapper")).toBe("trash");
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.p2.points()).toBe(7); // no Burn Out point
    expect(game.p1.deck()).toEqual([]); // no refill-shuffle happened
    expect(game.p1.trash()).toHaveLength(trash0); // nothing milled
  });

  test("case B (as asked, deck empty): P1 has NOT scored bf2 this turn — the conquer at 7 cannot give the 8th point (Final Point rule), P1 stays at 7, and the empty deck Burns P1 Out: P2 gets the 8th point and WINS", async () => {
    const game = await notLastBattlefieldBoard(0).build();
    expect(game.p1.deck()).toEqual([]);
    await game.p1.move("raider", "mine");
    const r = await game.settle();
    expect(game.zoneOf("sapper")).toBe("trash");
    expect(game.gameState.battlefields.mine?.controller).toBe(P1); // the conquer itself happened
    expect(game.p1.points()).toBe(7);
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
  });

  test("case B step by step (one card left so the Final-Point draw succeeds): conquer → P1 DRAWS instead of scoring (7) → Minefield's trigger mills 2 from the now-empty deck → Burn Out → P2 to 8 and wins", async () => {
    const game = await notLastBattlefieldBoard(1).build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("raider", "mine");
    // fight it through but stop once the conquer has happened and Minefield's trigger is on the chain
    for (let i = 0; i < 10 && !game.chain().some((c) => c.cardId === "mine"); i++) {
      const d = game.decision();
      if (game.isOver() || d?.kind !== "action") {
        break;
      }
      await game.seat(d.seat).pass();
    }
    expect(game.gameState.battlefields.mine?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7); // drew instead of the 8th point
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p1.hand()).toContain("d0");
    expect(game.p1.deck()).toEqual([]);
    expect(game.isOver()).toBe(false);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mine", controller: P1, triggered: true })]);
    // the mill resolves against an empty deck → Burn Out
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.winner()).toBe(P2);
    expect(game.p2.points()).toBe(8);
    expect(game.p1.points()).toBe(7);
  });
});
