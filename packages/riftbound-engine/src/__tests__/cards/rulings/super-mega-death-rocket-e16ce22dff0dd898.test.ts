/**
 * Ruling e16ce22dff0dd898 — Super Mega Death Rocket! (OGN-252 → ogn-252-298) · spell · [4][rainbow]
 *   "When you conquer, you may discard 1 to return this from your trash to your hand."
 *
 * Q: With 0 cards in hand and the Rocket in my trash, I conquer at 7 points (so I draw instead of scoring).
 *    Can I use the drawn card to pay the Rocket's discard?
 * A: Yes. The draw for the final point happens as part of Scoring, BEFORE "when you conquer" triggers are put on the
 *    Chain — so by the time the Rocket's trigger asks for its discard the card is already in hand.
 * Rules: 471.1.b.1 (at 1 point from the Victory Score without every battlefield scored, draw instead of the point),
 *        471.2 (score triggers fire after that), 383.3.b / 204.3.a (the "discard 1 to …" is the trigger's base cost).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMDR = "ogn-252-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — the card that will be drawn and then discarded

/** P1 sits at 7 of 8 points with an EMPTY hand and the Rocket in the trash; bf2 is P2's, so not every battlefield is scored. */
function board() {
  return scenario()
    .victoryScore(8)
    .points(P1, 7)
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
    .trash(P1, SMDR, "rocket")
    .deckTop(P1, FILLER, "drawn");
}

/** P1 conquers the empty battlefield. */
async function conquer(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.hand()).toEqual([]);
  await game.p1.move("runner", "bf1");
  await game.p1.passFocus(); // the arrival opens a non-combat showdown; conquering happens when it closes
  await game.p2.passFocus();
  return game;
}

describe("Ruling e16ce22dff0dd898 — the final-point draw happens before the conquer trigger, so it can pay the Rocket's discard", () => {
  test("conquering at 7 points draws a card instead of scoring — the score stays at 7 and the game is not over", async () => {
    const game = await conquer();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toEqual(["drawn"]);
    expect(game.isOver()).toBe(false);
  });

  test("the Rocket's 'when you conquer' is then offered, and the drawn card makes its discard payable", async () => {
    const game = await conquer();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "rocket" } });
    expect((d as { canAccept?: boolean }).canAccept ?? true).toBe(true);
  });

  test("accepting discards the just-drawn card and returns the Rocket from the trash to hand", async () => {
    const game = await conquer();
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("drawn")).toBe("trash");
    expect(game.zoneOf("rocket")).toBe("hand");
    expect(game.p1.hand()).toEqual(["rocket"]);
    expect(game.p1.points()).toBe(7);
    expect(game.violations()).toEqual([]);
  });

  test("declining leaves both cards where they are — the draw is not undone", async () => {
    const game = await conquer();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("rocket")).toBe("trash");
    expect(game.p1.hand()).toEqual(["drawn"]);
  });

  test("contrast: below the final point the conquer SCORES (no draw), so an empty hand cannot pay the discard and the Rocket is never asked", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 3, name: "Runner" }, "runner")
      .trash(P1, SMDR, "rocket")
      .build();
    await game.p1.move("runner", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.p1.points()).toBe(7); // a real point, not a draw
    expect(game.p1.hand()).toEqual([]);
    expect(game.decision()?.kind).not.toBe("yes-no"); // unpayable cost ⇒ the item is removed unasked (404.2)
    expect(game.zoneOf("rocket")).toBe("trash");
  });
});
