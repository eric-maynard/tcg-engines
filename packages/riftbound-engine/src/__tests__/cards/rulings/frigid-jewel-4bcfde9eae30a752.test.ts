/**
 * Ruling 4bcfde9eae30a752 — Frigid Jewel (UNL-074 → unl-074-219) · Gear · Mind · [2]
 *   "When you draw your second card each turn, give a friendly unit +2 [Might] this turn."
 *
 * Q: I play Frigid Jewel on my turn, after my Beginning-Phase draw. If I draw again later, does it still
 *    trigger, or has the turn's draw already been "used up"?
 * A: It still triggers. The mandatory Beginning-Phase draw is the FIRST card of the turn; the Jewel is waiting
 *    for the SECOND one. It does not matter that the first draw happened before the Jewel was on the board —
 *    only that the second draw happens while it is.
 * Rules: 383.2.c (a trigger's condition is evaluated after the event), 413.2 (the Draw Step's card is the
 *        turn's first draw), 316 ("each turn" counts events over the whole turn, not since the card arrived).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FRIGID_JEWEL = "unl-074-219";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** Roll into P1's turn (so P1 has taken the Beginning-Phase draw), tap two runes and put the Jewel on the board. */
async function jewelOnBoardAfterTheFirstDraw(): Promise<Game> {
  const game = await scenario()
    .turn(2)
    .active(P2)
    .unit(P1, "base", unit(3, "Ally"), "ally")
    .hand(P1, FRIGID_JEWEL, "jewel")
    .build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  expect(game.p1.hand()).toHaveLength(2); // the Jewel plus the turn's first (mandatory) draw

  await game.p1.tapRunes(2);
  await game.p1.play("jewel");
  await game.settle();
  expect(game.zoneOf("jewel")).toBe("base");
  return game;
}

describe("Ruling 4bcfde9eae30a752 — Frigid Jewel waits for the turn's SECOND draw", () => {
  test("the Beginning-Phase card was draw #1, so the next draw is #2 and fires the Jewel", async () => {
    const game = await jewelOnBoardAfterTheFirstDraw();

    await game.p1.do("drawCard", { count: 1 }); // the turn's SECOND draw

    expect(game.chain()).toMatchObject([{ cardId: "jewel", triggered: true }]);
    // rule 402.2 — the Ally is the only friendly unit, so it is bound without asking.
    await game.settle();
    expect(game.state("ally").might).toBe(5);
  });

  test("the Beginning-Phase draw itself is only draw #1, so simply playing the Jewel changes nothing", async () => {
    const game = await jewelOnBoardAfterTheFirstDraw();

    expect(game.chain()).toEqual([]);
    expect(game.state("ally").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
