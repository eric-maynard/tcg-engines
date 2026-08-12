/**
 * Ruling 3711eeb4ab47b743 — Traveling Merchant (OGN-185 → ogn-185-298) · Unit · [2] · 2 Might
 *   "When I move, discard 1, then draw 1."
 *
 * Q: Does Traveling Merchant still draw when my hand is empty (nothing to discard)?
 * A: Yes. "Discard 1, then draw 1" is two independent instructions; each resolves as much as it can.
 *    With an empty hand the discard simply does nothing and the draw still happens.
 *    (Had the card said "discard 1 TO draw 1" or "Discard 1. If you do…", the draw would be blocked.)
 * Rules: 359.3.e (each instruction of a resolving effect is carried out as fully as possible),
 *        359.3.e.14 / "if you do" linkage (absent here), 402.x (no cost is being paid).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MERCHANT = "ogn-185-298";
const SKULKER = "ogn-175-298"; // vanilla 3-Might unit, used as deck filler with a known alias

/** P1's turn. The Merchant is ready in P1's base; bf1 is empty and uncontrolled so the move is legal. */
function board() {
  return scenario().battlefield("bf1", { controller: null }).unit(P1, "base", MERCHANT, "merchant").deck(P1, [SKULKER, SKULKER], ["d1", "d2"]);
}

/** Move the Merchant to bf1 and let its trigger resolve, answering the discard pick with `discard` when one is asked. */
async function moveAndResolve(game: Game, discard?: string): Promise<void> {
  await game.p1.move("merchant", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  if (discard !== undefined && game.decision()?.kind === "pick") {
    await game.p1.pick(discard);
  }
  await game.settle();
}

describe("Ruling 3711eeb4ab47b743 — Traveling Merchant draws even with an empty hand", () => {
  test("premise: P1's hand really is empty when the Merchant moves, and the move puts its trigger on the chain", async () => {
    const game = await board().build();
    expect(game.p1.hand()).toEqual([]);
    await game.p1.move("merchant", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "merchant", triggered: true })]);
    expect(game.p1.hand()).toEqual([]); // nothing has resolved yet
  });

  test("ruling: with nothing to discard the discard does nothing and the draw still happens — P1 ends with exactly the drawn card", async () => {
    const game = await board().build();
    await moveAndResolve(game);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.p1.trash()).toEqual([]); // the empty discard trashed nothing
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("merchant")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("no prompt is raised for an impossible discard: P1 is never asked what to discard", async () => {
    const game = await board().build();
    await game.p1.move("merchant", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.p1.hand()).toEqual(["d1"]);
  });

  test("contrast — with a card in hand both halves happen: that card is discarded AND a card is drawn (hand size unchanged)", async () => {
    const game = await board().hand(P1, SKULKER, "held").build();
    await moveAndResolve(game, "held");
    expect(game.p1.trash()).toEqual(["held"]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });
});
