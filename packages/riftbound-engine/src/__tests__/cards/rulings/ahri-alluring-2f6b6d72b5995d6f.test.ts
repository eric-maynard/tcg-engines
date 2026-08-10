/**
 * Ruling 2f6b6d72b5995d6f — Ahri, Alluring (OGN-066 → ogn-066-298) · Champion Unit · Calm · [5] · 4 Might
 *     "When I hold, you score 1 point."
 *
 * Q: Do two Ahri, Alluring at the same battlefield stack — 3 points for holding it?
 * A: Yes. Each copy's triggered ability fires on the hold: 1 (the hold itself) + 1 + 1 = 3 points from that battlefield.
 * Rules: 469.2 / 315.2.b (Hold scores 1), 383 (each permanent's trigger is its own ability; both trigger), 383.3.d
 *        (same-controller simultaneous triggers — the controller may order them).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const AHRI_ALLURING = "ogn-066-298";

/** End of P2's turn 2; P1 controls bf A with TWO Ahri, Alluring on it. Victory far away. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .battlefield("A", { controller: P1 })
    .battlefield("B", { controller: P2 })
    .unit(P1, "A", AHRI_ALLURING, "ahri1")
    .unit(P1, "A", AHRI_ALLURING, "ahri2")
    .unit(P2, "B", { might: 2, name: "Their Holder" }, "theirs");
}

describe("Ruling 2f6b6d72b5995d6f — two Ahri, Alluring on one held battlefield = 3 points", () => {
  test("P1's Beginning Phase: the hold scores 1 immediately and BOTH Ahri triggers are put on the chain (two separate items under P1)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    if (game.decision()?.kind === "order") {
      expect(game.decision()).toMatchObject({ kind: "order", seat: P1 });
      await game.acceptTriggerOrder();
    }
    const items = game.chain();
    expect(items).toHaveLength(2);
    expect(items.map((c) => c.cardId).sort()).toEqual(["ahri1", "ahri2"]);
    expect(items.every((c) => c.controller === P1 && c.triggered)).toBe(true);
  });

  test("both resolve: 1 (hold) + 1 + 1 = 3 points for P1 from that single battlefield; P2 scores nothing", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(3);
    expect(game.p2.points()).toBe(0);
    expect(game.gameState.scoredThisTurn[P1]).toEqual(["A"]);
    expect(game.violations()).toEqual([]);
  });

  test("control: a single Ahri there gives 1 + 1 = 2", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .battlefield("A", { controller: P1 })
      .unit(P1, "A", AHRI_ALLURING, "ahri1")
      .build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.p1.points()).toBe(2);
  });
});
