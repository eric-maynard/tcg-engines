/**
 * Ruling 24db304e7e6fb417 — Traveling Merchant (OGN-185 → ogn-185-298) · 2 Might
 *   "When I move, discard 1, then draw 1."
 *
 * Q: What happens if I move the Traveling Merchant while I have no cards in hand?
 * A: You skip the discard (do as much as you can) and still draw 1. The two instructions resolve
 *    independently — the text is not "discard 1 TO draw 1", so being unable to discard does not stop
 *    the draw. The move itself (and any showdown it opens) is unaffected.
 * Rules: 359.3.b (do as much as you can), 359.3.e (instructions execute in order, independently).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const TRAVELING_MERCHANT = "ogn-185-298";
const junk = (n: string) => ({ cardType: "unit", energyCost: 1, might: 1, name: `Junk ${n}` }) as const;

/** P1's turn. Merchant in base, an empty uncontrolled bfX to walk onto, a known deck top `d1`. */
function board(handCards: string[]) {
  let b = scenario()
    .battlefield("bfX", { controller: null })
    .unit(P1, "base", TRAVELING_MERCHANT, "merchant")
    .deck(P1, [junk("D1"), junk("D2")], ["d1", "d2"]);
  for (const a of handCards) {
    b = b.hand(P1, junk(a), a);
  }
  return b;
}

describe("Ruling 24db304e7e6fb417 — moving the Merchant with an empty hand skips the discard and still draws", () => {
  test("empty hand: the trigger asks nothing, discards nothing, and P1 ends up holding exactly the drawn card", async () => {
    const game = await board([]).build();
    expect(game.p1.hand()).toEqual([]);
    await game.p1.move("merchant", "bfX");
    expect(game.chain().filter((c) => c.cardId === "merchant" && c.triggered)).toHaveLength(1);
    await game.settle();
    expect(game.p1.trash()).toEqual([]); // nothing was discarded
    expect(game.p1.hand()).toEqual(["d1"]); // the draw still happened
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });

  test("the move and its (non-combat) showdown still happen — the Merchant conquers bfX", async () => {
    const game = await board([]).build();
    await game.p1.move("merchant", "bfX");
    await game.settle();
    expect(game.zoneOf("merchant")).toBe("battlefield-bfX");
    expect(game.gameState.battlefields.bfX?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("control: with exactly one card in hand it IS discarded, then the draw replaces it", async () => {
    const game = await board(["h1"]).build();
    await game.p1.move("merchant", "bfX");
    await game.settle();
    expect(game.p1.trash()).toEqual(["h1"]);
    expect(game.p1.hand()).toEqual(["d1"]);
  });
});
