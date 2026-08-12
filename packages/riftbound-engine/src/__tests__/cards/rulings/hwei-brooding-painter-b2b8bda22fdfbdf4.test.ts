/**
 * Ruling b2b8bda22fdfbdf4 — Hwei, Brooding Painter (UNL-080 → unl-080-219) · 5 Might
 *   "When I move, draw 1, then discard 1. Then, do the following based on the discarded card's type: …"
 *
 * Q: My Hwei is attacking but is stunned at a battlefield and the defender has lower Might. When he moves
 *    back to base, does his move ability trigger?
 * A: No. Going home after combat is a RECALL, not a Move, and recalls never trigger move abilities. That
 *    holds whether or not Hwei is stunned and whatever the defender's Might: as long as defenders are still
 *    there when combat damage is done, the attackers are Recalled.
 * Rules: 450/451.1 (a Recall is not a Move — no move triggers), 461.1.a.2 (defenders remain ⇒ attackers
 *        are Recalled), 453 (Recall = to base, state unchanged).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HWEI = "unl-080-219";

/**
 * P1's turn. Hwei walks from base into bf1 where P2 has a SMALLER (3 Might) defender; Hwei is stunned, so
 * he deals no combat damage and the defender survives — the exact position in the question.
 */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small Guard" }, "guard")
    .unit(P1, "base", HWEI, "hwei", { stunned: true });
}

describe("Ruling b2b8bda22fdfbdf4 — the post-combat recall is not a Move, so Hwei's trigger stays silent", () => {
  test("the Standard Move INTO the battlefield is a real Move: Hwei's trigger fires there", async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    await game.p1.move("hwei", "bf1");
    await game.settle();
    expect(game.p1.deck().length).toBe(deckBefore - 1); // "draw 1"
    expect(game.p1.trash().length).toBe(1); // "then discard 1"
  });

  test("ruling: the attack fails (a stunned attacker kills nothing) and Hwei is RECALLED to base", async () => {
    const game = await board().build();
    await game.p1.move("hwei", "bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("battlefield-bf1"); // defender still there
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.locationOf("hwei")).toBe("base");
    expect(game.zoneOf("hwei")).toBe("base");
  });

  test("ruling: that recall fires NOTHING — no second draw/discard from Hwei's move ability", async () => {
    const game = await board().build();
    const deckBefore = game.p1.deck().length;
    await game.p1.move("hwei", "bf1");
    await game.settle();

    const deckAfterMove = game.p1.deck().length;
    const trashAfterMove = game.p1.trash().length;
    expect(deckBefore - deckAfterMove).toBe(1); // exactly ONE draw happened all told
    expect(trashAfterMove).toBe(1); // exactly ONE discard
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the recall did not change Hwei's state either — he comes home exhausted, as he left", async () => {
    const game = await board().build();
    await game.p1.move("hwei", "bf1");
    await game.settle();
    expect(game.state("hwei").isExhausted).toBe(true);
  });
});
