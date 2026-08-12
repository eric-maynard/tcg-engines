/**
 * Ruling 41e41b1f2ce5bd38 — Yasuo, Windrider (OGN-205 → ogn-205-298) · [5][chaos] · 4 Might
 *     "[Ganking] The third time I move in a turn, you score 1 point."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [Action] · [2][chaos] "Move a friendly unit and ready it."
 *
 * Q: When I pay to move Yasuo back to my base, does that count as one of the three movements?
 * A: Yes. Moving is a Game Object changing Location on the board, and your base is a Location — so a
 *    voluntary move to base is a movement like any other. Movements 1 and 2 don't do anything by
 *    themselves but they count towards the third, which is the one that scores.
 * Rules: 407.1 (moving = between two Locations on the board; base is a Location), 383 (the trigger counts
 *        the third move this turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const YASUO_WINDRIDER = "ogn-205-298";
const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P1 already controls bf1 and bf2 (each with a holder) so no showdowns get in the way. Yasuo is in base. */
function board() {
  return scenario()
    .victoryScore(20)
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 1, name: "Holder 1" }, "h1")
    .unit(P1, "bf2", { might: 1, name: "Holder 2" }, "h2")
    .unit(P1, "base", YASUO_WINDRIDER, "yasuo")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

describe("Ruling 41e41b1f2ce5bd38 — a voluntary move to your own base counts towards Yasuo's third move", () => {
  test("move 1 (base → bf1) scores nothing on its own", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    expect(game.locationOf("yasuo")).toBe("bf1");
    expect(game.p1.points()).toBe(0);
  });

  test("move 2 is the move TO BASE (Ride the Wind, which also readies him): still no point — but it has been counted", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1");
    await game.settle();
    await game.p1.cast("rtw", { targets: "yasuo" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("yasuo")).toBe("base");
    expect(game.state("yasuo").isReady).toBe(true);
    expect(game.p1.points()).toBe(0);
  });

  test("ruling: because the move to base counted, the NEXT move (base → bf2) is the third and scores 1 point", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1"); // 1
    await game.settle();
    await game.p1.cast("rtw", { targets: "yasuo" }); // 2 — to base
    await game.settle();
    await game.p1.pick("base");
    await game.settle();
    expect(game.p1.points()).toBe(0);
    await game.p1.move("yasuo", "bf2"); // 3
    await game.settle();
    expect(game.locationOf("yasuo")).toBe("bf2");
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.scoredThisTurn[P1]).toEqual([]); // not a battlefield score — Yasuo's own point
    expect(game.violations()).toEqual([]);
  });

  test("counter-check: without the trip to base only two moves happen and no point is scored", async () => {
    const game = await board().build();
    await game.p1.move("yasuo", "bf1"); // 1
    await game.settle();
    await game.p1.cast("rtw", { targets: "yasuo" }); // 2 — straight to bf2
    await game.settle();
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("yasuo")).toBe("bf2");
    expect(game.p1.points()).toBe(0);
  });
});
