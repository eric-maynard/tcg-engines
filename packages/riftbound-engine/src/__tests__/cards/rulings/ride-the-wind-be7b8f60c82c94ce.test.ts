/**
 * Ruling be7b8f60c82c94ce — Ride the Wind (OGN-173 → ogn-173-298) · [Action] · Chaos · [2][chaos]
 *     "Move a friendly unit and ready it."  (cited as the card that lets you score on the opponent's turn)
 *
 * Q: How can the 8th (final) point be earned?
 * A: Three ways. HOLDING a battlefield at the start of your turn while on 7 wins immediately. CONQUERING while
 *    on 7 only wins if every battlefield was scored this turn — conquering just one of two gives you a card
 *    draw instead of the point. Score both in the same turn and the second conquest wins.
 * Rules: 471.1.a (Hold at Victory Score − 1 wins), 471.1.b / 471.1.b.1 (Conquer at VS−1 draws a card unless all
 *        battlefields were scored this turn), 465 (each battlefield scores at most once per turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** Pass focus/priority for whoever is asked until the position is open again. */
async function passUntilOpen(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (d?.kind === "action" && (d.context === "showdown" || d.context === "chain")) {
      await game.seat(d.seat).pass();
      continue;
    }
    break;
  }
}

/** P1 on `points`, Victory Score 8. Both battlefields open, P1 has two Strikers in base, P2 sits at home. */
function openBoard(points: number) {
  return scenario()
    .turn(3)
    .victoryScore(8)
    .points(P1, points)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 4, name: "Strider" }, "strider")
    .unit(P1, "base", { might: 4, name: "Ranger" }, "ranger")
    .unit(P2, "base", { might: 4, name: "Homebody" }, "homebody");
}

describe("Ruling be7b8f60c82c94ce — the Final Point: hold at the start of your turn, or conquer every battlefield in one turn", () => {
  test("HOLD at 7/8: P1 still has a unit on the battlefield it controls when its turn begins → P1 wins on the spot", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .victoryScore(8)
      .points(P1, 7)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 4, name: "Homebody" }, "homebody")
      .build();
    expect(game.isOver()).toBe(false);
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("CONQUER one of two at 7/8: P1 takes bf1 but not every battlefield has scored this turn → a card is drawn instead of the point", async () => {
    const game = await openBoard(7).build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("strider", "bf1");
    await passUntilOpen(game);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.hand()).toHaveLength(hand0 + 1); // the replacement draw
    expect(game.violations()).toEqual([]);
  });

  test("…then taking the OTHER battlefield in the same turn scores every battlefield this turn → the 8th point lands and P1 wins", async () => {
    const game = await openBoard(7).build();
    await game.p1.move("strider", "bf1");
    await passUntilOpen(game);
    expect(game.p1.points()).toBe(7);
    await game.p1.move("ranger", "bf2");
    await passUntilOpen(game);
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
  });

  test("control below the cap: at 5/8 both conquests just score normally, 5 → 6 → 7, with no replacement draws", async () => {
    const game = await openBoard(5).build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("strider", "bf1");
    await passUntilOpen(game);
    expect(game.p1.points()).toBe(6);
    await game.p1.move("ranger", "bf2");
    await passUntilOpen(game);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.isOver()).toBe(false);
  });
});
