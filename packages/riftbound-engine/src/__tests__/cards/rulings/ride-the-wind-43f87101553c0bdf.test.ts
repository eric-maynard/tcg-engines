/**
 * Ruling 43f87101553c0bdf — Ride the Wind (OGN-173 → ogn-173-298)
 *   "[Action] Move a friendly unit and ready it."
 *
 * Q: Can I score a conquest point on my OPPONENT'S turn by winning a showdown after Riding the Wind
 *    (or moving) a unit to a battlefield?
 * A: Yes — conquering is not restricted to your own turn. The opponent moves a unit to a battlefield,
 *    you ride in, win, and take the point. The only limit is per battlefield per turn, so two different
 *    battlefields both score inside the same opponent turn.
 * Rules: 466.5 / 471.2 (conquest and scoring happen whenever a combat resolves), 471.2.c (a battlefield
 *        scores at most once per turn).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P2's turn; two uncontrolled battlefields; P1 waits at home with two riders and two Ride the Winds. */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: null })
    .unit(P1, "base", { might: 8, name: "Guard One" }, "g1")
    .unit(P1, "base", { might: 8, name: "Guard Two" }, "g2")
    .unit(P2, "base", { might: 3, name: "Raider One" }, "r1")
    .unit(P2, "base", { might: 3, name: "Raider Two" }, "r2")
    .hand(P1, RIDE_THE_WIND, "rtw1")
    .hand(P1, RIDE_THE_WIND, "rtw2");
}

describe("Ruling 43f87101553c0bdf — conquest points can be scored on the opponent's turn", () => {
  test("P2 moves a unit to an uncontrolled battlefield, P1 rides in and wins ⇒ P1 scores, on P2's turn", async () => {
    const game = await board().build();
    expect(game.turnPlayer()).toBe(P2);

    await game.p2.move("r1", "bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2, controller: null });
    await game.p2.passFocus();

    await game.p1.cast("rtw1", { answers: ["bf1"], targets: ["g1"] });
    await game.settle();

    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.points()).toBe(0);
    expect(game.turnPlayer()).toBe(P2); // still the opponent's turn
    expect(game.violations()).toEqual([]);
  });

  test("the cap is per battlefield: a second, different battlefield scores again in the same opponent turn", async () => {
    const game = await board().build();

    await game.p2.move("r1", "bf1");
    await game.p2.passFocus();
    await game.p1.cast("rtw1", { answers: ["bf1"], targets: ["g1"] });
    await game.settle();
    expect(game.p1.points()).toBe(1);

    await game.p2.move("r2", "bf2");
    await game.p2.passFocus();
    await game.p1.cast("rtw2", { answers: ["bf2"], targets: ["g2"] });
    await game.settle();

    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(2);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("without riding in, P2 simply keeps the battlefield it walked into", async () => {
    const game = await board().build();
    await game.p2.move("r1", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.p1.points()).toBe(0);
  });
});
